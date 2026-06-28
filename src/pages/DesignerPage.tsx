import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileCode2, AlertCircle, Network } from 'lucide-react'
import { getSchemas, fetchSchemaContent } from '../services/api'
import XsdDiagram from '../components/XsdDiagram'

export default function DesignerPage() {
  const { data: schemas = [], isPending, isError, error } = useQuery({
    queryKey: ['schemas'],
    queryFn: getSchemas,
    staleTime: 60_000,
  })

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
          <h1 className="text-xl font-bold text-gray-900">Schema Explorer</h1>
          <p className="text-sm text-gray-500">
            Explore the CoCo canonical XSD schemas (v10.0) as an interactive element diagram.
          </p>
        </div>

        {isError ? (
          <div className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Could not load schemas.</span>{' '}
              {error instanceof Error ? error.message : 'The CoCo API may be unreachable.'}
            </div>
          </div>
        ) : isPending ? (
          <div className="text-xs text-gray-400">Loading schemas…</div>
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
                      ? 'bg-coco-red text-white border-coco-red'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-800'
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
            <Network className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400 font-medium">Select a schema to diagram it</p>
            <p className="text-xs text-gray-300 mt-1">
              Its elements appear as an interactive nested graph
            </p>
          </div>
        ) : contentLoading ? (
          <div className="card p-6 text-xs text-gray-400">Loading schema…</div>
        ) : contentError ? (
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
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
