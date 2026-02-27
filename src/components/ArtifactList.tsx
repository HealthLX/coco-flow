import { useQuery } from '@tanstack/react-query'
import { Download, FileX, RefreshCw } from 'lucide-react'
import {
  getCanonicalSamples,
  getFhirSamples,
  downloadCanonicalSample,
  downloadFhirSample,
  type SampleFile,
} from '../services/api'
import { useAppContext } from '../context/AppContext'

function TypeBadge({ type }: { type: SampleFile['type'] }) {
  return type === 'canonical' ? (
    <span className="badge-canonical">CANONICAL</span>
  ) : (
    <span className="badge-fhir">FHIR</span>
  )
}

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return '—'
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatBytes(bytes?: number): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  filterTarget?: string
}

export default function ArtifactList({ filterTarget }: Props) {
  const { pushLog } = useAppContext()

  const canonicalQuery = useQuery({
    queryKey: ['samples', 'canonical'],
    queryFn: getCanonicalSamples,
  })

  const fhirQuery = useQuery({
    queryKey: ['samples', 'fhir'],
    queryFn: getFhirSamples,
  })

  const isLoading = canonicalQuery.isLoading || fhirQuery.isLoading
  const isError = canonicalQuery.isError || fhirQuery.isError

  const allFiles: SampleFile[] = [
    ...(canonicalQuery.data ?? []),
    ...(fhirQuery.data ?? []),
  ].filter((f) => !filterTarget || f.target === filterTarget || f.filename.includes(filterTarget))

  async function handleDownload(file: SampleFile) {
    try {
      pushLog('info', `Downloading ${file.filename}…`)
      if (file.type === 'canonical') {
        await downloadCanonicalSample(file.filename)
      } else {
        await downloadFhirSample(file.filename)
      }
      pushLog('success', `Downloaded ${file.filename}`)
    } catch (err) {
      pushLog('error', `Download failed: ${(err as Error).message}`)
    }
  }

  const refetch = () => {
    canonicalQuery.refetch()
    fhirQuery.refetch()
  }

  return (
    <div className="card overflow-hidden">
      {/* Table header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
          Generated Artifacts
          {allFiles.length > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-400 normal-case">
              ({allFiles.length} file{allFiles.length !== 1 ? 's' : ''})
            </span>
          )}
        </h2>
        <button
          onClick={refetch}
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
          Loading artifacts…
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 text-red-400 text-sm gap-2">
          <FileX className="w-8 h-8" />
          <p>Failed to load artifacts. Is the FastAPI server running?</p>
        </div>
      ) : allFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm gap-2">
          <FileX className="w-8 h-8" />
          <p>No artifacts found{filterTarget ? ` for "${filterTarget}"` : ''}.</p>
          <p className="text-xs text-gray-400">Generate a sample using the Actions panel above.</p>
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
                  Target
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Generated
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
              {allFiles.map((file, i) => (
                <tr
                  key={file.filename}
                  className={[
                    'border-b border-gray-50 transition-colors hover:bg-red-50/30',
                    i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                  ].join(' ')}
                >
                  <td className="px-5 py-3 font-mono text-xs text-gray-700 max-w-xs truncate">
                    {file.filename}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={file.type} />
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">
                    {file.target?.replace(/-/g, ' ') ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {formatRelativeTime(file.modified)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {formatBytes(file.size)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleDownload(file)}
                      title={`Download ${file.filename}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-coco-red border border-coco-red/30 hover:bg-red-50 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
