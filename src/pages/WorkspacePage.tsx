import { useRef, useState } from 'react'
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
  FhirValidationResponse,
  ValidationResult as ValidationResultData,
} from '../services/api'
import { addToHistory } from '../lib/history'
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

/** Root element of a FHIR XML document, e.g. "Patient". Skips the XML declaration. */
function rootResourceType(xml: string): string | null {
  return xml.match(/<([A-Za-z][A-Za-z0-9]*)[\s>]/)?.[1] ?? null
}

/** "…/us-core-patient|6.1.0" → "us-core-patient|6.1.0"; base-R4 label passes through. */
function profileLabel(schema: string): string {
  return schema.includes('/') ? (schema.split('/').pop() ?? schema) : schema
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
  const [fhirValidating, setFhirValidating] = useState(false)
  const [fhirValidateError, setFhirValidateError] = useState<string | null>(null)
  const [fhirValidationResult, setFhirValidationResult] = useState<FhirValidationResponse | null>(null)

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

  /** What each transformed resource will be validated against, shown before you click. */
  const plannedProfiles: { resourceType: string | null; profile: string | null }[] = !fhirResult
    ? []
    : fhirResult.kind === 'single'
      ? [
          {
            resourceType: rootResourceType(fhirResult.xml),
            profile: profileForResource(rootResourceType(fhirResult.xml)),
          },
        ]
      : fhirResult.parts.map((p) => ({
          resourceType: p.resourceType,
          profile: profileForResource(p.resourceType),
        }))

  /** Resource type badge for a validated file — from the transform parts, or the XML root. */
  const resourceTypeFor = (fileName: string): string | null => {
    if (!fhirResult) return null
    if (fhirResult.kind === 'multipart') {
      return fhirResult.parts.find((p) => p.filename === fileName)?.resourceType ?? null
    }
    return rootResourceType(fhirResult.xml)
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  const resetFhirValidation = () => {
    setFhirProfileChoice(undefined)
    setFhirFromCustomXslt(false)
    setFhirValidationResult(null)
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
    if (!fhirResult) return
    setFhirValidating(true)
    setFhirValidateError(null)
    setFhirValidationResult(null)

    try {
      const base = selectedCanonical ? fhirExportBasename(selectedCanonical) : 'fhir-output'
      const files =
        fhirResult.kind === 'single'
          ? [
              {
                fileName: `${base}-fhir.xml`,
                xml: fhirResult.xml,
                profile: profileForResource(rootResourceType(fhirResult.xml)),
              },
            ]
          : fhirResult.parts.map((p) => ({
              fileName: p.filename,
              xml: p.xml,
              profile: profileForResource(p.resourceType),
            }))

      setFhirValidationResult(await validateFhirXml(files))
      addToHistory({
        label: `${displayName} FHIR validated`,
        actionType: 'fhir-validated',
        fileType: 'fhir',
        serverFilename: null,
      })
    } catch (e) {
      setFhirValidateError((e as Error).message)
    } finally {
      setFhirValidating(false)
    }
  }

  const handleTransform = async (useCustomXslt: boolean) => {
    if (!canonicalXml || !canonicalFilename) return
    setTransforming(true)
    setTransformError(null)
    setFhirResult(null)
    setFhirValidationResult(null)
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
                className="pointer-events-none absolute left-6 top-0 z-20 hidden group-hover:block w-80 rounded-lg border border-gray-200 bg-white p-3 text-xs font-normal leading-relaxed text-gray-900 shadow-lg"
              >
                Checks each transformed FHIR resource against its US Core {US_CORE_VERSION}{' '}
                StructureDefinition — required elements, cardinality, value-set bindings and
                invariants. Resource types US Core does not profile (such as ExplanationOfBenefit
                or HealthcareService) are checked against base FHIR R4 instead. Validation runs on
                HL7&apos;s public validator at validator.fhir.org; only synthetic data is sent.
              </span>
            </span>
          </div>

          {plannedProfiles.length > 0 && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-semibold text-gray-900 mb-2">
                {displayName}: profiles used
              </div>
              <ul className="space-y-1">
                {plannedProfiles.map((p, i) => (
                  <li key={`${p.resourceType}-${i}`} className="flex items-center gap-2 text-xs">
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
              <ShieldCheck className="w-4 h-4" />
              {fhirValidating ? 'Validating…' : 'Validate FHIR'}
            </button>
          </div>

          {fhirValidateError && (
            <div className="mt-3 flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
              {fhirValidateError}
            </div>
          )}

          {fhirValidationResult && (
            <div className="mt-4 space-y-4">
              {fhirValidationResult.files.length > 1 && (
                <div className="text-xs text-gray-900">
                  <span className="font-semibold">
                    {fhirValidationResult.files.filter((f) => f.valid).length}
                  </span>{' '}
                  of {fhirValidationResult.files.length} resources valid ·{' '}
                  {fhirValidationResult.error_count} total issue
                  {fhirValidationResult.error_count === 1 ? '' : 's'}
                </div>
              )}

              {fhirValidationResult.files.map((file) => (
                <div key={file.fileName}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="badge-fhir">{resourceTypeFor(file.fileName) ?? 'FHIR'}</span>
                    <span className="text-xs font-mono text-gray-900">{file.fileName}</span>
                  </div>
                  <ValidationResult
                    result={{
                      valid: file.valid,
                      schema: profileLabel(file.schema),
                      error_count: file.error_count,
                      errors: file.errors,
                    }}
                  />
                </div>
              ))}
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
