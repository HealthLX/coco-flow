import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText,
  Shuffle,
  Upload,
  Download,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  PackageOpen,
  CheckCircle2,
  ShieldCheck,
  HelpCircle,
} from 'lucide-react'
import {
  getBuilds,
  generateSampleContent,
  generateCustomXsdContent,
  transformSampleContent,
  transformUpload,
  validateCanonicalXml,
  validateCustomXml,
  validateFhirXml,
  explodeFhirXml,
  getFhirValidatorConfig,
  FHIR_PROFILE_OPTIONS,
  usCoreProfileFor,
  pinUsCoreVersion,
  US_CORE_VERSION,
  buildHasTransforms,
  countXsltSteps,
  normCanonicalId,
  selectProviderDirectoryBuild,
} from '../services/api'
import type {
  Build,
  FhirTransformResult,
  FhirFileValidation,
  FhirValidatorConfig,
  ValidationResult as ValidationResultData,
} from '../services/api'
import { addToHistory } from '../lib/history'
import Spinner from '../components/Spinner'
import { useElapsedSeconds, formatSeconds } from '../hooks/useElapsedSeconds'
import XmlPreview from '../components/XmlPreview'
import ValidationResult from '../components/ValidationResult'
import { storeFileTemp, retrieveTempFile } from './HomePage'

// ── Canonical definitions ─────────────────────────────────────────────────

interface CanonicalDef {
  name: string
  label: string
  schemaFile: string
  description: string
}

const CANONICALS: CanonicalDef[] = [
  {
    name: 'roster',
    label: 'Roster',
    schemaFile: 'Roster.xsd',
    description: 'Member demographics, coverage, addresses and related persons',
  },
  {
    name: 'eob',
    label: 'EOB',
    schemaFile: 'EOB.xsd',
    description: 'Explanation of Benefits: claims and adjudication data',
  },
  {
    name: 'formulary',
    label: 'Formulary',
    schemaFile: 'Formulary.xsd',
    description: 'Drug formulary entries and medication coverage plans',
  },
  {
    name: 'providerdirectory',
    label: 'Provider Directory',
    schemaFile: 'Provider-Directory.xsd',
    description:
      'Practitioner and organization providers in one canonical file: NPIs, specialties, networks',
  },
  {
    name: 'clinical',
    label: 'Clinical',
    schemaFile: 'Clinical.xsd',
    description: 'Clinical patient data, diagnoses, procedures and encounters',
  },
]

/** Schema has at least one build with XSLT (transform_file or transform_files in YAML). */
function schemaHasBuiltinTransforms(builds: Build[], canonicalName: string): boolean {
  const want = normCanonicalId(canonicalName)
  return builds.some((b) => normCanonicalId(b.canonical_name) === want && buildHasTransforms(b))
}

function downloadXmlFromMemory(xml: string, filename: string) {
  const blob = new Blob([xml], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function canonicalSampleFilename(canonicalName: string): string {
  if (canonicalName === 'providerdirectory') return 'provider-directory-sample.xml'
  return `${canonicalName}-sample.xml`
}

/** Base name for single-FHIR download/preview titles (multipart uses each part filename from the API). */
function fhirExportBasename(canonicalName: string): string {
  if (canonicalName === 'providerdirectory') return 'providerdirectory'
  return canonicalName
}

/** "…/us-core-patient|6.1.0" → "us-core-patient|6.1.0"; base-R4 label passes through. */
function profileLabel(schema: string): string {
  return schema.includes('/') ? (schema.split('/').pop() ?? schema) : schema
}

/** One resource queued for validation, with the profile it will be checked against. */
interface FhirDoc {
  fileName: string
  xml: string
  resourceType: string | null
  profile: string | null
}

/** Each resource validates on its own, so each carries its own status and timing. */
type FhirRowState =
  | { status: 'queued' }
  | { status: 'running'; startedAt: number }
  | { status: 'done'; elapsedMs: number; result: FhirFileValidation }
  | { status: 'error'; elapsedMs: number; message: string }

/** Upstream is a shared public validator, so keep only a few resources in flight at once. */
const FHIR_VALIDATE_CONCURRENCY = 4

async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      await worker(items[next++])
    }
  })
  await Promise.all(runners)
}

/** The upstream request this row is waiting on — shown live, while it is in flight. */
function InFlightCallMetadata({
  doc,
  config,
  elapsedSeconds,
}: {
  doc: FhirDoc
  config: FhirValidatorConfig | undefined
  elapsedSeconds: number | null
}) {
  if (!config) return null
  // A cold engine loads the IG before it can validate anything, which dominates the wait.
  const coldStart = !config.sessionActive && (elapsedSeconds ?? 0) > 3

  return (
    <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5 font-mono text-[11px] leading-relaxed text-gray-600">
      <div className="text-gray-900">
        {config.method} {config.endpoint}
      </div>
      <div>
        sv={config.fhirVersion} · igs={config.igs.join(', ')} · txServer={config.txServer}
      </div>
      <div>profiles={doc.profile ? profileLabel(doc.profile) : '[] (base FHIR R4)'}</div>
      <div>
        filesToValidate=[{doc.fileName}] · timeout={config.timeoutMs / 1000}s · attempts&le;
        {config.maxAttempts}
      </div>
      {coldStart && (
        <div className="mt-1 text-amber-700">
          cold engine — loading {config.igs[0]} definitions, this first call can take ~50s
        </div>
      )}
    </div>
  )
}

function FhirValidationRow({
  doc,
  state,
  config,
}: {
  doc: FhirDoc
  state: FhirRowState
  config: FhirValidatorConfig | undefined
}) {
  const liveSeconds = useElapsedSeconds(state.status === 'running' ? state.startedAt : null)

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="badge-fhir">{doc.resourceType ?? 'FHIR'}</span>
        <span className="text-xs font-mono text-gray-900">{doc.fileName}</span>

        <span className="ml-auto flex items-center gap-1.5 text-xs">
          {state.status === 'queued' && <span className="text-gray-400">Queued</span>}
          {state.status === 'running' && (
            <>
              <Spinner size="sm" tone="green" />
              <span className="text-gray-600 tabular-nums">
                {liveSeconds === null ? '' : formatSeconds(liveSeconds)}
              </span>
            </>
          )}
          {state.status !== 'queued' && state.status !== 'running' && (
            <span className="text-gray-500 tabular-nums">
              {formatSeconds(state.elapsedMs / 1000)}
            </span>
          )}
        </span>
      </div>

      {state.status === 'running' && (
        <InFlightCallMetadata doc={doc} config={config} elapsedSeconds={liveSeconds} />
      )}

      {state.status === 'done' && (
        <ValidationResult
          result={{
            valid: state.result.valid,
            schema: profileLabel(state.result.schema),
            error_count: state.result.error_count,
            errors: state.result.errors,
          }}
        />
      )}

      {state.status === 'error' && (
        <div className="flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
          {state.message}
        </div>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────

type SelectorTab = 'predefined' | 'custom'

export default function WorkspacePage() {
  const {
    data: builds = [],
    isPending: buildsLoading,
    isError: buildsError,
    error: buildsQueryError,
  } = useQuery({ queryKey: ['coco-sample-builds'], queryFn: getBuilds, staleTime: 60_000 })

  // ── Selector state ────────────────────────────────────────────────────────
  const [selectorTab, setSelectorTab] = useState<SelectorTab>('predefined')
  const [selectedCanonical, setSelectedCanonical] = useState<string | null>(null)

  // Custom XSD inputs
  const [xsdFile, setXsdFile] = useState<File | null>(null)
  const [xsdFileKey, setXsdFileKey] = useState<string | null>(null)
  const [rootElement, setRootElement] = useState('')
  const xsdInputRef = useRef<HTMLInputElement>(null)

  // ── Generate state ────────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [canonicalXml, setCanonicalXml] = useState<string | null>(null)
  const [canonicalFilename, setCanonicalFilename] = useState<string | null>(null)

  // ── Validate state ────────────────────────────────────────────────────────
  const [validating, setValidating] = useState(false)
  const [validateError, setValidateError] = useState<string | null>(null)
  const [validationResult, setValidationResult] = useState<ValidationResultData | null>(null)

  // ── Transform state ───────────────────────────────────────────────────────
  const [transforming, setTransforming] = useState(false)
  const [transformError, setTransformError] = useState<string | null>(null)
  const [fhirResult, setFhirResult] = useState<FhirTransformResult | null>(null)
  const [showXsltUpload, setShowXsltUpload] = useState(false)
  const [xsltFile, setXsltFile] = useState<File | null>(null)
  const xsltInputRef = useRef<HTMLInputElement>(null)

  // ── FHIR validate state ───────────────────────────────────────────────────
  // Only custom-XSLT output lets the user pick a profile; built-in transforms use the
  // build's configured fhir_profile. `undefined` means "no explicit pick yet".
  const [fhirFromCustomXslt, setFhirFromCustomXslt] = useState(false)
  const [fhirProfileChoice, setFhirProfileChoice] = useState<string | null | undefined>(undefined)
  const [fhirValidateError, setFhirValidateError] = useState<string | null>(null)
  /** Keyed by fileName so each resource's spinner, timing and result update independently. */
  const [fhirRows, setFhirRows] = useState<Record<string, FhirRowState>>({})

  // ── Derived values ────────────────────────────────────────────────────────
  const isPredefined = selectorTab === 'predefined'
  const canGenerate =
    (isPredefined && !!selectedCanonical) ||
    (!isPredefined && !!xsdFile && !!rootElement.trim())
  const hasGenerated = !!canonicalXml

  const activeTransform =
    isPredefined &&
    !buildsLoading &&
    !buildsError &&
    !!selectedCanonical &&
    schemaHasBuiltinTransforms(builds, selectedCanonical)

  const xsltCountForSelection =
    isPredefined && selectedCanonical && !buildsLoading && !buildsError
      ? (() => {
          if (normCanonicalId(selectedCanonical) === 'providerdirectory') {
            const b = selectProviderDirectoryBuild(builds)
            return b ? countXsltSteps(b) : 0
          }
          const b = builds.find(
            (x) =>
              normCanonicalId(x.canonical_name) === normCanonicalId(selectedCanonical) &&
              buildHasTransforms(x),
          )
          return b ? countXsltSteps(b) : 0
        })()
      : 0

  const displayName = isPredefined
    ? (CANONICALS.find((c) => c.name === selectedCanonical)?.label ?? selectedCanonical ?? '')
    : xsdFile?.name ?? 'Custom XSD'

  // Profile configured for this build in sample_builds.yaml — only roster sets one.
  const configuredFhirProfile: string | null =
    isPredefined && selectedCanonical && !buildsLoading && !buildsError
      ? (builds.find(
          (b) => normCanonicalId(b.canonical_name) === normCanonicalId(selectedCanonical),
        )?.fhir_profile ?? null)
      : null

  /** Custom XSLT: the user's pick. Built-in: the build's profile, else US Core by resource type. */
  const profileForResource = (resourceType: string | null): string | null => {
    if (fhirFromCustomXslt) {
      return fhirProfileChoice === undefined ? FHIR_PROFILE_OPTIONS[0].value : fhirProfileChoice
    }
    if (configuredFhirProfile) return pinUsCoreVersion(configuredFhirProfile)
    return usCoreProfileFor(resourceType)
  }

  /**
   * The resources that will be validated, one row each. Drives both the pre-click profile
   * preview and the post-click rows, so the two cannot drift. Transforms that wrap their
   * output in a collection element are split here into one resource per child.
   */
  const fhirDocs: FhirDoc[] = useMemo(() => {
    if (!fhirResult) return []
    const base = selectedCanonical ? fhirExportBasename(selectedCanonical) : 'fhir-output'
    const documents =
      fhirResult.kind === 'single'
        ? [{ fileName: `${base}-fhir.xml`, xml: fhirResult.xml }]
        : fhirResult.parts.map((p) => ({ fileName: p.filename, xml: p.xml }))

    return documents
      .flatMap((d) => explodeFhirXml(d.fileName, d.xml))
      .map((d) => ({ ...d, profile: profileForResource(d.resourceType) }))
  }, [fhirResult, selectedCanonical, fhirFromCustomXslt, fhirProfileChoice, configuredFhirProfile])

  const fhirValidating = Object.values(fhirRows).some(
    (r) => r.status === 'queued' || r.status === 'running',
  )

  /**
   * Only Roster's transform currently produces output clean enough to validate meaningfully.
   * The other canonicals still have open mapping issues, so the check is hidden for them
   * rather than reporting failures the user cannot act on yet.
   */
  const fhirValidationSupported = isPredefined && normCanonicalId(selectedCanonical) === 'roster'

  // Refetched while a run is in flight so `sessionActive` flips once the engine is warm.
  const { data: fhirValidatorConfig } = useQuery({
    queryKey: ['fhir-validator-config'],
    queryFn: getFhirValidatorConfig,
    enabled: fhirValidationSupported && !!fhirResult,
    refetchInterval: fhirValidating ? 5_000 : false,
    staleTime: 5_000,
  })

  const settledRows = fhirDocs
    .map((d) => fhirRows[d.fileName])
    .filter((r): r is Extract<FhirRowState, { status: 'done' }> => r?.status === 'done')

  // ── Handlers ──────────────────────────────────────────────────────────────

  const resetFhirValidation = () => {
    setFhirProfileChoice(undefined)
    setFhirFromCustomXslt(false)
    setFhirRows({})
    setFhirValidateError(null)
  }

  const handleTabChange = (tab: SelectorTab) => {
    setSelectorTab(tab)
    setSelectedCanonical(null)
    setCanonicalXml(null)
    setCanonicalFilename(null)
    setFhirResult(null)
    setGenerateError(null)
    setTransformError(null)
    setValidationResult(null)
    setValidateError(null)
    resetFhirValidation()
  }

  const handleSelectCanonical = (name: string) => {
    setSelectedCanonical(name)
    setCanonicalXml(null)
    setCanonicalFilename(null)
    setFhirResult(null)
    setGenerateError(null)
    setTransformError(null)
    setValidationResult(null)
    setValidateError(null)
    resetFhirValidation()
  }

  const handleXsdFileChange = (file: File | null) => {
    setXsdFile(file)
    if (file) {
      const key = storeFileTemp(file)
      setXsdFileKey(key)
    } else {
      setXsdFileKey(null)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGenerateError(null)
    setCanonicalXml(null)
    setCanonicalFilename(null)
    setFhirResult(null)
    setValidationResult(null)
    setValidateError(null)

    try {
      if (isPredefined && selectedCanonical) {
        const xml = await generateSampleContent(selectedCanonical)
        const filename = canonicalSampleFilename(selectedCanonical)
        setCanonicalXml(xml)
        setCanonicalFilename(filename)
        addToHistory({
          label: displayName,
          actionType: 'generated',
          fileType: 'canonical',
          serverFilename: filename,
        })
      } else {
        const file = xsdFileKey ? retrieveTempFile(xsdFileKey) : null
        if (!file || !rootElement.trim()) {
          throw new Error('Select an XSD file and enter a root element name.')
        }
        const { xml, filename } = await generateCustomXsdContent(file, rootElement.trim())
        setCanonicalXml(xml)
        setCanonicalFilename(filename)
        addToHistory({
          label: `Custom: ${file.name}`,
          actionType: 'generated',
          fileType: 'canonical',
          serverFilename: null,
        })
      }
    } catch (e) {
      setGenerateError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const handleValidate = async () => {
    if (!canonicalXml || !canonicalFilename) return
    setValidating(true)
    setValidateError(null)
    setValidationResult(null)

    try {
      let result: ValidationResultData
      if (isPredefined && selectedCanonical) {
        const def = CANONICALS.find((c) => c.name === selectedCanonical)
        if (!def) throw new Error('No schema available for this selection.')
        result = await validateCanonicalXml(canonicalXml, def.schemaFile)
      } else {
        const file = xsdFileKey ? retrieveTempFile(xsdFileKey) : null
        if (!file) throw new Error('Upload an XSD file to validate against.')
        result = await validateCustomXml(canonicalXml, canonicalFilename, file)
      }
      setValidationResult(result)
      addToHistory({
        label: `${displayName}: XSD ${result.valid ? 'valid' : `${result.error_count} issue(s)`}`,
        actionType: 'validated',
        fileType: 'canonical',
        serverFilename: null,
      })
    } catch (e) {
      setValidateError((e as Error).message)
    } finally {
      setValidating(false)
    }
  }

  const handleValidateFhir = async () => {
    if (fhirDocs.length === 0) return
    setFhirValidateError(null)
    // Seed every row before the first request so the whole list renders immediately.
    setFhirRows(Object.fromEntries(fhirDocs.map((d) => [d.fileName, { status: 'queued' }])))

    const setRow = (fileName: string, state: FhirRowState) =>
      setFhirRows((prev) => ({ ...prev, [fileName]: state }))

    await runPool(fhirDocs, FHIR_VALIDATE_CONCURRENCY, async (doc) => {
      const startedAt = Date.now()
      setRow(doc.fileName, { status: 'running', startedAt })
      try {
        const res = await validateFhirXml([
          { fileName: doc.fileName, xml: doc.xml, profile: doc.profile },
        ])
        const result = res.files[0]
        if (!result) throw new Error('Validator returned no result for this resource')
        setRow(doc.fileName, { status: 'done', elapsedMs: Date.now() - startedAt, result })
      } catch (e) {
        setRow(doc.fileName, {
          status: 'error',
          elapsedMs: Date.now() - startedAt,
          message: (e as Error).message,
        })
      }
    })

    addToHistory({
      label: `${displayName} FHIR validated`,
      actionType: 'fhir-validated',
      fileType: 'fhir',
      serverFilename: null,
    })
  }

  const handleTransform = async (useCustomXslt: boolean) => {
    if (!canonicalXml || !canonicalFilename) return
    setTransforming(true)
    setTransformError(null)
    setFhirResult(null)
    setFhirRows({})
    setFhirValidateError(null)

    try {
      if (useCustomXslt && xsltFile) {
        const fhir = await transformUpload(canonicalXml, canonicalFilename, xsltFile)
        setFhirResult({ kind: 'single', xml: fhir })
        setFhirFromCustomXslt(true)
        addToHistory({
          label: `${displayName} → FHIR (custom XSLT)`,
          actionType: 'transformed',
          fileType: 'fhir',
          serverFilename: null,
        })
      } else if (isPredefined && selectedCanonical && activeTransform) {
        const result = await transformSampleContent(selectedCanonical)
        setFhirResult(result)
        setFhirFromCustomXslt(false)
        const base = fhirExportBasename(selectedCanonical)
        addToHistory({
          label: `${displayName} → FHIR`,
          actionType: 'transformed',
          fileType: 'fhir',
          serverFilename: result.kind === 'single' ? `${base}-fhir.xml` : null,
        })
      } else {
        throw new Error('No transform available.')
      }
    } catch (e) {
      setTransformError((e as Error).message)
    } finally {
      setTransforming(false)
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  const exportCanonical = () => {
    if (canonicalXml && canonicalFilename) downloadXmlFromMemory(canonicalXml, canonicalFilename)
  }
  const exportFhir = () => {
    if (!fhirResult) return
    const base = selectedCanonical ? fhirExportBasename(selectedCanonical) : 'fhir-output'
    if (fhirResult.kind === 'single') {
      downloadXmlFromMemory(fhirResult.xml, `${base}-fhir.xml`)
      return
    }
    fhirResult.parts.forEach((p, i) => {
      setTimeout(() => downloadXmlFromMemory(p.xml, p.filename), i * 250)
    })
  }
  const exportBoth = () => {
    exportCanonical()
    setTimeout(exportFhir, 300)
  }

  const hasFhirOutput = !!fhirResult

  const showTransformStep = hasGenerated

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Workspace</h1>
        <p className="text-sm text-gray-900 mt-0.5">
          Select a schema, generate a sample, and optionally transform to FHIR.
        </p>
      </div>

      {buildsError && (
        <div className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Could not load sample build config.</span>{' '}
            Built-in transforms may be unavailable until the CoCo API is reachable (
            {buildsQueryError instanceof Error ? buildsQueryError.message : 'unknown error'}).
          </div>
        </div>
      )}

      {/* ── Step 1: Schema selection ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-red text-white text-xs font-bold flex-shrink-0">
            1
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Select Schema</h2>
        </div>

        {/* Tab strip */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => handleTabChange('predefined')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              selectorTab === 'predefined'
                ? 'border-coco-red text-coco-red'
                : 'border-transparent text-gray-900 hover:text-gray-900'
            }`}
          >
            CoCo Canonical Schemas
          </button>
          <button
            onClick={() => handleTabChange('custom')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              selectorTab === 'custom'
                ? 'border-coco-red text-coco-red'
                : 'border-transparent text-gray-900 hover:text-gray-900'
            }`}
          >
            Upload Custom XSD
          </button>
        </div>

        {/* Predefined schemas table */}
        {selectorTab === 'predefined' && (
          <div>
          <div className="divide-y divide-gray-50">
            {/* Header row */}
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-5 py-2.5 bg-gray-50 border-b border-gray-100">
              <div className="w-5" />
              <div className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Schema</div>
              <div className="text-xs font-semibold text-gray-900 uppercase tracking-wider w-28 text-right">
                FHIR Transform
              </div>
              <div className="text-xs font-semibold text-gray-900 uppercase tracking-wider w-44 text-right">
                XSD File
              </div>
            </div>

            {CANONICALS.map((c) => {
              const isSelected = selectedCanonical === c.name
              const xform = buildsLoading
                ? null
                : schemaHasBuiltinTransforms(builds, c.name)
              return (
                <button
                  key={c.name}
                  onClick={() => handleSelectCanonical(c.name)}
                  className={`w-full grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center px-5 py-3.5 text-left transition-colors hover:bg-gray-50 ${
                    isSelected
                      ? 'border-l-[3px] bg-red-50/40'
                      : 'border-l-[3px] border-transparent'
                  }`}
                  style={isSelected ? { borderLeftColor: '#c0392b' } : undefined}
                >
                  {/* Radio indicator */}
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      isSelected ? 'border-coco-red' : 'border-gray-300'
                    }`}
                  >
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-coco-red" />
                    )}
                  </div>

                  {/* Label + description */}
                  <div>
                    <div
                      className={`text-sm font-semibold ${
                        isSelected ? 'text-coco-red' : 'text-gray-900'
                      }`}
                    >
                      {c.label}
                    </div>
                    <div className="text-xs text-gray-900 mt-0.5">{c.description}</div>
                  </div>

                  {/* Transform badge */}
                  <div className="w-28 flex justify-end">
                    {xform === null ? (
                      <span className="text-xs text-gray-900">…</span>
                    ) : xform ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 whitespace-nowrap">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                        Available
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>

                  {/* XSD file */}
                  <div className="w-44 flex justify-end">
                    <span className="badge-xsd font-mono text-[10px] whitespace-nowrap">{c.schemaFile}</span>
                  </div>
                </button>
              )
            })}
          </div>
          {selectedCanonical === 'providerdirectory' && (
            <div className="px-5 py-3 bg-gray-50/80 border-t border-gray-100">
              <p className="text-[11px] text-gray-900 max-w-xl leading-relaxed">
                A single generated or uploaded file may include both practitioner and organization
                providers. The API maps them with separate XSLTs (e.g. Practitioner vs Organization
                resources), delivered as one multipart FHIR response.
              </p>
            </div>
          )}
          </div>
        )}

        {/* Custom XSD */}
        {selectorTab === 'custom' && (
          <div className="px-5 py-5">
            <p className="text-xs text-gray-900 mb-5">
              Upload any XSD schema to generate a synthetic sample XML. You can also upload a
              custom XSLT in the transform step.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-900 mb-1.5">
                  XSD Schema File
                </label>
                <input
                  ref={xsdInputRef}
                  type="file"
                  accept=".xsd"
                  title="Select an XSD schema file"
                  aria-label="Select XSD schema file"
                  onChange={(e) => handleXsdFileChange(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-gray-900 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-900 hover:file:bg-gray-200 cursor-pointer border border-gray-200 rounded px-2 py-1"
                />
                {xsdFile && (
                  <p className="text-xs text-gray-900 mt-1">
                    Selected: <span className="font-medium text-gray-900">{xsdFile.name}</span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-900 mb-1.5">
                  Root Element Name
                </label>
                <input
                  type="text"
                  value={rootElement}
                  onChange={(e) => setRootElement(e.target.value)}
                  placeholder="e.g. roster"
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-coco-red focus:ring-1 focus:ring-coco-red placeholder:text-gray-400"
                />
                <p className="text-[11px] text-gray-900 mt-1">
                  The root element defined in your XSD schema
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Step 2: Generate ── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-red text-white text-xs font-bold flex-shrink-0">
            2
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Generate Sample XML</h2>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleGenerate}
            disabled={generating || !canGenerate}
            className="btn-primary disabled:opacity-40"
          >
            {generating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                {hasGenerated ? 'Regenerate Sample' : 'Generate Sample'}
              </>
            )}
          </button>
          {!canGenerate && !generating && (
            <span className="text-xs text-gray-900">
              {selectorTab === 'predefined'
                ? 'Select a schema above to continue'
                : 'Upload an XSD file and enter a root element name'}
            </span>
          )}
          {hasGenerated && !generating && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {canonicalFilename}
            </span>
          )}
        </div>

        {generateError && (
          <div className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {generateError}
          </div>
        )}
      </div>

      {/* ── Canonical XML Preview ── */}
      {canonicalXml && (
        <XmlPreview
          content={canonicalXml}
          title={canonicalFilename ?? 'Canonical XML'}
          badgeClass="badge-canonical"
          badgeLabel="CANONICAL"
        />
      )}

      {/* ── Step 3: Validate against XSD ── */}
      {showTransformStep && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-red text-white text-xs font-bold flex-shrink-0">
              3
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Validate against XSD</h2>
            <span className="text-xs text-gray-900">(optional)</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleValidate}
              disabled={!hasGenerated || validating}
              className="btn-secondary disabled:opacity-40"
              title={
                isPredefined
                  ? `Validate the generated XML against its CoCo XSD schema`
                  : `Validate the generated XML against the uploaded XSD`
              }
            >
              {validating ? (
                <>
                  <span className="w-4 h-4 border-2 border-coco-red/30 border-t-coco-red rounded-full animate-spin" />
                  Validating…
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Validate against XSD
                </>
              )}
            </button>
            <span className="text-xs text-gray-900">
              Checks schema conformance: structure, data types, and required elements.
            </span>
          </div>

          {validateError && (
            <div className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {validateError}
            </div>
          )}
          {validationResult && (
            <div className="mt-3">
              <ValidationResult result={validationResult} />
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Transform ── */}
      {showTransformStep && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-red text-white text-xs font-bold flex-shrink-0">
              4
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Transform to FHIR</h2>
            <span className="text-xs text-gray-900">(optional)</span>
          </div>

          <div className="space-y-4">
            {/* Built-in transform */}
            {selectorTab === 'predefined' && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => handleTransform(false)}
                    disabled={!hasGenerated || !activeTransform || transforming}
                    className="btn-primary disabled:opacity-40"
                    title={
                      !hasGenerated
                        ? 'Generate a sample first'
                        : activeTransform
                          ? xsltCountForSelection > 0
                            ? `Runs ${xsltCountForSelection} FHIR resource transform(s) on this canonical file (one combined response)`
                            : undefined
                          : buildsLoading
                            ? 'Loading build configuration…'
                            : `No built-in XSLT transform for ${displayName}`
                    }
                  >
                    {transforming && !xsltFile ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Transforming…
                      </>
                    ) : (
                      <>
                        <Shuffle className="w-4 h-4" />
                        Transform to FHIR
                      </>
                    )}
                  </button>
                  {!activeTransform && !buildsLoading && (
                    <span className="text-xs text-gray-900 bg-gray-100 border border-gray-200 rounded px-2.5 py-1 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-gray-900" />
                      No built-in transform. Upload a custom XSLT below.
                    </span>
                  )}
                  {buildsLoading && (
                    <span className="text-xs text-gray-900">Loading transform configuration…</span>
                  )}
                </div>
                {hasGenerated && activeTransform && xsltCountForSelection > 0 && (
                  <p className="text-[11px] text-gray-900 pl-0.5">
                    Includes {xsltCountForSelection} FHIR resource output
                    {xsltCountForSelection === 1 ? '' : 's'} in one combined response.
                  </p>
                )}
              </div>
            )}

            {/* Custom XSLT upload */}
            <div className={selectorTab === 'predefined' ? 'border-t border-gray-100 pt-4' : ''}>
              <button
                onClick={() => setShowXsltUpload((v) => !v)}
                className="flex items-center gap-2 text-sm font-medium text-gray-900 hover:text-gray-900 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload custom XSLT
                {showXsltUpload ? (
                  <ChevronUp className="w-3.5 h-3.5 text-gray-900" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-900" />
                )}
              </button>

              {showXsltUpload && (
                <div className="mt-3 flex items-end gap-4 flex-wrap">
                  <div>
                    <label className="block text-xs font-semibold text-gray-900 mb-1.5">
                      XSLT Stylesheet (.xsl / .xslt)
                    </label>
                    <input
                      ref={xsltInputRef}
                      type="file"
                      accept=".xsl,.xslt"
                      title="Select an XSLT stylesheet"
                      aria-label="Select XSLT stylesheet"
                      onChange={(e) => setXsltFile(e.target.files?.[0] ?? null)}
                      className="block text-xs text-gray-900 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-900 hover:file:bg-gray-200 cursor-pointer border border-gray-200 rounded px-2 py-1"
                    />
                  </div>
                  <button
                    onClick={() => handleTransform(true)}
                    disabled={!xsltFile || transforming}
                    className="btn-secondary disabled:opacity-40"
                  >
                    {transforming && !!xsltFile ? (
                      <>
                        <span className="w-4 h-4 border-2 border-coco-red/30 border-t-coco-red rounded-full animate-spin" />
                        Transforming…
                      </>
                    ) : (
                      <>
                        <Shuffle className="w-4 h-4" />
                        Apply XSLT
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {transformError && (
            <div className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {transformError}
            </div>
          )}
        </div>
      )}

      {/* ── FHIR XML Preview ── */}
      {fhirResult?.kind === 'single' && (
        <XmlPreview
          content={fhirResult.xml}
          title={
            selectedCanonical
              ? `${fhirExportBasename(selectedCanonical)}-fhir.xml`
              : 'FHIR Output'
          }
          badgeClass="badge-fhir"
          badgeLabel="FHIR"
          allowJson
        />
      )}
      {fhirResult?.kind === 'multipart' &&
        fhirResult.parts.map((part, idx) => (
          <XmlPreview
            key={`${part.filename}-${part.resourceType}-${idx}`}
            content={part.xml}
            title={part.filename}
            badgeClass="badge-fhir"
            badgeLabel={part.resourceType}
            allowJson
          />
        ))}

      {/* ── Step 5: Validate FHIR ── */}
      {hasFhirOutput && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-red text-white text-xs font-bold flex-shrink-0">
              5
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Validate FHIR</h2>

            <span className="relative group flex items-center">
              <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" aria-hidden />
              <span className="sr-only">What this check does</span>
              <span
                role="tooltip"
                className="pointer-events-none absolute left-6 top-0 z-20 hidden group-hover:block w-[26rem] rounded-lg border border-gray-200 bg-white p-3 text-xs font-normal leading-relaxed text-gray-900 shadow-lg"
              >
                CoCo Flow does not validate FHIR itself. It POSTs each transformed resource to
                HL7&apos;s FHIR validator API — one HTTP request per resource — and reports the
                issues that come back. Only synthetic data is sent.
                <span className="mt-2 block rounded-md bg-gray-50 p-2 font-mono text-[11px] leading-snug text-gray-700">
                  POST {fhirValidatorConfig?.endpoint ?? 'https://validator.fhir.org/validate'}
                  <br />
                  {'{'}
                  <br />
                  &nbsp;&nbsp;&quot;sessionId&quot;: &quot;…&quot;,
                  <br />
                  &nbsp;&nbsp;&quot;validationContext&quot;: {'{'}
                  <br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&quot;sv&quot;: &quot;
                  {fhirValidatorConfig?.fhirVersion ?? '4.0.1'}&quot;,
                  <br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&quot;igs&quot;: [&quot;
                  {fhirValidatorConfig?.igs[0] ?? 'hl7.fhir.us.core#6.1.0'}&quot;],
                  <br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&quot;profiles&quot;: [&quot;…/us-core-patient|
                  {US_CORE_VERSION}&quot;],
                  <br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&quot;txServer&quot;: &quot;
                  {fhirValidatorConfig?.txServer ?? 'http://tx.fhir.org'}&quot;
                  <br />
                  &nbsp;&nbsp;{'}'},
                  <br />
                  &nbsp;&nbsp;&quot;filesToValidate&quot;: [{'{'} &quot;fileName&quot;, &quot;
                  fileContent&quot;, &quot;fileType&quot; {'}'}]
                  <br />
                  {'}'}
                </span>
                <span className="mt-2 block">
                  The <span className="font-mono">profiles</span> field decides how strict the
                  check is: each resource is sent with its US Core {US_CORE_VERSION}{' '}
                  StructureDefinition, so required elements, cardinality, value-set bindings and
                  invariants are all enforced. Types US Core does not profile fall back to base
                  FHIR R4. The <span className="font-mono">sessionId</span> keeps the upstream
                  engine warm — the first call loads the IG and takes ~50s, later ones ~0.5s.
                </span>
              </span>
            </span>
          </div>

          {!fhirValidationSupported && (
            <div className="flex items-start gap-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" />
              <span>
                FHIR validation is enabled for the <span className="font-semibold">Roster</span>{' '}
                canonical for now. The other transforms still have open mapping issues, so
                validating them would report failures you cannot act on yet.
              </span>
            </div>
          )}

          {fhirValidationSupported && fhirDocs.length > 0 && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-semibold text-gray-900 mb-2">
                {displayName}: profiles used
              </div>
              <ul className="space-y-1">
                {fhirDocs.map((p) => (
                  <li key={p.fileName} className="flex items-center gap-2 text-xs">
                    <span className="badge-fhir">{p.resourceType ?? 'FHIR'}</span>
                    <span className="text-gray-900">
                      {p.profile ? (
                        <>
                          US Core {US_CORE_VERSION}{' '}
                          <span className="font-mono">({profileLabel(p.profile).split('|')[0]})</span>
                        </>
                      ) : (
                        <span className="text-gray-500">
                          Base FHIR R4 — US Core defines no profile for this type
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fhirValidationSupported && (
            <div className="flex flex-wrap items-center gap-3">
              {fhirFromCustomXslt ? (
                <select
                  value={
                    (fhirProfileChoice === undefined
                      ? FHIR_PROFILE_OPTIONS[0].value
                      : fhirProfileChoice) ?? ''
                  }
                  onChange={(e) =>
                    setFhirProfileChoice(e.target.value === '' ? null : e.target.value)
                  }
                  disabled={fhirValidating}
                  className="text-xs border border-gray-300 rounded-lg px-2.5 py-2 bg-white disabled:opacity-40"
                >
                  {FHIR_PROFILE_OPTIONS.map((opt) => (
                    <option key={opt.label} value={opt.value ?? ''}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-gray-900">
                  Each resource is validated against its US Core {US_CORE_VERSION} profile.
                </span>
              )}

              <button
                onClick={handleValidateFhir}
                disabled={fhirValidating}
                className="btn-secondary disabled:opacity-40"
              >
                {fhirValidating ? (
                  <>
                    <Spinner tone="red" />
                    Validating…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Validate FHIR
                  </>
                )}
              </button>
            </div>
          )}

          {fhirValidateError && (
            <div className="mt-3 flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
              {fhirValidateError}
            </div>
          )}

          {fhirValidationSupported && Object.keys(fhirRows).length > 0 && (
            <div className="mt-4 space-y-4">
              {fhirDocs.length > 1 && (
                <div className="text-xs text-gray-900">
                  <span className="font-semibold">
                    {settledRows.filter((r) => r.result.valid).length}
                  </span>{' '}
                  of {fhirDocs.length} resources valid ·{' '}
                  {settledRows.reduce((n, r) => n + r.result.error_count, 0)} total issue
                  {settledRows.reduce((n, r) => n + r.result.error_count, 0) === 1 ? '' : 's'}
                  {fhirValidating && <span className="text-gray-500"> · validating…</span>}
                </div>
              )}

              {fhirDocs.map((doc) => {
                const state = fhirRows[doc.fileName]
                if (!state) return null
                return (
                  <FhirValidationRow
                    key={doc.fileName}
                    doc={doc}
                    state={state}
                    config={fhirValidatorConfig}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Step 6: Export ── */}
      {(hasGenerated || hasFhirOutput) && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-red text-white text-xs font-bold flex-shrink-0">
              6
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Export</h2>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={exportCanonical}
              disabled={!canonicalXml}
              className="btn-secondary disabled:opacity-40"
              title={!canonicalXml ? 'Generate or select a sample with canonical preview first' : undefined}
            >
              <Download className="w-4 h-4" />
              Export Canonical XML
            </button>
            <button
              onClick={exportFhir}
              disabled={!hasFhirOutput}
              className="btn-secondary disabled:opacity-40"
              title={!hasFhirOutput ? 'Transform first to export FHIR output' : undefined}
            >
              <Download className="w-4 h-4" />
              {fhirResult?.kind === 'multipart' ? 'Export FHIR XML files' : 'Export FHIR XML'}
            </button>
            {hasFhirOutput && canonicalXml && (
              <button onClick={exportBoth} className="btn-primary">
                <PackageOpen className="w-4 h-4" />
                Export Both
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
