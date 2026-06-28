import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileCode2, Download, AlertCircle, BookOpen, ExternalLink } from 'lucide-react'
import { getSchemas, getTransforms, fetchSchemaContent, downloadSchema } from '../services/api'
import XmlPreview from '../components/XmlPreview'
import XsdTreeView from '../components/XsdTreeView'

/** Map a schema filename (e.g. "Provider-Directory.xsd") to its transforms folder name. */
function schemaGroup(filename: string): string {
  return filename.replace(/\.xsd$/i, '')
}

export default function SchemasPage() {
  const { data: schemas = [], isPending, isError, error } = useQuery({
    queryKey: ['schemas'],
    queryFn: getSchemas,
    staleTime: 60_000,
  })
  const { data: transforms = [] } = useQuery({
    queryKey: ['transforms'],
    queryFn: getTransforms,
    staleTime: 60_000,
  })

  const [selected, setSelected] = useState<string | null>(null)
  const [schemaView, setSchemaView] = useState<'source' | 'tree'>('tree')

  const { data: content, isFetching: contentLoading, isError: contentError } = useQuery({
    queryKey: ['schema-content', selected],
    queryFn: () => fetchSchemaContent(selected as string),
    enabled: !!selected,
    staleTime: 60_000,
  })

  // Imported simpleType schema, so `core:` type references resolve in the tree view.
  // Best-effort: the tree still works if it can't be loaded.
  const { data: coreContent } = useQuery({
    queryKey: ['schema-content', 'Core-Model.xsd'],
    queryFn: () => fetchSchemaContent('Core-Model.xsd'),
    staleTime: 60_000,
  })

  const groupTransforms = selected
    ? transforms.filter((t) => t.group === schemaGroup(selected))
    : []

  return (
    <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Schemas</h1>
          <p className="text-sm text-gray-900 mt-0.5">
            Browse and download the CoCo canonical XSD schemas (v10.0).
          </p>
        </div>
        <a
          href="https://healthlx.github.io/coco-canonical/Core-model_Guide.html"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-xs whitespace-nowrap"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Schema Documentation
          <ExternalLink className="w-3 h-3 opacity-60" />
        </a>
      </div>

      {isError && (
        <div className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Could not load schemas.</span>{' '}
            {error instanceof Error ? error.message : 'The CoCo API may be unreachable.'}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[16rem_1fr] gap-6">
        {/* Schema list */}
        <div className="card overflow-hidden h-fit">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-900 uppercase tracking-wider">
            XSD Files
          </div>
          {isPending ? (
            <div className="px-4 py-4 text-xs text-gray-900">Loading…</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {schemas.map((s) => {
                const isActive = selected === s.filename
                return (
                  <button
                    key={s.filename}
                    onClick={() => setSelected(s.filename)}
                    className={`w-full flex items-center gap-2 px-4 py-3 text-left text-sm transition-colors hover:bg-gray-50 ${
                      isActive ? 'bg-red-50/40 border-l-[3px] border-coco-red pl-[13px]' : 'border-l-[3px] border-transparent'
                    }`}
                  >
                    <FileCode2
                      className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-coco-red' : 'text-gray-900'}`}
                    />
                    <span
                      className={`font-mono text-xs truncate ${isActive ? 'text-coco-red font-semibold' : 'text-gray-900'}`}
                    >
                      {s.filename}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Schema detail */}
        <div className="space-y-4 min-w-0">
          {!selected ? (
            <div className="card p-12 text-center">
              <FileCode2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-900 font-medium">Select a schema to view it</p>
              <p className="text-xs text-gray-400 mt-1">
                Its XSD source and related transforms appear here
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="badge-xsd font-mono text-[10px]">{selected}</span>
                  {groupTransforms.length > 0 && (
                    <span className="text-xs text-gray-900">
                      {groupTransforms.length} transform{groupTransforms.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded border border-gray-200 overflow-hidden">
                    {(['source', 'tree'] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setSchemaView(v)}
                        className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                          schemaView === v
                            ? 'bg-coco-red text-white'
                            : 'bg-white text-gray-900 hover:text-gray-900'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => downloadSchema(selected)}
                    className="btn-secondary text-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download XSD
                  </button>
                </div>
              </div>

              {contentLoading && (
                <div className="card p-6 text-xs text-gray-900">Loading schema…</div>
              )}
              {contentError && (
                <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  Could not load this schema file.
                </div>
              )}
              {content &&
                (schemaView === 'tree' ? (
                  <XsdTreeView xsd={content} coreXsd={coreContent} title={selected} />
                ) : (
                  <XmlPreview content={content} title={selected} badgeClass="badge-xsd" badgeLabel="XSD" />
                ))}

              {groupTransforms.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-900 uppercase tracking-wider">
                    FHIR Transforms
                  </div>
                  <ul className="divide-y divide-gray-50">
                    {groupTransforms.map((t) => (
                      <li key={t.filename} className="px-4 py-2.5 flex items-center gap-2">
                        <span className="badge-xslt font-mono text-[10px]">XSLT</span>
                        <span className="text-xs font-mono text-gray-900 truncate">
                          {t.displayName ?? t.filename}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
