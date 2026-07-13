import type {
  Build,
  FhirTransformResult,
  FhirValidatorConfig,
  ValidationResult,
} from '../services/api'
import type { FhirDoc, FhirRowState } from './derive'

/** The seven stages a run passes through, in order. */
export const STAGE_ORDER = [
  'schema',
  'generate',
  'validate-xsd',
  'transform',
  'fhir',
  'validate-fhir',
  'export',
] as const

export type StageId = (typeof STAGE_ORDER)[number]

/**
 * `blocked` = an upstream stage hasn't produced what this one needs yet.
 * `skipped` = not applicable to this selection (e.g. FHIR validation outside Roster).
 */
export type StageState = 'idle' | 'blocked' | 'running' | 'passed' | 'failed' | 'skipped'

export interface StageStatus {
  id: StageId
  state: StageState
  startedAt: number | null
  elapsedMs: number | null
  /** e.g. "26 resources", "3 errors" — whatever this stage produced. */
  artifactCount: number | null
  detail: string | null
  error: string | null
}

export const STAGE_META: Record<StageId, { label: string; hint: string }> = {
  schema: { label: 'Schema', hint: 'Pick a canonical model or upload an XSD' },
  generate: { label: 'Sample XML', hint: 'Generate synthetic canonical data' },
  'validate-xsd': { label: 'XSD Check', hint: 'Validate the sample against the schema' },
  transform: { label: 'Transform', hint: 'Run the XSLTs' },
  fhir: { label: 'FHIR', hint: 'The resources the transform produced' },
  'validate-fhir': { label: 'US Core', hint: 'Validate each resource against its profile' },
  export: { label: 'Export', hint: 'Download the artifacts' },
}

export type SelectionMode = 'builtin' | 'custom'

export interface Selection {
  mode: SelectionMode
  /** Canonical id, e.g. "roster". Null until picked. */
  canonical: string | null
  xsdFile: File | null
  rootElement: string
  xsltFile: File | null
}

export interface Artifacts {
  canonicalXml: string | null
  canonicalFilename: string | null
  /** The sample was edited after it was generated, so downstream results are stale. */
  canonicalDirty: boolean
  xsdValidation: ValidationResult | null
  fhirResult: FhirTransformResult | null
  fhirDocs: FhirDoc[]
  fhirRows: Record<string, FhirRowState>
}

export interface PipelineState {
  runId: number
  selection: Selection
  stages: Record<StageId, StageStatus>
  artifacts: Artifacts
  builds: Build[]
  validatorConfig: FhirValidatorConfig | null
}
