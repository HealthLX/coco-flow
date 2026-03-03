import { useState } from 'react'
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'

const COLLAPSED_LINES = 80

interface XmlPreviewProps {
  content: string
  title: string
  /** Optional badge color class e.g. "badge-canonical" or "badge-fhir" */
  badgeClass?: string
  badgeLabel?: string
}

export default function XmlPreview({
  content,
  title,
  badgeClass,
  badgeLabel,
}: XmlPreviewProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const lines = content.split('\n')
  const isLong = lines.length > COLLAPSED_LINES
  const displayContent =
    isLong && !expanded ? lines.slice(0, COLLAPSED_LINES).join('\n') : content

  const copy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">{title}</span>
          {badgeClass && badgeLabel && (
            <span className={badgeClass}>{badgeLabel}</span>
          )}
          <span className="text-xs text-gray-400">{lines.length} lines</span>
        </div>
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
