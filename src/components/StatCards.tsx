import { useQuery } from '@tanstack/react-query'
import { Layers, FileText, Shuffle, Database } from 'lucide-react'
import { getCanonicls, getCanonicalSamples, getFhirSamples, getTransforms } from '../services/api'

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ElementType
  loading: boolean
  accent?: string
}

function StatCard({ label, value, icon: Icon, loading, accent = '#c0392b' }: StatCardProps) {
  return (
    <div className="card px-5 py-4 flex items-center gap-4">
      <div
        className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${accent}15` }}
      >
        <Icon className="w-5 h-5" style={{ color: accent }} />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        {loading ? (
          <div className="mt-1 h-6 w-8 bg-gray-100 rounded animate-pulse" />
        ) : (
          <p className="text-2xl font-bold text-gray-800 leading-none mt-0.5">{value}</p>
        )}
      </div>
    </div>
  )
}

export default function StatCards() {
  const canonicalsQ = useQuery({ queryKey: ['canonicals'], queryFn: getCanonicls })
  const samplesQ = useQuery({ queryKey: ['samples', 'canonical'], queryFn: getCanonicalSamples })
  const fhirQ = useQuery({ queryKey: ['samples', 'fhir'], queryFn: getFhirSamples })
  const transformsQ = useQuery({ queryKey: ['transforms'], queryFn: getTransforms })

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Canonicals"
        value={canonicalsQ.data?.length ?? 0}
        icon={Layers}
        loading={canonicalsQ.isLoading}
      />
      <StatCard
        label="Canonical Samples"
        value={samplesQ.data?.length ?? 0}
        icon={FileText}
        loading={samplesQ.isLoading}
        accent="#2563eb"
      />
      <StatCard
        label="FHIR Outputs"
        value={fhirQ.data?.length ?? 0}
        icon={Database}
        loading={fhirQ.isLoading}
        accent="#16a34a"
      />
      <StatCard
        label="Transforms"
        value={transformsQ.data?.length ?? 0}
        icon={Shuffle}
        loading={transformsQ.isLoading}
        accent="#d97706"
      />
    </div>
  )
}
