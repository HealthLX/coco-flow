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
} from 'lucide-react'
import {
  getBuilds,
  generateSampleContent,
  generateCustomXsdContent,
  transformSampleContent,
  transformUpload,
} from '../services/api'
import type { Build } from '../services/api'
import { addToHistory } from '../lib/history'
import XmlPreview from '../components/XmlPreview'
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
    description: 'Explanation of Benefits — claims and adjudication data',
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
    description: 'Practitioners and organizations — NPIs, specialties, networks',
  },
  {
    name: 'clinical',
    label: 'Clinical',
    schemaFile: 'Clinical.xsd',
    description: 'Clinical patient data, diagnoses, procedures and encounters',
  },
]

function hasBuiltinTransform(builds: Build[], name: string): boolean {
  return builds.some((b) => b.canonical_name === name && b.transform_file != null)
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

// ── Component ─────────────────────────────────────────────────────────────

type SelectorTab = 'predefined' | 'custom'

export default function WorkspacePage() {
  const { data: builds = [] } = useQuery({ queryKey: ['builds'], queryFn: getBuilds })

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

  // ── Transform state ───────────────────────────────────────────────────────
  const [transforming, setTransforming] = useState(false)
  const [transformError, setTransformError] = useState<string | null>(null)
  const [fhirXml, setFhirXml] = useState<string | null>(null)
  const [fhirFilename, setFhirFilename] = useState<string | null>(null)
  const [showXsltUpload, setShowXsltUpload] = useState(false)
  const [xsltFile, setXsltFile] = useState<File | null>(null)
  const xsltInputRef = useRef<HTMLInputElement>(null)

  // ── Derived values ────────────────────────────────────────────────────────
  const isPredefined = selectorTab === 'predefined'
  const canGenerate =
    (isPredefined && !!selectedCanonical) ||
    (!isPredefined && !!xsdFile && !!rootElement.trim())
  const hasGenerated = !!canonicalXml

  const activeTransform =
    isPredefined && !!selectedCanonical && hasBuiltinTransform(builds, selectedCanonical)

  const displayName = isPredefined
    ? (CANONICALS.find((c) => c.name === selectedCanonical)?.label ?? selectedCanonical ?? '')
    : xsdFile?.name ?? 'Custom XSD'

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleTabChange = (tab: SelectorTab) => {
    setSelectorTab(tab)
    setSelectedCanonical(null)
    setCanonicalXml(null)
    setCanonicalFilename(null)
    setFhirXml(null)
    setFhirFilename(null)
    setGenerateError(null)
    setTransformError(null)
  }

  const handleSelectCanonical = (name: string) => {
    setSelectedCanonical(name)
    setCanonicalXml(null)
    setCanonicalFilename(null)
    setFhirXml(null)
    setFhirFilename(null)
    setGenerateError(null)
    setTransformError(null)
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
    setFhirXml(null)
    setFhirFilename(null)

    try {
      if (isPredefined && selectedCanonical) {
        const xml = await generateSampleContent(selectedCanonical)
        const filename = `${selectedCanonical}-sample.xml`
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

  const handleTransform = async (useCustomXslt: boolean) => {
    if (!canonicalXml || !canonicalFilename) return
    setTransforming(true)
    setTransformError(null)
    setFhirXml(null)
    setFhirFilename(null)

    try {
      let fhir: string

      if (useCustomXslt && xsltFile) {
        fhir = await transformUpload(canonicalXml, canonicalFilename, xsltFile)
        const name = `${xsltFile.name.replace(/\.xsl[t]?$/i, '')}-fhir.xml`
        setFhirFilename(name)
        addToHistory({
          label: `${displayName} → FHIR (custom XSLT)`,
          actionType: 'transformed',
          fileType: 'fhir',
          serverFilename: null,
        })
      } else if (isPredefined && selectedCanonical && activeTransform) {
        fhir = await transformSampleContent(selectedCanonical)
        const name = `${selectedCanonical}-fhir.xml`
        setFhirFilename(name)
        addToHistory({
          label: `${displayName} → FHIR`,
          actionType: 'transformed',
          fileType: 'fhir',
          serverFilename: name,
        })
      } else {
        throw new Error('No transform available.')
      }

      setFhirXml(fhir)
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
    if (fhirXml && fhirFilename) downloadXmlFromMemory(fhirXml, fhirFilename)
  }
  const exportBoth = () => {
    exportCanonical()
    setTimeout(exportFhir, 300)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Workspace</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Select a schema, generate a sample, and optionally transform to FHIR.
        </p>
      </div>

      {/* ── Step 1: Schema selection ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-red text-white text-xs font-bold flex-shrink-0">
            1
          </div>
          <h2 className="text-sm font-semibold text-gray-800">Select Schema</h2>
        </div>

        {/* Tab strip */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => handleTabChange('predefined')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              selectorTab === 'predefined'
                ? 'border-coco-red text-coco-red'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            CoCo Canonical Schemas
          </button>
          <button
            onClick={() => handleTabChange('custom')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              selectorTab === 'custom'
                ? 'border-coco-red text-coco-red'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Upload Custom XSD
          </button>
        </div>

        {/* Predefined schemas table */}
        {selectorTab === 'predefined' && (
          <div className="divide-y divide-gray-50">
            {/* Header row */}
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-5 py-2.5 bg-gray-50 border-b border-gray-100">
              <div className="w-5" />
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Schema</div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider w-28 text-right">
                FHIR Transform
              </div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider w-44 text-right">
                XSD File
              </div>
            </div>

            {CANONICALS.map((c) => {
              const isSelected = selectedCanonical === c.name
              const xform = hasBuiltinTransform(builds, c.name)
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
                    <div className="text-xs text-gray-400 mt-0.5">{c.description}</div>
                  </div>

                  {/* Transform badge */}
                  <div className="w-28 flex justify-end">
                    {xform ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 whitespace-nowrap">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                        Available
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
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
        )}

        {/* Custom XSD */}
        {selectorTab === 'custom' && (
          <div className="px-5 py-5">
            <p className="text-xs text-gray-500 mb-5">
              Upload any XSD schema to generate a synthetic sample XML. You can also upload a
              custom XSLT in the transform step.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  XSD Schema File
                </label>
                <input
                  ref={xsdInputRef}
                  type="file"
                  accept=".xsd"
                  title="Select an XSD schema file"
                  aria-label="Select XSD schema file"
                  onChange={(e) => handleXsdFileChange(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer border border-gray-200 rounded px-2 py-1"
                />
                {xsdFile && (
                  <p className="text-xs text-gray-400 mt-1">
                    Selected: <span className="font-medium text-gray-600">{xsdFile.name}</span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Root Element Name
                </label>
                <input
                  type="text"
                  value={rootElement}
                  onChange={(e) => setRootElement(e.target.value)}
                  placeholder="e.g. roster"
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-coco-red focus:ring-1 focus:ring-coco-red placeholder:text-gray-300"
                />
                <p className="text-[11px] text-gray-400 mt-1">
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
          <h2 className="text-sm font-semibold text-gray-800">Generate Sample XML</h2>
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
            <span className="text-xs text-gray-400">
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

      {/* ── Step 3: Transform ── */}
      {hasGenerated && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-red text-white text-xs font-bold flex-shrink-0">
              3
            </div>
            <h2 className="text-sm font-semibold text-gray-800">Transform to FHIR</h2>
            <span className="text-xs text-gray-400">(optional)</span>
          </div>

          <div className="space-y-4">
            {/* Built-in transform */}
            {selectorTab === 'predefined' && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleTransform(false)}
                  disabled={!activeTransform || transforming}
                  className="btn-primary disabled:opacity-40"
                  title={
                    activeTransform
                      ? undefined
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
                {!activeTransform && (
                  <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded px-2.5 py-1 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
                    No built-in transform — upload a custom XSLT below
                  </span>
                )}
              </div>
            )}

            {/* Custom XSLT upload */}
            <div className={selectorTab === 'predefined' ? 'border-t border-gray-100 pt-4' : ''}>
              <button
                onClick={() => setShowXsltUpload((v) => !v)}
                className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload custom XSLT
                {showXsltUpload ? (
                  <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                )}
              </button>

              {showXsltUpload && (
                <div className="mt-3 flex items-end gap-4 flex-wrap">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      XSLT Stylesheet (.xsl / .xslt)
                    </label>
                    <input
                      ref={xsltInputRef}
                      type="file"
                      accept=".xsl,.xslt"
                      title="Select an XSLT stylesheet"
                      aria-label="Select XSLT stylesheet"
                      onChange={(e) => setXsltFile(e.target.files?.[0] ?? null)}
                      className="block text-xs text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer border border-gray-200 rounded px-2 py-1"
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
      {fhirXml && (
        <XmlPreview
          content={fhirXml}
          title={fhirFilename ?? 'FHIR Output'}
          badgeClass="badge-fhir"
          badgeLabel="FHIR"
        />
      )}

      {/* ── Step 4: Export ── */}
      {hasGenerated && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-red text-white text-xs font-bold flex-shrink-0">
              4
            </div>
            <h2 className="text-sm font-semibold text-gray-800">Export</h2>
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={exportCanonical} className="btn-secondary">
              <Download className="w-4 h-4" />
              Export Canonical XML
            </button>
            <button
              onClick={exportFhir}
              disabled={!fhirXml}
              className="btn-secondary disabled:opacity-40"
              title={!fhirXml ? 'Transform first to export FHIR output' : undefined}
            >
              <Download className="w-4 h-4" />
              Export FHIR XML
            </button>
            {fhirXml && (
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
