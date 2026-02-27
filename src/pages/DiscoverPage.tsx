import { useAppContext } from '../context/AppContext'
import StatCards from '../components/StatCards'
import ActionPanel from '../components/ActionPanel'
import StatusLogger from '../components/StatusLogger'
import ArtifactList from '../components/ArtifactList'
import { Flame } from 'lucide-react'

export default function DiscoverPage() {
  const { selectedCanonical } = useAppContext()

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page heading */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Flame className="w-5 h-5" style={{ color: '#c0392b' }} />
            <h1 className="text-2xl font-bold text-gray-900 leading-none">
              {selectedCanonical ? (
                <>
                  <span style={{ color: '#c0392b' }}>
                    Canonical: {selectedCanonical.replace(/-/g, ' ').toUpperCase()}
                  </span>
                  <span className="text-gray-400 font-normal text-base ml-2">(ACTIVE)</span>
                </>
              ) : (
                <span className="text-gray-700">Discover / Builds</span>
              )}
            </h1>
          </div>
          <p className="text-sm text-gray-500">
            {selectedCanonical
              ? `Generate samples, run XSLT transforms, and download artifacts for the ${selectedCanonical} canonical model.`
              : 'Select a canonical from the sidebar to get started.'}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <StatCards />

      {/* Main content: action panel + logger side by side, then full-width table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActionPanel />
        <StatusLogger />
      </div>

      {/* Artifact table */}
      <ArtifactList filterTarget={selectedCanonical || undefined} />
    </div>
  )
}
