import { useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Zap,
  FileCode2,
  Network,
  History,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { checkHealth } from '../services/api'
import cocoLogo from '../assets/coco.png'

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/workspace', label: 'Workspace', icon: Zap, end: false },
  { to: '/schemas', label: 'Schemas', icon: FileCode2, end: false },
  { to: '/designer', label: 'Schema Explorer', icon: Network, end: false },
  { to: '/history', label: 'History', icon: History, end: false },
]

export default function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [hover, setHover] = useState(false)
  const hoverTimer = useRef<number>()

  // Pinned collapsed, but hovering the bar temporarily peeks it open.
  const showCollapsed = collapsed && !hover

  const { data: healthy } = useQuery({
    queryKey: ['health'],
    queryFn: checkHealth,
    refetchInterval: 15_000,
  })

  // Peek open only after the cursor dwells on a nav item — so a quick click,
  // or just passing over the bar, doesn't pop it open.
  const onItemDwell = () => {
    if (!collapsed) return
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setHover(true), 300)
  }
  const onLeave = () => {
    window.clearTimeout(hoverTimer.current)
    setHover(false)
  }

  return (
    <aside
      onMouseLeave={onLeave}
      className={`${
        showCollapsed ? 'w-16' : 'w-56'
      } flex-shrink-0 flex flex-col h-screen transition-[width] duration-500 ease-in-out`}
      style={{ backgroundColor: '#0d1b2a', borderRight: '3px solid #c0392b' }}
    >
      {/* Logo + collapse toggle — fixed height so nav items don't shift when toggling */}
      <div
        className={`flex items-center border-b border-white/10 h-20 ${
          showCollapsed ? 'flex-col justify-center gap-1.5 px-2' : 'gap-3 px-5'
        }`}
      >
        <img
          src={cocoLogo}
          alt="CoCo"
          className={`rounded object-contain bg-white/5 p-0.5 flex-shrink-0 transition-all duration-300 ${
            showCollapsed ? 'h-8 w-8' : 'h-10 w-10'
          }`}
        />
        {!showCollapsed && (
          <div className="overflow-hidden whitespace-nowrap">
            <span className="block text-sm font-bold tracking-wider" style={{ color: '#c0392b' }}>
              CoCo Data
            </span>
            <span className="block text-[10px] text-white/40 tracking-wider uppercase">
              Flow v0.1
            </span>
          </div>
        )}
        <button
          onClick={() => {
            setCollapsed((v) => !v)
            setHover(false)
          }}
          title={collapsed ? 'Pin sidebar open' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Pin sidebar open' : 'Collapse sidebar'}
          className={`flex items-center justify-center p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors ${
            showCollapsed ? '' : 'ml-auto'
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-3 space-y-1 overflow-y-auto ${showCollapsed ? 'px-2' : 'px-3'}`}>
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onMouseEnter={onItemDwell}
            title={showCollapsed ? label : undefined}
            className={({ isActive }) =>
              [
                'flex items-center rounded-md text-sm font-medium transition-all',
                showCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
                isActive
                  ? showCollapsed
                    ? 'bg-white/10 text-white'
                    : 'bg-white/10 text-white border-l-2 border-coco-red pl-[10px]'
                  : 'text-white/60 hover:text-white hover:bg-white/5',
              ].join(' ')
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {!showCollapsed && <span className="whitespace-nowrap">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Schema version + API status */}
      {showCollapsed ? (
        <div className="px-2 pb-5 flex flex-col items-center gap-3">
          <span
            title={`CoCo Server: ${
              healthy === undefined ? 'checking' : healthy ? 'online' : 'offline'
            }`}
            className={`w-2.5 h-2.5 rounded-full ${
              healthy === undefined ? 'bg-white/30' : healthy ? 'bg-green-400' : 'bg-red-400'
            }`}
          />
        </div>
      ) : (
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
      )}
    </aside>
  )
}
