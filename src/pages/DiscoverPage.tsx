import { useAppContext } from '../context/AppContext'
import StatStrip from '../components/StatStrip'
import ActionPanel from '../components/ActionPanel'
import StatusLogger from '../components/StatusLogger'
import ArtifactList from '../components/ArtifactList'
import { Flame, MousePointerClick } from 'lucide-react'

export default function DiscoverPage() {
  const { selectedCanonical } = useAppContext()

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Page heading */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Flame className="w-5 h-5 flex-shrink-0" style={{ color: '#c0392b' }} />
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
        <div className="flex items-center gap-4 mt-1.5">
          <p className="text-sm text-gray-400">
            {selectedCanonical
              ? `Generate samples, run XSLT transforms, and download artifacts for the ${selectedCanonical} canonical model.`
              : 'Select a canonical from the sidebar to get started.'}
          </p>
          <StatStrip />
        </div>
      </div>

      {/* Empty state when no canonical selected */}
      {!selectedCanonical ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
            <MousePointerClick className="w-6 h-6" style={{ color: '#c0392b' }} />
          </div>
          <h3 className="text-base font-semibold text-gray-700 mb-1">Select a Canonical to Begin</h3>
          <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
            Use the <span className="font-medium text-gray-600">Active Canonical</span> dropdown in the
            sidebar to choose a model, then generate samples and run transforms here.
          </p>
        </div>
      ) : (
        <>
          {/* Main content: action panel + logger side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ActionPanel />
            <StatusLogger />
          </div>

          {/* Artifact table */}
          <ArtifactList filterTarget={selectedCanonical} />
        </>
      )}
    </div>
  )
}
