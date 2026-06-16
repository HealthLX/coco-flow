import { useMemo, useState } from 'react'
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { xmlToJson } from '../lib/xmlToJson'

const COLLAPSED_LINES = 80

type View = 'xml' | 'json'

interface XmlPreviewProps {
  content: string
  title: string
  /** Optional badge color class e.g. "badge-canonical" or "badge-fhir" */
  badgeClass?: string
  badgeLabel?: string
  /** When true, show an XML | JSON toggle that renders a structural JSON view of the content. */
  allowJson?: boolean
}

export default function XmlPreview({
  content,
  title,
  badgeClass,
  badgeLabel,
  allowJson = false,
}: XmlPreviewProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [view, setView] = useState<View>('xml')

  // Convert lazily; null when conversion fails (e.g. not well-formed) or not requested.
  const jsonContent = useMemo(() => {
    if (!allowJson) return null
    try {
      return xmlToJson(content)
    } catch {
      return null
    }
  }, [allowJson, content])

  const showingJson = view === 'json' && jsonContent != null
  const activeContent = showingJson ? (jsonContent as string) : content

  const lines = activeContent.split('\n')
  const isLong = lines.length > COLLAPSED_LINES
  const displayContent =
    isLong && !expanded ? lines.slice(0, COLLAPSED_LINES).join('\n') : activeContent

  const copy = async () => {
    await navigator.clipboard.writeText(activeContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">{title}</span>
          {badgeClass && badgeLabel && <span className={badgeClass}>{badgeLabel}</span>}
          <span className="text-xs text-gray-400">{lines.length} lines</span>
        </div>
        <div className="flex items-center gap-2">
          {allowJson && jsonContent && (
            <div className="flex items-center rounded border border-gray-200 overflow-hidden">
              {(['xml', 'json'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setView(v)
                    setExpanded(false)
                  }}
                  className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                    view === v
                      ? 'bg-coco-red text-white'
                      : 'bg-white text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={copy}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {showingJson && (
        <div className="px-4 py-1.5 text-[11px] text-amber-700 bg-amber-50 border-b border-amber-100">
          Structural JSON view — not spec-canonical FHIR JSON. Conformant FHIR JSON comes from the
          HealthLX mappings.
        </div>
      )}

      <pre
        className="text-xs font-mono text-gray-800 p-4 overflow-auto leading-relaxed"
        style={{ maxHeight: '420px', backgroundColor: '#fafafa' }}
      >
        {displayContent}
        {isLong && !expanded && (
          <span className="block text-gray-400 italic mt-1">
            … {lines.length - COLLAPSED_LINES} more lines hidden
          </span>
        )}
      </pre>

      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 border-t border-gray-100 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Collapse
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Show all {lines.length} lines
            </>
          )}
        </button>
      )}
    </div>
  )
}
