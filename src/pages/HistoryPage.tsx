import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Trash2, Clock, History, ArrowRight } from 'lucide-react'
import { getHistory, clearHistory, type HistoryEntry } from '../lib/history'
import { downloadCanonicalSample, downloadFhirSample } from '../services/api'

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>(getHistory)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const handleClear = () => {
    if (window.confirm('Clear all history? This cannot be undone.')) {
      clearHistory()
      setEntries([])
    }
  }

  const handleDownload = async (entry: HistoryEntry) => {
    if (!entry.serverFilename) return
    setDownloadingId(entry.id)
    try {
      if (entry.fileType === 'canonical') {
        await downloadCanonicalSample(entry.serverFilename)
      } else {
        await downloadFhirSample(entry.serverFilename)
      }
    } catch (e) {
      alert(`Download failed: ${(e as Error).message}`)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <History className="w-5 h-5 text-gray-400" />
            History
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Local record of generated samples and transforms
          </p>
        </div>

        {entries.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-red-500 transition-colors px-3 py-1.5 rounded hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear all
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="card p-12 text-center">
          <Clock className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400 font-medium">No history yet</p>
          <p className="text-xs text-gray-300 mt-1 mb-5">
            Generated samples and transforms will appear here
          </p>
          <Link to="/workspace" className="btn-primary inline-flex">
            Get started
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="card px-4 py-3 flex items-center gap-4">
              {/* Type badge */}
              <span
                className={entry.fileType === 'canonical' ? 'badge-canonical' : 'badge-fhir'}
              >
                {entry.fileType === 'canonical' ? 'CANONICAL' : 'FHIR'}
              </span>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">
                  {entry.label}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-gray-400" title={formatDate(entry.timestamp)}>
                    {formatRelativeTime(entry.timestamp)}
                  </span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-gray-400 capitalize">{entry.actionType}</span>
                  {entry.serverFilename && (
                    <>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs font-mono text-gray-400 truncate max-w-[200px]">
                        {entry.serverFilename}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Download */}
              {entry.serverFilename ? (
                <button
                  onClick={() => handleDownload(entry)}
                  disabled={downloadingId === entry.id}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-gray-200 text-gray-600 hover:border-coco-red hover:text-coco-red transition-colors disabled:opacity-40"
                >
                  {downloadingId === entry.id ? (
                    <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Download
                </button>
              ) : (
                <span className="flex-shrink-0 text-xs text-gray-300 italic">in-memory only</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
