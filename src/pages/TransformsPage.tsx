import { useQuery } from '@tanstack/react-query'
import { Shuffle, Download, RefreshCw, FileX, ArrowRight } from 'lucide-react'
import { getTransforms, downloadTransform, type TransformFile } from '../services/api'
import { useAppContext } from '../context/AppContext'

function formatBytes(bytes?: number): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function inferSourceTarget(filename: string): { source: string; target: string } {
  const lower = filename.toLowerCase().replace('.xsl', '').replace('.xslt', '')
  const parts = lower.split('-')
  if (parts.length >= 2) {
    return { source: parts[0], target: parts[parts.length - 1] }
  }
  return { source: lower, target: 'fhir' }
}

export default function TransformsPage() {
  const { pushLog } = useAppContext()

  const { data: transforms = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['transforms'],
    queryFn: getTransforms,
  })

  async function handleDownload(tf: TransformFile) {
    try {
      pushLog('info', `Downloading transform: ${tf.filename}…`)
      await downloadTransform(tf.filename)
      pushLog('success', `Downloaded ${tf.filename}`)
    } catch (err) {
      pushLog('error', `Transform download failed: ${(err as Error).message}`)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Heading */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Shuffle className="w-5 h-5" style={{ color: '#c0392b' }} />
          <h1 className="text-2xl font-bold text-gray-900">Transforms</h1>
          <span className="text-sm text-gray-400 font-normal">XSLT</span>
        </div>
        <p className="text-sm text-gray-500">
          Download XSLT stylesheets used to transform CoCo canonical XML into FHIR-compatible outputs.
        </p>
      </div>

      {/* Info card */}
      <div className="card p-4 flex items-start gap-3 border-l-4" style={{ borderLeftColor: '#c0392b' }}>
        <ArrowRight className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#c0392b' }} />
        <div>
          <p className="text-sm font-medium text-gray-800">Canonical → FHIR Mapping</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Each XSLT file maps a CoCo canonical model to its corresponding FHIR R4 resource structure.
            Run transforms via the Discover page or directly via the FastAPI endpoint.
          </p>
        </div>
      </div>

      {/* Transforms table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Available Transforms
            {transforms.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-400 normal-case">
                ({transforms.length} file{transforms.length !== 1 ? 's' : ''})
              </span>
            )}
          </h2>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-coco-red transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading transforms…
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-red-400 text-sm gap-2">
            <FileX className="w-8 h-8" />
            <p>Failed to load transforms. Is the FastAPI server running?</p>
          </div>
        ) : transforms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm gap-2">
            <FileX className="w-8 h-8" />
            <p>No transform files found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Filename
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Source → Target
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {transforms.map((tf, i) => {
                  const inferred = inferSourceTarget(tf.filename)
                  const source = tf.source ?? inferred.source
                  const targetFmt = tf.target_format ?? inferred.target

                  return (
                    <tr
                      key={tf.filename}
                      className={[
                        'border-b border-gray-50 transition-colors hover:bg-red-50/30',
                        i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                      ].join(' ')}
                    >
                      <td className="px-5 py-3 flex items-center gap-2">
                        <Shuffle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        <span className="font-mono text-xs text-gray-700">{tf.filename}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge-xslt">XSLT</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="badge-canonical capitalize">{source}</span>
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          <span className="badge-fhir uppercase">{targetFmt}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatBytes(tf.size)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleDownload(tf)}
                          title={`Download ${tf.filename}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-coco-red border border-coco-red/30 hover:bg-red-50 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          Download
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
