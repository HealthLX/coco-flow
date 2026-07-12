import { useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, AlertCircle, RotateCcw } from 'lucide-react'
import { parseXsd, type XsdTreeNode, type ParsedXsd } from '../lib/parseXsd'

interface XsdTreeViewProps {
  xsd: string
  /** Optional Core-Model.xsd source so `core:` types resolve their restrictions. */
  coreXsd?: string
  title: string
}

/** Format cardinality as min..max, rendering unbounded as `*`. */
function cardinality(node: XsdTreeNode): string {
  const max = node.maxOccurs === 'unbounded' ? '*' : String(node.maxOccurs)
  return `${node.minOccurs}..${max}`
}

export default function XsdTreeView({ xsd, coreXsd, title }: XsdTreeViewProps) {
  const parsed = useMemo(() => parseXsd(xsd, coreXsd), [xsd, coreXsd])

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line bg-surface-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fg">{title}</span>
          <span className="badge-xsd">Tree</span>
          {!parsed.error && (
            <span className="text-xs text-fg-muted">
              {parsed.roots.length} root element{parsed.roots.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      {parsed.error ? (
        <div className="flex items-start gap-2 text-xs text-warn bg-warn-bg m-3 border border-warn-border rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {parsed.error}
        </div>
      ) : (
        <div className="overflow-auto py-1.5" style={{ maxHeight: '420px' }}>
          {parsed.roots.map((root) => (
            <TreeRow
              key={root.name}
              node={root}
              depth={0}
              parsed={parsed}
              ancestorTypes={[]}
              defaultExpanded={parsed.roots.length === 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface TreeRowProps {
  node: XsdTreeNode
  depth: number
  parsed: ParsedXsd
  ancestorTypes: string[]
  defaultExpanded?: boolean
}

function TreeRow({ node, depth, parsed, ancestorTypes, defaultExpanded = false }: TreeRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const children = useMemo(
    () => (expanded ? parsed.getChildren(node) : []),
    [expanded, node, parsed],
  )

  const expandable = node.resolvable
  const isRecursive = node.type != null && ancestorTypes.includes(node.type)

  const tooltipParts = [
    node.documentation,
    node.enumValues?.length ? `Values: ${node.enumValues.join(' | ')}` : undefined,
    node.restriction,
  ].filter(Boolean)
  const tooltip = tooltipParts.join('\n') || undefined

  // Indent so the chevron column aligns with deeper nesting.
  const paddingLeft = depth * 16 + 10

  return (
    <div>
      <div
        className={`group flex items-center gap-2 pr-3 py-1 text-sm transition-colors ${
          expandable ? 'cursor-pointer hover:bg-surface-2' : ''
        }`}
        style={{ paddingLeft }}
        onClick={expandable ? () => setExpanded((v) => !v) : undefined}
        title={tooltip}
      >
        {/* Expand/collapse affordance */}
        <span className="flex-shrink-0 w-3.5 text-fg-body">
          {expandable ? (
            expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )
          ) : (
            <span className="block w-1 h-1 mx-auto rounded-full bg-fg-subtle" />
          )}
        </span>

        {node.kind === 'inherited' ? (
          <span className="text-xs italic text-fg-body">{node.name}</span>
        ) : node.kind === 'choice' ? (
          <>
            <span className="text-xs font-mono font-semibold text-warn">choice</span>
            <span className="text-[10px] font-mono text-fg-body">{cardinality(node)}</span>
            {node.documentation && (
              <span className="text-xs text-fg-muted truncate min-w-0">{node.documentation}</span>
            )}
          </>
        ) : (
          <>
            <span
              className={`font-mono text-xs flex-shrink-0 ${
                expandable ? 'text-brand font-semibold' : 'text-fg-body'
              }`}
            >
              {node.name}
            </span>
            <span className="text-[10px] font-mono text-fg-body flex-shrink-0">
              {cardinality(node)}
            </span>
            {node.type && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${
                  node.typeOrigin === 'local'
                    ? 'bg-purple-50 text-purple-700'
                    : 'bg-surface-3 text-fg-body'
                }`}
              >
                {node.type}
              </span>
            )}
            {node.enumValues?.length ? (
              <span className="text-[10px] text-emerald-600 flex-shrink-0">
                {node.enumValues.length} values
              </span>
            ) : null}
            {isRecursive && (
              <RotateCcw className="w-3 h-3 text-fg-subtle flex-shrink-0" aria-label="recursive type" />
            )}
            {node.documentation && (
              <span className="text-xs text-fg-muted truncate min-w-0">{node.documentation}</span>
            )}
          </>
        )}
      </div>

      {expanded &&
        children.map((child, i) => (
          <TreeRow
            key={`${child.name}-${i}`}
            node={child}
            depth={depth + 1}
            parsed={parsed}
            ancestorTypes={node.type ? [...ancestorTypes, node.type] : ancestorTypes}
          />
        ))}
    </div>
  )
}
