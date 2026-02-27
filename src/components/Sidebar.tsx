import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, FileCode2, Shuffle, Zap, ChevronDown } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCanonicls, generateAllSamples } from '../services/api'
import { useAppContext } from '../context/AppContext'
import cocoLogo from '../assets/coco.png'

const navItems = [
  { to: '/discover', label: 'Discover / Builds', icon: LayoutDashboard },
  { to: '/schemas', label: 'Schemas (v10.0 XSD)', icon: FileCode2 },
  { to: '/transforms', label: 'Transforms (XSLT)', icon: Shuffle },
]

export default function Sidebar() {
  const { selectedCanonical, setSelectedCanonical, pushLog } = useAppContext()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: canonicals = [] } = useQuery({
    queryKey: ['canonicals'],
    queryFn: getCanonicls,
  })

  const generateAllMutation = useMutation({
    mutationFn: generateAllSamples,
    onMutate: () => {
      pushLog('info', 'Generating all samples…')
      navigate('/discover')
    },
    onSuccess: (results) => {
      const ok = results.filter((r) => r.success).length
      const fail = results.filter((r) => !r.success).length
      pushLog('success', `Generated all samples — ${ok} succeeded${fail ? `, ${fail} failed` : ''}`)
      qc.invalidateQueries({ queryKey: ['samples', 'canonical'] })
      qc.invalidateQueries({ queryKey: ['samples', 'fhir'] })
    },
    onError: (err: Error) => {
      pushLog('error', `Generate all failed: ${err.message}`)
    },
  })

  return (
    <aside
      className="w-60 flex-shrink-0 flex flex-col h-screen"
      style={{ backgroundColor: '#0d1b2a', borderRight: '3px solid #E60073' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <img src={cocoLogo} alt="CoCo" className="h-10 w-10 rounded object-contain bg-white/5 p-0.5" />
        <div>
          <span className="block text-sm font-bold tracking-widest" style={{ color: '#c0392b' }}>
            COCO DATA
          </span>
          <span className="block text-[10px] text-white/40 tracking-wider uppercase">Flow v0.1</span>
        </div>
      </div>

      {/* Canonical Selector */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="canonical-select" className="block text-[10px] text-white/40 uppercase tracking-widest">
            Active Canonical
          </label>
          {!selectedCanonical && (
            <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: '#c0392b', backgroundColor: 'rgba(192,57,43,0.15)' }}>
              Start here
            </span>
          )}
        </div>
        <div className="relative">
          <select
            id="canonical-select"
            value={selectedCanonical}
            onChange={(e) => setSelectedCanonical(e.target.value)}
            className="w-full appearance-none bg-white/10 border border-white/20 text-white text-sm rounded-md px-3 py-2 pr-8 focus:outline-none focus:border-coco-red focus:ring-1 focus:ring-coco-red cursor-pointer"
          >
            <option value="" className="bg-gray-800">
              — Select canonical —
            </option>
            {canonicals.map((c) => (
              <option key={c} value={c} className="bg-gray-800 capitalize">
                {c.replace(/-/g, ' ').toUpperCase()}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
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

      {/* Version badge */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-white/5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-[11px] text-white/40">Schema version v10.0</span>
        </div>
      </div>

      {/* Generate All CTA */}
      <div className="px-4 pb-5">
        <button
          onClick={() => generateAllMutation.mutate()}
          disabled={generateAllMutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-bold text-white transition-all disabled:opacity-60"
          style={{ backgroundColor: '#c0392b' }}
          onMouseEnter={(e) => {
            if (!generateAllMutation.isPending)
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#96281b'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = '#c0392b'
          }}
        >
          {generateAllMutation.isPending ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              GENERATE ALL SAMPLES
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
