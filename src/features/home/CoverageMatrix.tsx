import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { cn } from '../../components/ui/cn'
import Skeleton from '../../components/ui/Skeleton'
import { buildCoverageMatrix } from '../../lib/coverage'
import { useDriver } from '../../pipeline/driver'

/**
 * Canonicals × the FHIR resource types their XSLTs produce.
 *
 * Deliberately binary: a canonical either has a transform for a resource type or it doesn't.
 * The underlying data also knows which outputs carry a US Core profile, but that distinction
 * is a detail of the pipeline, not of the map — showing it here made the grid read like a
 * scorecard when it should just be an index.
 */
export default function CoverageMatrix() {
  const driver = useDriver()
  const [hovered, setHovered] = useState<string | null>(null)

  const { data, isPending } = useQuery({
    queryKey: ['coverage-matrix'],
    queryFn: async () => {
      const [builds, transforms] = await Promise.all([driver.listBuilds(), driver.listTransforms()])
      return buildCoverageMatrix(builds, transforms)
    },
    staleTime: 5 * 60_000,
  })

  const totals = useMemo(() => {
    if (!data) return null
    let transforms = 0
    for (const row of data.rows) {
      transforms += Object.values(row.cells).filter((c) => c.state !== 'none').length
    }
    return { transforms, types: data.resourceTypes.length }
  }, [data])

  if (isPending || !data || !totals) return <Skeleton className="h-64 w-full" />

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">Transform coverage</h2>
        <p className="text-xs text-fg-muted">
          Which FHIR resources each canonical produces — {totals.transforms} transforms across{' '}
          {data.rows.length} canonicals and {totals.types} resource types.
        </p>
        <Link
          to="/flow"
          className="ml-auto flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-hover"
        >
          Run one <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-4 py-2 text-left font-medium text-fg-muted">
                Canonical
              </th>
              {data.resourceTypes.map((type) => (
                <th
                  key={type}
                  onMouseEnter={() => setHovered(type)}
                  onMouseLeave={() => setHovered(null)}
                  className="h-28 w-7 px-0 pb-2 align-bottom"
                >
                  {/* Rotated so ~40 resource types fit without a horizontal scrollbar. */}
                  <span
                    className={cn(
                      'block origin-bottom-left translate-x-[1.15rem] -rotate-45 whitespace-nowrap font-mono text-[10px] transition-colors',
                      hovered === type ? 'text-fg' : 'text-fg-subtle',
                    )}
                  >
                    {type}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const count = Object.values(row.cells).filter((c) => c.state !== 'none').length
              return (
                <tr key={row.canonical} className="group">
                  <th className="sticky left-0 z-10 whitespace-nowrap border-t border-line bg-surface px-4 py-1.5 text-left font-semibold text-fg group-hover:bg-surface-2">
                    {row.label}
                    <span className="ml-2 font-normal tabular-nums text-fg-subtle">{count}</span>
                  </th>
                  {data.resourceTypes.map((type) => {
                    const cell = row.cells[type]
                    const has = !!cell && cell.state !== 'none'
                    return (
                      <td
                        key={type}
                        onMouseEnter={() => setHovered(type)}
                        onMouseLeave={() => setHovered(null)}
                        title={
                          has
                            ? `${cell.variant ? `${type} (${cell.variant})` : type} — ${cell.file}`
                            : undefined
                        }
                        className={cn(
                          'border-t border-line px-0 py-1.5 transition-colors',
                          hovered === type && 'bg-surface-2',
                        )}
                      >
                        <span
                          className={cn(
                            'mx-auto block h-3.5 w-3.5 rounded-sm border transition-transform',
                            has
                              ? 'border-brand bg-brand hover:scale-125'
                              : 'border-transparent bg-transparent',
                          )}
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
