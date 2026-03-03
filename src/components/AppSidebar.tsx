import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard, Zap, History, Activity } from 'lucide-react'
import { checkHealth } from '../services/api'
import cocoLogo from '../assets/coco.png'

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/workspace', label: 'Workspace', icon: Zap, end: false },
  { to: '/history', label: 'History', icon: History, end: false },
]

export default function AppSidebar() {
  const { data: healthy } = useQuery({
    queryKey: ['health'],
    queryFn: checkHealth,
    refetchInterval: 15_000,
  })

  return (
    <aside
      className="w-56 flex-shrink-0 flex flex-col h-screen"
      style={{ backgroundColor: '#0d1b2a', borderRight: '3px solid #c0392b' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <img
          src={cocoLogo}
          alt="CoCo"
          className="h-10 w-10 rounded object-contain bg-white/5 p-0.5"
        />
        <div>
          <span className="block text-sm font-bold tracking-wider" style={{ color: '#c0392b' }}>
            CoCo Data
          </span>
          <span className="block text-[10px] text-white/40 tracking-wider uppercase">
            Flow v0.1
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all',
                isActive
                  ? 'bg-white/10 text-white border-l-2 border-coco-red pl-[10px]'
                  : 'text-white/60 hover:text-white hover:bg-white/5',
              ].join(' ')
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Schema version + API status */}
      <div className="px-4 pb-5 space-y-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-white/5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-[11px] text-white/40">Schema v10.0</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-white/5">
          <Activity className="w-3 h-3 text-white/40" />
          <span className="text-[11px] text-white/40">CoCo Server</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ml-auto ${
              healthy === undefined
                ? 'bg-white/30'
                : healthy
                  ? 'bg-green-400'
                  : 'bg-red-400'
            }`}
          />
          <span
            className={`text-[11px] ${
              healthy === undefined
                ? 'text-white/30'
                : healthy
                  ? 'text-green-400'
                  : 'text-red-400'
            }`}
          >
            {healthy === undefined ? '…' : healthy ? 'online' : 'offline'}
          </span>
        </div>
      </div>
    </aside>
  )
}
