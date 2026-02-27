import { useQuery } from '@tanstack/react-query'
import { FileCode2, Download, RefreshCw, FileX, ExternalLink } from 'lucide-react'
import { getSchemas, downloadSchema, type SchemaFile } from '../services/api'
import { useAppContext } from '../context/AppContext'

function formatBytes(bytes?: number): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SchemasPage() {
  const { pushLog } = useAppContext()

  const { data: schemas = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['schemas'],
    queryFn: getSchemas,
  })

  async function handleDownload(schema: SchemaFile) {
    try {
      pushLog('info', `Downloading schema: ${schema.filename}…`)
      await downloadSchema(schema.filename)
      pushLog('success', `Downloaded ${schema.filename}`)
    } catch (err) {
      pushLog('error', `Schema download failed: ${(err as Error).message}`)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Heading */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <FileCode2 className="w-5 h-5" style={{ color: '#c0392b' }} />
          <h1 className="text-2xl font-bold text-gray-900">Schemas</h1>
          <span className="text-sm text-gray-400 font-normal">v10.0 XSD</span>
        </div>
        <p className="text-sm text-gray-500">
          Download XML Schema Definition (XSD) files for all CoCo canonical models.
        </p>
      </div>

      {/* Info card */}
      <div className="card p-4 flex items-start gap-3 border-l-4" style={{ borderLeftColor: '#c0392b' }}>
        <ExternalLink className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#c0392b' }} />
        <div>
          <p className="text-sm font-medium text-gray-800">CMS Compliance Schemas</p>
          <p className="text-xs text-gray-500 mt-0.5">
            These XSD schemas define the canonical data models for CMS-9115-F and CMS-0057-F compliance.
            Each schema version is traceable to regulatory source material.
          </p>
        </div>
      </div>

      {/* Schemas table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Available Schemas
            {schemas.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-400 normal-case">
                ({schemas.length} file{schemas.length !== 1 ? 's' : ''})
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
            Loading schemas…
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-red-400 text-sm gap-2">
            <FileX className="w-8 h-8" />
            <p>Failed to load schemas. Is the FastAPI server running?</p>
          </div>
        ) : schemas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm gap-2">
            <FileX className="w-8 h-8" />
            <p>No schema files found.</p>
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
                    Version
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
                {schemas.map((schema, i) => (
                  <tr
                    key={schema.filename}
                    className={[
                      'border-b border-gray-50 transition-colors hover:bg-red-50/30',
                      i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                    ].join(' ')}
                  >
                    <td className="px-5 py-3 flex items-center gap-2">
                      <FileCode2 className="w-4 h-4 text-purple-500 flex-shrink-0" />
                      <span className="font-mono text-xs text-gray-700">{schema.filename}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge-xsd">XSD</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {schema.version ?? 'v10.0'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {formatBytes(schema.size)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleDownload(schema)}
                        title={`Download ${schema.filename}`}
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
    </div>
  )
}
