import { useQuery } from '@tanstack/react-query'
import { getCanonicls, getCanonicalSamples, getFhirSamples, getTransforms } from '../services/api'

export default function StatStrip() {
  const canonicalsQ = useQuery({ queryKey: ['canonicals'], queryFn: getCanonicls })
  const samplesQ = useQuery({ queryKey: ['samples', 'canonical'], queryFn: getCanonicalSamples })
  const fhirQ = useQuery({ queryKey: ['samples', 'fhir'], queryFn: getFhirSamples })
  const transformsQ = useQuery({ queryKey: ['transforms'], queryFn: getTransforms })

  const stats = [
    { label: 'canonicals', value: canonicalsQ.data?.length ?? 0, loading: canonicalsQ.isLoading },
    { label: 'samples', value: samplesQ.data?.length ?? 0, loading: samplesQ.isLoading },
    { label: 'FHIR outputs', value: fhirQ.data?.length ?? 0, loading: fhirQ.isLoading },
    { label: 'transforms', value: transformsQ.data?.length ?? 0, loading: transformsQ.isLoading },
  ]

  return (
    <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
      {stats.map((s, i) => (
        <span key={s.label} className="flex items-center gap-3">
          {i > 0 && <span className="text-gray-200 select-none">·</span>}
          <span>
            {s.loading ? (
              <span className="inline-block w-4 h-2.5 bg-gray-200 rounded animate-pulse align-middle" />
            ) : (
              <span className="font-semibold text-gray-600">{s.value}</span>
            )}{' '}
            {s.label}
          </span>
        </span>
      ))}
    </div>
  )
}
