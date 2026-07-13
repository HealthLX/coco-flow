import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileCode2, AlertCircle, Network } from 'lucide-react'
import { getSchemas, fetchSchemaContent } from '../services/api'
import XsdDiagram from '../components/XsdDiagram'

export default function DesignerPage() {
  const { data: allSchemas = [], isPending, isError, error } = useQuery({
    queryKey: ['schemas'],
    queryFn: getSchemas,
    staleTime: 60_000,
  })

  // Core-Model.xsd is a shared type library (no root element to diagram); it's
  // still loaded below so `core:` types resolve inside the other schemas.
  const schemas = allSchemas.filter((s) => s.filename.toLowerCase() !== 'core-model.xsd')

  const [selected, setSelected] = useState<string | null>(null)

  const { data: content, isFetching: contentLoading, isError: contentError } = useQuery({
    queryKey: ['schema-content', selected],
    queryFn: () => fetchSchemaContent(selected as string),
    enabled: !!selected,
    staleTime: 60_000,
  })

  // Imported simpleType schema, so `core:` type references resolve in the diagram.
  const { data: coreContent } = useQuery({
    queryKey: ['schema-content', 'Core-Model.xsd'],
    queryFn: () => fetchSchemaContent('Core-Model.xsd'),
    staleTime: 60_000,
  })

  return (
    <div className="h-full flex flex-col px-6 py-5 gap-4">
      {/* Title + horizontal schema selector — frees the full width below for the diagram */}
      <div className="flex-none space-y-2.5">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-fg">Schema Explorer</h1>
          <p className="text-sm text-fg-body">
            Explore the CoCo canonical XSD schemas (v10.0) as an interactive element diagram.
          </p>
        </div>

        {isError ? (
          <div className="flex items-start gap-2 text-xs text-warn bg-warn-bg border border-warn-border rounded-lg p-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Could not load schemas.</span>{' '}
              {error instanceof Error ? error.message : 'The CoCo API may be unreachable.'}
            </div>
          </div>
        ) : isPending ? (
          <div className="text-xs text-fg-muted">Loading schemas…</div>
        ) : (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {schemas.map((s) => {
              const isActive = selected === s.filename
              return (
                <button
                  key={s.filename}
                  onClick={() => setSelected(s.filename)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-mono whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-brand text-white border-brand'
                      : 'bg-surface text-fg-body border-line hover:border-line-strong hover:text-fg'
                  }`}
                >
                  <FileCode2 className="w-3.5 h-3.5 flex-shrink-0" />
                  {s.filename}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Diagram — full width, fills remaining height */}
      <div className="flex-1 min-w-0 min-h-0">
        {!selected ? (
          <div className="card p-12 text-center h-full flex flex-col items-center justify-center">
            <Network className="w-10 h-10 text-fg-subtle/50 mx-auto mb-3" />
            <p className="text-sm text-fg-body font-medium">Select a schema to diagram it</p>
            <p className="text-xs text-fg-subtle mt-1">
              Its elements appear as an interactive nested graph
            </p>
          </div>
        ) : contentLoading ? (
          <div className="card p-6 text-xs text-fg-muted">Loading schema…</div>
        ) : contentError ? (
          <div className="flex items-start gap-2 text-xs text-err bg-err-bg border border-err-border rounded-lg p-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            Could not load this schema file.
          </div>
        ) : content ? (
          <XsdDiagram xsd={content} coreXsd={coreContent} title={selected} />
        ) : null}
      </div>
    </div>
  )
}
