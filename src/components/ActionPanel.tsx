import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, ArrowRightLeft, RefreshCw } from 'lucide-react'
import { generateSample, transformSample, regenerateAndDownload } from '../services/api'
import { useAppContext } from '../context/AppContext'

export default function ActionPanel() {
  const { selectedCanonical, pushLog } = useAppContext()
  const qc = useQueryClient()

  const disabled = !selectedCanonical

  const generateMutation = useMutation({
    mutationFn: () => generateSample(selectedCanonical),
    onMutate: () => pushLog('info', `Generating sample XML for "${selectedCanonical}"…`),
    onSuccess: (res) => {
      if (res.success) {
        pushLog('success', `Sample generated: ${res.filename ?? selectedCanonical + '-sample.xml'}`)
      } else {
        pushLog('error', `Generation failed: ${res.error ?? res.message ?? 'unknown error'}`)
      }
      qc.invalidateQueries({ queryKey: ['samples'] })
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
      qc.invalidateQueries({ queryKey: ['samples'] })
    },
    onError: (err: Error) => pushLog('error', `Transform error: ${err.message}`),
  })

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateAndDownload(selectedCanonical),
    onMutate: () => pushLog('info', `Regenerating and downloading "${selectedCanonical}"…`),
    onSuccess: () => {
      pushLog('success', `Regenerated and downloaded ${selectedCanonical}-sample.xml`)
      qc.invalidateQueries({ queryKey: ['samples'] })
    },
    onError: (err: Error) => pushLog('error', `Regenerate error: ${err.message}`),
  })

  const actions = [
    {
      label: 'Generate Sample XML',
      description: 'Create a new canonical XML sample for the selected model',
      icon: FileText,
      mutation: generateMutation,
      variant: 'secondary' as const,
    },
    {
      label: 'Transform to FHIR',
      description: 'Run the XSLT transform to produce a FHIR-compatible XML output',
      icon: ArrowRightLeft,
      mutation: transformMutation,
      variant: 'secondary' as const,
    },
    {
      label: 'Regenerate & Download',
      description: 'Regenerate the canonical sample and download it immediately',
      icon: RefreshCw,
      mutation: regenerateMutation,
      variant: 'primary' as const,
    },
  ]

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Actions</h2>
        {!selectedCanonical && (
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
            Select a canonical to enable
          </span>
        )}
      </div>
      <div className="space-y-3">
        {actions.map(({ label, description, icon: Icon, mutation, variant }) => {
          const isPending = mutation.isPending

          return (
            <button
              key={label}
              onClick={() => mutation.mutate()}
              disabled={disabled || isPending}
              className={[
                'w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left',
                variant === 'primary'
                  ? 'bg-coco-red border-coco-red text-white hover:bg-coco-red-hover disabled:opacity-50'
                  : 'bg-white border-gray-200 text-gray-800 hover:border-coco-red hover:bg-red-50 disabled:opacity-50',
                disabled || isPending ? 'cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              <div
                className={[
                  'flex-shrink-0 mt-0.5 p-1.5 rounded-md',
                  variant === 'primary' ? 'bg-white/20' : 'bg-red-50',
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
                    className={`w-4 h-4 ${variant === 'primary' ? 'text-white' : 'text-coco-red'}`}
                  />
                )}
              </div>
              <div className="min-w-0">
                <div
                  className={`text-sm font-semibold ${variant === 'primary' ? 'text-white' : 'text-gray-800'}`}
                >
                  {label}
                </div>
                <div
                  className={`text-xs mt-0.5 leading-relaxed ${variant === 'primary' ? 'text-white/70' : 'text-gray-500'}`}
                >
                  {description}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
