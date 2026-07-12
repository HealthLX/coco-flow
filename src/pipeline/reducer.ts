import type { Build, FhirTransformResult, FhirValidatorConfig, ValidationResult } from '../services/api'
import type { FhirDoc, FhirRowState } from './derive'
import { STAGE_ORDER, type PipelineState, type Selection, type StageId, type StageStatus } from './types'

export type PipelineAction =
  | { type: 'builds/loaded'; builds: Build[] }
  | { type: 'validatorConfig/loaded'; config: FhirValidatorConfig }
  | { type: 'select/builtin'; canonical: string }
  | { type: 'select/custom'; xsdFile: File | null; rootElement: string }
  | { type: 'select/xslt'; xsltFile: File | null }
  | { type: 'stage/start'; stage: StageId; at: number }
  | {
      type: 'stage/pass'
      stage: StageId
      at: number
      artifactCount?: number | null
      detail?: string | null
    }
  | { type: 'stage/fail'; stage: StageId; at: number; error: string; artifactCount?: number | null }
  | { type: 'stage/skip'; stage: StageId; detail?: string | null }
  | { type: 'generate/done'; xml: string; filename: string }
  | { type: 'canonical/edit'; xml: string }
  | { type: 'xsd/done'; result: ValidationResult }
  | { type: 'transform/done'; result: FhirTransformResult }
  | { type: 'fhirDocs/set'; docs: FhirDoc[] }
  | { type: 'fhirRow/set'; fileName: string; state: FhirRowState }
  | { type: 'fhirRows/reset'; fileNames: string[] }
  | { type: 'reset' }

function stage(id: StageId, state: StageStatus['state'] = 'idle'): StageStatus {
  return { id, state, startedAt: null, elapsedMs: null, artifactCount: null, detail: null, error: null }
}

function freshStages(): Record<StageId, StageStatus> {
  return {
    schema: stage('schema'),
    generate: stage('generate', 'blocked'),
    'validate-xsd': stage('validate-xsd', 'blocked'),
    transform: stage('transform', 'blocked'),
    fhir: stage('fhir', 'blocked'),
    'validate-fhir': stage('validate-fhir', 'blocked'),
    export: stage('export', 'blocked'),
  }
}

const EMPTY_SELECTION: Selection = {
  mode: 'builtin',
  canonical: null,
  xsdFile: null,
  rootElement: '',
  xsltFile: null,
}

export function initialState(): PipelineState {
  return {
    runId: 0,
    selection: EMPTY_SELECTION,
    stages: freshStages(),
    artifacts: {
      canonicalXml: null,
      canonicalFilename: null,
      canonicalDirty: false,
      xsdValidation: null,
      fhirResult: null,
      fhirDocs: [],
      fhirRows: {},
    },
    builds: [],
    validatorConfig: null,
  }
}

/** Reset `from` and every stage after it — used when an upstream input changes. */
function invalidateFrom(
  stages: Record<StageId, StageStatus>,
  from: StageId,
): Record<StageId, StageStatus> {
  const start = STAGE_ORDER.indexOf(from)
  const next = { ...stages }
  for (const id of STAGE_ORDER.slice(start)) {
    next[id] = stage(id, 'blocked')
  }
  return next
}

function patch(
  s: PipelineState,
  id: StageId,
  fields: Partial<StageStatus>,
): Record<StageId, StageStatus> {
  return { ...s.stages, [id]: { ...s.stages[id], ...fields } }
}

export function pipelineReducer(s: PipelineState, a: PipelineAction): PipelineState {
  switch (a.type) {
    case 'builds/loaded':
      return { ...s, builds: a.builds }

    case 'validatorConfig/loaded':
      return { ...s, validatorConfig: a.config }

    case 'select/builtin': {
      if (s.selection.mode === 'builtin' && s.selection.canonical === a.canonical) return s
      const base = initialState()
      return {
        ...base,
        runId: s.runId + 1,
        builds: s.builds,
        validatorConfig: s.validatorConfig,
        selection: { ...EMPTY_SELECTION, mode: 'builtin', canonical: a.canonical },
        stages: {
          ...base.stages,
          schema: { ...stage('schema', 'passed'), detail: a.canonical },
          generate: stage('generate', 'idle'),
        },
      }
    }

    case 'select/custom': {
      const base = initialState()
      const ready = !!a.xsdFile && a.rootElement.trim().length > 0
      return {
        ...base,
        runId: s.runId + 1,
        builds: s.builds,
        validatorConfig: s.validatorConfig,
        selection: {
          ...EMPTY_SELECTION,
          mode: 'custom',
          xsdFile: a.xsdFile,
          rootElement: a.rootElement,
        },
        stages: {
          ...base.stages,
          schema: {
            ...stage('schema', ready ? 'passed' : 'idle'),
            detail: a.xsdFile?.name ?? null,
          },
          generate: stage('generate', ready ? 'idle' : 'blocked'),
        },
      }
    }

    case 'select/xslt':
      return { ...s, selection: { ...s.selection, xsltFile: a.xsltFile } }

    case 'stage/start':
      return {
        ...s,
        stages: patch(s, a.stage, {
          state: 'running',
          startedAt: a.at,
          elapsedMs: null,
          error: null,
        }),
      }

    case 'stage/pass': {
      const started = s.stages[a.stage].startedAt
      return {
        ...s,
        stages: patch(s, a.stage, {
          state: 'passed',
          elapsedMs: started === null ? null : a.at - started,
          artifactCount: a.artifactCount ?? s.stages[a.stage].artifactCount,
          detail: a.detail ?? s.stages[a.stage].detail,
          error: null,
        }),
      }
    }

    case 'stage/fail': {
      const started = s.stages[a.stage].startedAt
      return {
        ...s,
        stages: patch(s, a.stage, {
          state: 'failed',
          elapsedMs: started === null ? null : a.at - started,
          artifactCount: a.artifactCount ?? s.stages[a.stage].artifactCount,
          error: a.error,
        }),
      }
    }

    case 'stage/skip':
      return {
        ...s,
        stages: patch(s, a.stage, { state: 'skipped', detail: a.detail ?? null, error: null }),
      }

    case 'generate/done':
      return {
        ...s,
        artifacts: {
          ...s.artifacts,
          canonicalXml: a.xml,
          canonicalFilename: a.filename,
          canonicalDirty: false,
          xsdValidation: null,
          fhirResult: null,
          fhirDocs: [],
          fhirRows: {},
        },
        stages: {
          ...invalidateFrom(s.stages, 'validate-xsd'),
          generate: s.stages.generate,
          'validate-xsd': stage('validate-xsd', 'idle'),
          transform: stage('transform', 'idle'),
        },
      }

    // Editing the sample makes every downstream result stale, so they all reset to idle
    // rather than lingering as green next to XML that no longer produced them.
    case 'canonical/edit':
      return {
        ...s,
        artifacts: {
          ...s.artifacts,
          canonicalXml: a.xml,
          canonicalDirty: true,
          xsdValidation: null,
          fhirResult: null,
          fhirDocs: [],
          fhirRows: {},
        },
        stages: {
          ...invalidateFrom(s.stages, 'validate-xsd'),
          'validate-xsd': stage('validate-xsd', 'idle'),
          transform: stage('transform', 'idle'),
        },
      }

    case 'xsd/done':
      return { ...s, artifacts: { ...s.artifacts, xsdValidation: a.result } }

    // Producing FHIR is what unblocks validation and export. Without this they stay `blocked`
    // and their rail nodes stay disabled — reachable only by a run that starts them directly,
    // never by clicking through the stages one at a time.
    case 'transform/done':
      return {
        ...s,
        artifacts: { ...s.artifacts, fhirResult: a.result, fhirRows: {} },
        stages: {
          ...s.stages,
          'validate-fhir': stage('validate-fhir', 'idle'),
          export: stage('export', 'idle'),
        },
      }

    case 'fhirDocs/set':
      return { ...s, artifacts: { ...s.artifacts, fhirDocs: a.docs } }

    case 'fhirRow/set':
      return {
        ...s,
        artifacts: {
          ...s.artifacts,
          fhirRows: { ...s.artifacts.fhirRows, [a.fileName]: a.state },
        },
      }

    case 'fhirRows/reset':
      return {
        ...s,
        artifacts: {
          ...s.artifacts,
          fhirRows: Object.fromEntries(
            a.fileNames.map((f) => [f, { status: 'queued' } as FhirRowState]),
          ),
        },
      }

    case 'reset':
      return { ...initialState(), runId: s.runId + 1, builds: s.builds, validatorConfig: s.validatorConfig }

    default:
      return s
  }
}
