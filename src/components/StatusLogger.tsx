import { useEffect, useRef } from 'react'
import { CheckCircle, XCircle, Info, Clock, Trash2, Terminal } from 'lucide-react'
import { useAppContext, type LogEntry } from '../context/AppContext'

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function LevelIcon({ level }: { level: LogEntry['level'] }) {
  switch (level) {
    case 'success':
      return <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
    case 'error':
      return <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
    case 'pending':
      return <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5 animate-pulse" />
    default:
      return <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
  }
}

function levelColor(level: LogEntry['level']): string {
  switch (level) {
    case 'success': return 'text-green-400'
    case 'error': return 'text-red-400'
    case 'pending': return 'text-amber-400'
    default: return 'text-blue-300'
  }
}

export default function StatusLogger() {
  const { logs, clearLogs } = useAppContext()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="card flex flex-col h-full min-h-[280px]">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 rounded-t-lg"
        style={{ backgroundColor: '#1e2d3d' }}
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-white/50" />
          <span className="text-xs font-semibold text-white/60 uppercase tracking-widest">
            Activity Log
          </span>
          {logs.length > 0 && (
            <span className="text-[10px] bg-white/10 text-white/40 rounded px-1.5 py-0.5">
              {logs.length}
            </span>
          )}
        </div>
        <button
          onClick={clearLogs}
          className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60 transition-colors"
          title="Clear log"
        >
          <Trash2 className="w-3 h-3" />
          Clear
        </button>
      </div>

      {/* Log entries */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs rounded-b-lg"
        style={{ backgroundColor: '#1e2d3d', minHeight: '200px' }}
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/20">
            <Terminal className="w-6 h-6 mb-2" />
            <span>No activity yet. Select a canonical and run an action.</span>
          </div>
        ) : (
          logs.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2 py-0.5">
              <span className="text-white/25 flex-shrink-0 tabular-nums">
                {formatTime(entry.timestamp)}
              </span>
              <LevelIcon level={entry.level} />
              <span className={levelColor(entry.level)}>{entry.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
