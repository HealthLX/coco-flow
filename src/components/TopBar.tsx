import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity } from 'lucide-react'
import { checkHealth } from '../services/api'
import { useAppContext } from '../context/AppContext'

const PAGE_TITLES: Record<string, string> = {
  '/discover': 'Discover / Builds',
  '/schemas': 'Schemas',
  '/transforms': 'Transforms',
}

export default function TopBar() {
  const { pathname } = useLocation()
  const { selectedCanonical } = useAppContext()

  const { data: healthy } = useQuery({
    queryKey: ['health'],
    queryFn: checkHealth,
    refetchInterval: 15_000,
  })

  const title = PAGE_TITLES[pathname] ?? 'CoCo Flow'

  return (
    <header
      className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200"
      style={{ borderBottom: '1px solid #e2e8f0' }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-400">CoCo Flow</span>
        <span className="text-gray-300">/</span>
        <span className="font-semibold text-gray-800">{title}</span>
        {selectedCanonical && pathname === '/discover' && (
          <>
            <span className="text-gray-300">/</span>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold text-white uppercase tracking-wide"
              style={{ backgroundColor: '#c0392b' }}
            >
              {selectedCanonical.replace(/-/g, ' ')} — ACTIVE
            </span>
          </>
        )}
      </div>

      {/* Right side: API status */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Activity className="w-3.5 h-3.5" />
        <span>FastAPI</span>
        <span
          className={`w-2 h-2 rounded-full ${healthy ? 'bg-green-400' : 'bg-red-400'}`}
          title={healthy ? 'API reachable' : 'API unreachable'}
        />
        <span className={healthy ? 'text-green-600' : 'text-red-500'}>
          {healthy === undefined ? 'checking…' : healthy ? 'online' : 'offline'}
        </span>
      </div>
    </header>
  )
}
