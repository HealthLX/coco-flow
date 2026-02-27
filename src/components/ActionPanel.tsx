import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, ArrowRightLeft, RefreshCw, Upload, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import { generateSample, transformSample, regenerateAndDownload, getBuilds, uploadCustomXsd } from '../services/api'
import { useAppContext } from '../context/AppContext'

export default function ActionPanel() {
  const { selectedCanonical, pushLog } = useAppContext()
  const qc = useQueryClient()

  const [showUpload, setShowUpload] = useState(false)
  const [rootElement, setRootElement] = useState('')
  const [xsdFile, setXsdFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const disabled = !selectedCanonical

  const { data: builds = [] } = useQuery({ queryKey: ['builds'], queryFn: getBuilds })
  const hasTransform = builds.some(
    (b) => b.canonical_name === selectedCanonical && b.transform_file != null,
  )

  const generateMutation = useMutation({
    mutationFn: () => generateSample(selectedCanonical),
    onMutate: () => pushLog('info', `Generating sample XML for "${selectedCanonical}"…`),
    onSuccess: (res) => {
      if (res.success) {
        pushLog('success', `Sample generated: ${res.filename ?? selectedCanonical + '-sample.xml'}`)
      } else {
        pushLog('error', `Generation failed: ${res.error ?? res.message ?? 'unknown error'}`)
      }
      qc.invalidateQueries({ queryKey: ['samples', 'canonical'] })
      qc.invalidateQueries({ queryKey: ['samples', 'fhir'] })
    },
    onError: (err: Error) => pushLog('error', `Generate error: ${err.message}`),
  })

  const transformMutation = useMutation({
    mutationFn: () => transformSample(selectedCanonical),
    onMutate: () => pushLog('info', `Running XSLT transform for "${selectedCanonical}"…`),
    onSuccess: (res) => {
      if (res.success) {
        pushLog('success', `Transform complete: ${res.filename ?? selectedCanonical + '-fhir.xml'}`)
      } else {
        pushLog('error', `Transform failed: ${res.error ?? res.message ?? 'unknown error'}`)
      }
      qc.invalidateQueries({ queryKey: ['samples', 'canonical'] })
      qc.invalidateQueries({ queryKey: ['samples', 'fhir'] })
    },
    onError: (err: Error) => pushLog('error', `Transform error: ${err.message}`),
  })

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateAndDownload(selectedCanonical),
    onMutate: () => pushLog('info', `Regenerating and downloading "${selectedCanonical}"…`),
    onSuccess: () => {
      pushLog('success', `Regenerated and downloaded ${selectedCanonical}-sample.xml`)
      qc.invalidateQueries({ queryKey: ['samples', 'canonical'] })
      qc.invalidateQueries({ queryKey: ['samples', 'fhir'] })
    },
    onError: (err: Error) => pushLog('error', `Regenerate error: ${err.message}`),
  })

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!xsdFile) throw new Error('No file selected')
      if (!rootElement.trim()) throw new Error('Root element name is required')
      return uploadCustomXsd(xsdFile, rootElement.trim())
    },
    onMutate: () => pushLog('info', `Generating sample from custom XSD "${xsdFile?.name}"…`),
    onSuccess: () => {
      pushLog('success', `Custom XSD sample generated and downloaded`)
      setXsdFile(null)
      setRootElement('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    onError: (err: Error) => pushLog('error', `Custom XSD error: ${err.message}`),
  })

  const transformDisabledReason =
    disabled
      ? 'Select a canonical first'
      : !hasTransform
        ? `No XSLT transform is configured for "${selectedCanonical}"`
        : undefined

  const actions = [
    {
      label: 'Generate Sample XML',
      description: 'Create a new canonical XML sample for the selected model',
      icon: FileText,
      mutation: generateMutation,
      variant: 'secondary' as const,
      isDisabled: disabled,
      disabledReason: disabled ? 'Select a canonical first' : undefined,
    },
    {
      label: 'Transform to FHIR',
      description: 'Run the XSLT transform to produce a FHIR-compatible XML output',
      icon: ArrowRightLeft,
      mutation: transformMutation,
      variant: 'secondary' as const,
      isDisabled: disabled || !hasTransform,
      disabledReason: transformDisabledReason,
    },
    {
      label: 'Regenerate & Download',
      description: 'Regenerate the canonical sample and download it immediately',
      icon: RefreshCw,
      mutation: regenerateMutation,
      variant: 'primary' as const,
      isDisabled: disabled,
      disabledReason: disabled ? 'Select a canonical first' : undefined,
    },
  ]

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Actions</h2>
        {!selectedCanonical && (
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
            Select a canonical to enable
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        {actions.map(({ label, description, icon: Icon, mutation, variant, isDisabled, disabledReason }) => {
          const isPending = mutation.isPending
          const locked = isDisabled && !isPending

          return (
            <div key={label} className="relative group">
              <button
                onClick={() => !isDisabled && mutation.mutate()}
                disabled={isDisabled || isPending}
                title={disabledReason}
                className={[
                  'w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left',
                  variant === 'primary'
                    ? 'bg-coco-red border-coco-red text-white hover:bg-coco-red-hover disabled:opacity-50'
                    : locked
                      ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-white border-gray-200 text-gray-800 hover:border-coco-red hover:bg-red-50 disabled:opacity-50',
                  isPending ? 'cursor-wait' : locked ? 'cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
              >
                <div
                  className={[
                    'flex-shrink-0 mt-0.5 p-1.5 rounded-md',
                    variant === 'primary' ? 'bg-white/20' : locked ? 'bg-gray-100' : 'bg-red-50',
                  ].join(' ')}
                >
                  {isPending ? (
                    <span
                      className={[
                        'block w-4 h-4 border-2 rounded-full animate-spin',
                        variant === 'primary'
                          ? 'border-white/30 border-t-white'
                          : 'border-red-200 border-t-coco-red',
                      ].join(' ')}
                    />
                  ) : (
                    <Icon
                      className={`w-4 h-4 ${variant === 'primary' ? 'text-white' : locked ? 'text-gray-400' : 'text-coco-red'}`}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-sm font-semibold ${variant === 'primary' ? 'text-white' : locked ? 'text-gray-400' : 'text-gray-800'}`}
                  >
                    {label}
                  </div>
                  <div
                    className={`text-xs mt-0.5 leading-relaxed ${variant === 'primary' ? 'text-white/70' : locked ? 'text-gray-300' : 'text-gray-500'}`}
                  >
                    {description}
                  </div>
                </div>
                {/* No-transform indicator */}
                {label === 'Transform to FHIR' && !disabled && !hasTransform && (
                  <div className="flex-shrink-0 flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 self-center ml-auto">
                    <AlertCircle className="w-3 h-3" />
                    No transform
                  </div>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Custom XSD upload */}
      <div className="border-t border-gray-100 pt-3">
        <button
          onClick={() => setShowUpload((v) => !v)}
          className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors w-full"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Custom XSD
          {showUpload ? (
            <ChevronUp className="w-3 h-3 ml-auto" />
          ) : (
            <ChevronDown className="w-3 h-3 ml-auto" />
          )}
        </button>

        {showUpload && (
          <div className="mt-3 space-y-2.5">
            <div>
              <label htmlFor="xsd-file-input" className="block text-[11px] text-gray-500 font-medium mb-1">XSD File</label>
              <input
                ref={fileInputRef}
                id="xsd-file-input"
                type="file"
                accept=".xsd"
                title="Select an XSD schema file"
                aria-label="Select XSD schema file"
                onChange={(e) => setXsdFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-red-50 file:text-coco-red hover:file:bg-red-100 cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 font-medium mb-1">
                Root Element Name
              </label>
              <input
                type="text"
                value={rootElement}
                onChange={(e) => setRootElement(e.target.value)}
                placeholder="e.g. roster"
                className="w-full text-xs border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-coco-red focus:ring-1 focus:ring-coco-red placeholder:text-gray-300"
              />
            </div>
            <button
              onClick={() => uploadMutation.mutate()}
              disabled={!xsdFile || !rootElement.trim() || uploadMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs font-semibold bg-coco-red text-white hover:bg-coco-red-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploadMutation.isPending ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Generate &amp; Download
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
