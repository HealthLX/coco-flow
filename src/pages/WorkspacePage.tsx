import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText,
  Shuffle,
  Upload,
  Download,
  FileJson,
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
  getFhirValidatorConfig,
  convertXmlToJson,
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
  FhirTransformResult,
  ValidationResult as ValidationResultData,
} from '../services/api'
import {
  CANONICALS,
  FHIR_VALIDATE_CONCURRENCY,
  canonicalSampleFilename,
  deriveFhirDocs,
  downloadJsonFromMemory,
  downloadXmlFromMemory,
  fhirExportBasename,
  jsonFilename,
  profileLabel,
  runPool,
  schemaHasBuiltinTransforms,
  type FhirDoc,
  type FhirRowState,
} from '../pipeline/derive'
import { addToHistory } from '../lib/history'
import { storeFileTemp, retrieveTempFile } from '../lib/tempFiles'
import Spinner from '../components/Spinner'
import XmlPreview from '../components/XmlPreview'
import ValidationResult from '../components/ValidationResult'
import FhirValidationRow from '../components/fhir/FhirValidationRow'

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

  const fhirDocs: FhirDoc[] = useMemo(
    () => deriveFhirDocs(fhirResult, selectedCanonical, profileForResource),
    [fhirResult, selectedCanonical, fhirFromCustomXslt, fhirProfileChoice, configuredFhirProfile],
  )

  const fhirValidating = Object.values(fhirRows).some(
    (r) => r.status === 'queued' || r.status === 'running',
  )

  /** FHIR validation is enabled for Roster only; the step is hidden for every other canonical. */
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

  const [jsonBusy, setJsonBusy] = useState<'canonical' | 'fhir' | 'both' | null>(null)
  const [jsonExportError, setJsonExportError] = useState<string | null>(null)

  const exportCanonicalJson = async () => {
    if (!canonicalXml) return
    const json = await convertXmlToJson(canonicalXml)
    downloadJsonFromMemory(json, jsonFilename(canonicalFilename ?? 'sample.xml'))
  }
  const exportFhirJson = async () => {
    for (const doc of fhirDocs) {
      const json = await convertXmlToJson(doc.xml)
      downloadJsonFromMemory(json, jsonFilename(doc.fileName))
    }
  }
  const runJsonExport = async (kind: 'canonical' | 'fhir' | 'both') => {
    setJsonBusy(kind)
    setJsonExportError(null)
    try {
      if (kind === 'canonical') await exportCanonicalJson()
      else if (kind === 'fhir') await exportFhirJson()
      else {
        await exportCanonicalJson()
        await exportFhirJson()
      }
    } catch (e) {
      setJsonExportError((e as Error).message)
    } finally {
      setJsonBusy(null)
    }
  }

  const hasFhirOutput = !!fhirResult

  const showTransformStep = hasGenerated

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-fg">Workspace</h1>
        <p className="text-sm text-fg-body mt-0.5">
          Select a schema, generate a sample, and optionally transform to FHIR.
        </p>
      </div>

      {buildsError && (
        <div className="flex items-start gap-2 text-xs text-warn bg-warn-bg border border-warn-border rounded-lg p-3">
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
        <div className="px-5 py-4 border-b border-line flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white text-xs font-bold flex-shrink-0">
            1
          </div>
          <h2 className="text-sm font-semibold text-fg">Select Schema</h2>
        </div>

        {/* Tab strip */}
        <div className="flex border-b border-line">
          <button
            onClick={() => handleTabChange('predefined')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              selectorTab === 'predefined'
                ? 'border-brand text-brand'
                : 'border-transparent text-fg-body hover:text-fg'
            }`}
          >
            CoCo Canonical Schemas
          </button>
          <button
            onClick={() => handleTabChange('custom')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              selectorTab === 'custom'
                ? 'border-brand text-brand'
                : 'border-transparent text-fg-body hover:text-fg'
            }`}
          >
            Upload Custom XSD
          </button>
        </div>

        {/* Predefined schemas table */}
        {selectorTab === 'predefined' && (
          <div>
          <div className="divide-y divide-line">
            {/* Header row */}
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-5 py-2.5 bg-surface-2 border-b border-line">
              <div className="w-5" />
              <div className="text-xs font-semibold text-fg uppercase tracking-wider">Schema</div>
              <div className="text-xs font-semibold text-fg uppercase tracking-wider w-28 text-right">
                FHIR Transform
              </div>
              <div className="text-xs font-semibold text-fg uppercase tracking-wider w-44 text-right">
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
                  className={`w-full grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center px-5 py-3.5 text-left transition-colors hover:bg-surface-2 ${
                    isSelected
                      ? 'border-l-[3px] bg-brand/10'
                      : 'border-l-[3px] border-transparent'
                  }`}
                  
                >
                  {/* Radio indicator */}
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      isSelected ? 'border-brand' : 'border-line-strong'
                    }`}
                  >
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-brand" />
                    )}
                  </div>

                  {/* Label + description */}
                  <div>
                    <div
                      className={`text-sm font-semibold ${
                        isSelected ? 'text-brand' : 'text-fg-body'
                      }`}
                    >
                      {c.label}
                    </div>
                    <div className="text-xs text-fg-muted mt-0.5">{c.description}</div>
                  </div>

                  {/* Transform badge */}
                  <div className="w-28 flex justify-end">
                    {xform === null ? (
                      <span className="text-xs text-fg-muted">…</span>
                    ) : xform ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-ok whitespace-nowrap">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                        Available
                      </span>
                    ) : (
                      <span className="text-xs text-fg-subtle">—</span>
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
            <div className="px-5 py-3 bg-surface-2/80 border-t border-line">
              <p className="text-[11px] text-fg-muted max-w-xl leading-relaxed">
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
            <p className="text-xs text-fg-muted mb-5">
              Upload any XSD schema to generate a synthetic sample XML. You can also upload a
              custom XSLT in the transform step.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-fg mb-1.5">
                  XSD Schema File
                </label>
                <input
                  ref={xsdInputRef}
                  type="file"
                  accept=".xsd"
                  title="Select an XSD schema file"
                  aria-label="Select XSD schema file"
                  onChange={(e) => handleXsdFileChange(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-fg-muted file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-surface-3 file:text-fg-body hover:file:bg-line-strong cursor-pointer border border-line rounded px-2 py-1"
                />
                {xsdFile && (
                  <p className="text-xs text-fg-muted mt-1">
                    Selected: <span className="font-medium text-fg">{xsdFile.name}</span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-fg mb-1.5">
                  Root Element Name
                </label>
                <input
                  type="text"
                  value={rootElement}
                  onChange={(e) => setRootElement(e.target.value)}
                  placeholder="e.g. roster"
                  className="w-full text-sm border border-line rounded px-3 py-2 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand placeholder:text-fg-subtle"
                />
                <p className="text-[11px] text-fg-muted mt-1">
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
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white text-xs font-bold flex-shrink-0">
            2
          </div>
          <h2 className="text-sm font-semibold text-fg">Generate Sample XML</h2>
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
            <span className="text-xs text-fg-muted">
              {selectorTab === 'predefined'
                ? 'Select a schema above to continue'
                : 'Upload an XSD file and enter a root element name'}
            </span>
          )}
          {hasGenerated && !generating && (
            <span className="text-xs text-ok font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {canonicalFilename}
            </span>
          )}
        </div>

        {generateError && (
          <div className="mt-3 flex items-start gap-2 text-xs text-err bg-err-bg border border-err-border rounded-lg p-3">
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
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white text-xs font-bold flex-shrink-0">
              3
            </div>
            <h2 className="text-sm font-semibold text-fg">Validate against XSD</h2>
            <span className="text-xs text-fg-muted">(optional)</span>
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
                  <span className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                  Validating…
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Validate against XSD
                </>
              )}
            </button>
            <span className="text-xs text-fg-muted">
              Checks schema conformance: structure, data types, and required elements.
            </span>
          </div>

          {validateError && (
            <div className="mt-3 flex items-start gap-2 text-xs text-err bg-err-bg border border-err-border rounded-lg p-3">
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
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white text-xs font-bold flex-shrink-0">
              4
            </div>
            <h2 className="text-sm font-semibold text-fg">Transform to FHIR</h2>
            <span className="text-xs text-fg-muted">(optional)</span>
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
                    <span className="text-xs text-fg-muted bg-surface-3 border border-line rounded px-2.5 py-1 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-fg-body" />
                      No built-in transform. Upload a custom XSLT below.
                    </span>
                  )}
                  {buildsLoading && (
                    <span className="text-xs text-fg-muted">Loading transform configuration…</span>
                  )}
                </div>
                {hasGenerated && activeTransform && xsltCountForSelection > 0 && (
                  <p className="text-[11px] text-fg-muted pl-0.5">
                    Includes {xsltCountForSelection} FHIR resource output
                    {xsltCountForSelection === 1 ? '' : 's'} in one combined response.
                  </p>
                )}
              </div>
            )}

            {/* Custom XSLT upload */}
            <div className={selectorTab === 'predefined' ? 'border-t border-line pt-4' : ''}>
              <button
                onClick={() => setShowXsltUpload((v) => !v)}
                className="flex items-center gap-2 text-sm font-medium text-fg hover:text-fg transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload custom XSLT
                {showXsltUpload ? (
                  <ChevronUp className="w-3.5 h-3.5 text-fg-body" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-fg-body" />
                )}
              </button>

              {showXsltUpload && (
                <div className="mt-3 flex items-end gap-4 flex-wrap">
                  <div>
                    <label className="block text-xs font-semibold text-fg mb-1.5">
                      XSLT Stylesheet (.xsl / .xslt)
                    </label>
                    <input
                      ref={xsltInputRef}
                      type="file"
                      accept=".xsl,.xslt"
                      title="Select an XSLT stylesheet"
                      aria-label="Select XSLT stylesheet"
                      onChange={(e) => setXsltFile(e.target.files?.[0] ?? null)}
                      className="block text-xs text-fg-muted file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-surface-3 file:text-fg-body hover:file:bg-line-strong cursor-pointer border border-line rounded px-2 py-1"
                    />
                  </div>
                  <button
                    onClick={() => handleTransform(true)}
                    disabled={!xsltFile || transforming}
                    className="btn-secondary disabled:opacity-40"
                  >
                    {transforming && !!xsltFile ? (
                      <>
                        <span className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
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
            <div className="mt-3 flex items-start gap-2 text-xs text-err bg-err-bg border border-err-border rounded-lg p-3">
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
      {hasFhirOutput && fhirValidationSupported && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white text-xs font-bold flex-shrink-0">
              5
            </div>
            <h2 className="text-sm font-semibold text-fg">Validate FHIR</h2>

            <span className="relative group flex items-center">
              <HelpCircle className="w-4 h-4 text-fg-subtle cursor-help" aria-hidden />
              <span className="sr-only">What this check does</span>
              <span
                role="tooltip"
                className="pointer-events-none absolute left-6 top-0 z-20 hidden group-hover:block w-[26rem] rounded-lg border border-line bg-surface p-3 text-xs font-normal leading-relaxed text-fg-body shadow-lg"
              >
                CoCo Flow does not validate FHIR itself. It POSTs each transformed resource to
                HL7&apos;s FHIR validator API — one HTTP request per resource — and reports the
                issues that come back. Only synthetic data is sent.
                <span className="mt-2 block rounded-md bg-surface-2 p-2 font-mono text-[11px] leading-snug text-fg-body">
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

          {fhirDocs.length > 0 && (
            <div className="mb-4 rounded-lg border border-line bg-surface-2 p-3">
              <div className="text-xs font-semibold text-fg mb-2">
                {displayName}: profiles used
              </div>
              <ul className="space-y-1">
                {fhirDocs.map((p) => (
                  <li key={p.fileName} className="flex items-center gap-2 text-xs">
                    <span className="badge-fhir">{p.resourceType ?? 'FHIR'}</span>
                    <span className="text-fg-body">
                      {p.profile ? (
                        <>
                          US Core {US_CORE_VERSION}{' '}
                          <span className="font-mono">({profileLabel(p.profile).split('|')[0]})</span>
                        </>
                      ) : (
                        <span className="text-fg-subtle">
                          Base FHIR R4 — US Core defines no profile for this type
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {fhirFromCustomXslt ? (
              <select
                value={
                  (fhirProfileChoice === undefined
                    ? FHIR_PROFILE_OPTIONS[0].value
                    : fhirProfileChoice) ?? ''
                }
                onChange={(e) => setFhirProfileChoice(e.target.value === '' ? null : e.target.value)}
                disabled={fhirValidating}
                className="text-xs border border-line-strong rounded-lg px-2.5 py-2 bg-surface disabled:opacity-40"
              >
                {FHIR_PROFILE_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value ?? ''}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-fg-muted">
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

          {fhirValidateError && (
            <div className="mt-3 flex items-start gap-2 text-xs text-err bg-err-bg border border-err-border rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 " />
              {fhirValidateError}
            </div>
          )}

          {Object.keys(fhirRows).length > 0 && (
            <div className="mt-4 space-y-4">
              {fhirDocs.length > 1 && (
                <div className="text-xs text-fg-muted">
                  <span className="font-semibold">
                    {settledRows.filter((r) => r.result.valid).length}
                  </span>{' '}
                  of {fhirDocs.length} resources valid ·{' '}
                  {settledRows.reduce((n, r) => n + r.result.error_count, 0)} total issue
                  {settledRows.reduce((n, r) => n + r.result.error_count, 0) === 1 ? '' : 's'}
                  {fhirValidating && <span className="text-fg-subtle"> · validating…</span>}
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
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white text-xs font-bold flex-shrink-0">
              6
            </div>
            <h2 className="text-sm font-semibold text-fg">Export</h2>
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
              onClick={() => runJsonExport('canonical')}
              disabled={!canonicalXml || jsonBusy !== null}
              className="btn-secondary disabled:opacity-40"
              title={!canonicalXml ? 'Generate or select a sample with canonical preview first' : undefined}
            >
              {jsonBusy === 'canonical' ? <Spinner size="sm" tone="red" /> : <FileJson className="w-4 h-4" />}
              Export Canonical JSON
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
            <button
              onClick={() => runJsonExport('fhir')}
              disabled={!hasFhirOutput || jsonBusy !== null}
              className="btn-secondary disabled:opacity-40"
              title={!hasFhirOutput ? 'Transform first to export FHIR output' : undefined}
            >
              {jsonBusy === 'fhir' ? <Spinner size="sm" tone="red" /> : <FileJson className="w-4 h-4" />}
              {fhirResult?.kind === 'multipart' ? 'Export FHIR JSON files' : 'Export FHIR JSON'}
            </button>
            {hasFhirOutput && canonicalXml && (
              <>
                <button onClick={exportBoth} className="btn-primary">
                  <PackageOpen className="w-4 h-4" />
                  Export Both
                </button>
                <button
                  onClick={() => runJsonExport('both')}
                  disabled={jsonBusy !== null}
                  className="btn-primary disabled:opacity-40"
                >
                  {jsonBusy === 'both' ? <Spinner size="sm" /> : <PackageOpen className="w-4 h-4" />}
                  Export Both (JSON)
                </button>
              </>
            )}
          </div>
          <p className="mt-3 text-xs text-fg-subtle">
            JSON exports are a generic structural conversion (elements → keys, repeated elements →
            arrays), not spec-canonical FHIR JSON. Conformant FHIR JSON comes from the HealthLX
            mappings.
          </p>

          {jsonExportError && (
            <div className="mt-3 flex items-start gap-2 text-xs text-err bg-err-bg border border-err-border rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {jsonExportError}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
