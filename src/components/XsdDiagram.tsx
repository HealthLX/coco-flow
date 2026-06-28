import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AlertCircle, Plus, Minus, Maximize2, Locate } from 'lucide-react'
import { parseXsd, type XsdTreeNode, type ParsedXsd } from '../lib/parseXsd'

/** Lets a node ask the canvas to re-center it after its layout changes. */
const CenterContext = createContext<(el: HTMLElement | null) => void>(() => {})

interface XsdDiagramProps {
  xsd: string
  coreXsd?: string
  title: string
}

const MIN_SCALE = 0.2
const MAX_SCALE = 2.5

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

/** Cardinality as min..max, unbounded → ∞; returns null for the default 1..1. */
function cardinality(node: XsdTreeNode): string | null {
  const max = node.maxOccurs === 'unbounded' ? '∞' : String(node.maxOccurs)
  if (node.minOccurs === 1 && max === '1') return null
  return `${node.minOccurs}..${max}`
}

function SequenceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <line x1="6" y1="5" x2="6" y2="19" />
      <line x1="6" y1="8" x2="18" y2="8" />
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="6" y1="16" x2="18" y2="16" />
    </svg>
  )
}

function ChoiceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <line x1="5" y1="12" x2="11" y2="12" />
      <path d="M11 12 L18 6" />
      <path d="M11 12 L18 18" />
      <circle cx="18.5" cy="6" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="18" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  )
}

interface ViewState {
  scale: number
  x: number
  y: number
}

export default function XsdDiagram({ xsd, coreXsd, title }: XsdDiagramProps) {
  const parsed = useMemo(() => parseXsd(xsd, coreXsd), [xsd, coreXsd])

  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<ViewState>({ scale: 1, x: 48, y: 48 })
  const [panning, setPanning] = useState(false)
  const [smooth, setSmooth] = useState(false)
  const smoothTimer = useRef<number>()

  // Pan so a freshly-toggled node returns to the center of the viewport.
  const centerOn = useCallback((el: HTMLElement | null) => {
    const vp = viewportRef.current
    if (!vp || !el) return
    const vpRect = vp.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const elCx = elRect.left + elRect.width / 2 - vpRect.left
    const elCy = elRect.top + elRect.height / 2 - vpRect.top
    const dx = vp.clientWidth / 2 - elCx
    const dy = vp.clientHeight / 2 - elCy
    setSmooth(true)
    setView((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
    window.clearTimeout(smoothTimer.current)
    smoothTimer.current = window.setTimeout(() => setSmooth(false), 320)
  }, [])

  // Pan bookkeeping; movedRef lets us suppress node clicks that were actually drags.
  const panState = useRef({
    active: false,
    captured: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  })
  const movedRef = useRef(false)

  const fit = useCallback(() => {
    const vp = viewportRef.current
    const ct = contentRef.current
    if (!vp || !ct) return
    const cw = ct.scrollWidth
    const ch = ct.scrollHeight
    const vw = vp.clientWidth
    const vh = vp.clientHeight
    if (!cw || !ch) return
    const scale = clamp(Math.min(vw / cw, vh / ch) * 0.92, MIN_SCALE, 1.2)
    setView({
      scale,
      x: Math.max(24, (vw - cw * scale) / 2),
      y: Math.max(24, (vh - ch * scale) / 2),
    })
  }, [])

  // Reset/fit when the schema changes.
  useEffect(() => {
    const id = requestAnimationFrame(fit)
    return () => cancelAnimationFrame(id)
  }, [xsd, fit])

  // Native wheel listener so we can preventDefault (zoom instead of scroll).
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setSmooth(false)
      const rect = vp.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      setView((prev) => {
        const factor = Math.exp(-e.deltaY * 0.0015)
        const scale = clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE)
        const k = scale / prev.scale
        // Keep the point under the cursor fixed while zooming.
        return { scale, x: px - k * (px - prev.x), y: py - k * (py - prev.y) }
      })
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    // Note: we do NOT capture the pointer here. Capturing on mousedown would
    // re-target the follow-up `click` to the canvas and break node toggles.
    panState.current = {
      active: true,
      captured: false,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: view.x,
      origY: view.y,
    }
    movedRef.current = false
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = panState.current
    if (!p.active) return
    const dx = e.clientX - p.startX
    const dy = e.clientY - p.startY
    if (!movedRef.current && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return
    // A real drag has started — now grab the pointer and show the grab cursor.
    if (!p.captured) {
      movedRef.current = true
      p.captured = true
      setSmooth(false)
      setPanning(true)
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        /* capture unsupported */
      }
    }
    setView((prev) => ({ ...prev, x: p.origX + dx, y: p.origY + dy }))
  }

  const endPan = (e: React.PointerEvent) => {
    const p = panState.current
    p.active = false
    setPanning(false)
    if (p.captured) {
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        /* pointer already released */
      }
      p.captured = false
    }
  }

  // Swallow the click that follows a drag so we don't toggle a node by accident.
  const onClickCapture = (e: React.MouseEvent) => {
    if (movedRef.current) {
      e.stopPropagation()
      movedRef.current = false
    }
  }

  const zoomBy = (factor: number) => {
    const vp = viewportRef.current
    if (!vp) return
    const cx = vp.clientWidth / 2
    const cy = vp.clientHeight / 2
    setView((prev) => {
      const scale = clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE)
      const k = scale / prev.scale
      return { scale, x: cx - k * (cx - prev.x), y: cy - k * (cy - prev.y) }
    })
  }

  return (
    <div className="card overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-none">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">{title}</span>
          <span className="badge-xsd">Diagram</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-gray-400 mr-1 tabular-nums">
            {Math.round(view.scale * 100)}%
          </span>
          <ToolbarButton onClick={() => zoomBy(1 / 1.2)} label="Zoom out">
            <Minus className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => zoomBy(1.2)} label="Zoom in">
            <Plus className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => setView({ scale: 1, x: 48, y: 48 })} label="Reset to 100%">
            <Locate className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={fit} label="Fit to view">
            <Maximize2 className="w-3.5 h-3.5" />
          </ToolbarButton>
        </div>
      </div>

      {parsed.error ? (
        <div className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 m-3 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {parsed.error}
        </div>
      ) : (
        <div
          ref={viewportRef}
          className={`xsd-pz-viewport flex-1 min-h-0 ${panning ? 'is-panning' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onClickCapture={onClickCapture}
        >
          <div
            ref={contentRef}
            className="xsd-pz-content"
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              transition: smooth ? 'transform 0.32s cubic-bezier(0.22, 0.61, 0.36, 1)' : 'none',
            }}
          >
            <CenterContext.Provider value={centerOn}>
              <div className="xsd-diagram">
                {parsed.roots.map((root) => (
                  <DiagramNode
                    key={root.name}
                    node={root}
                    parsed={parsed}
                    depth={0}
                    defaultExpanded={parsed.roots.length === 1}
                  />
                ))}
              </div>
            </CenterContext.Provider>
          </div>
        </div>
      )}
    </div>
  )
}

function ToolbarButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-200/70 transition-colors"
    >
      {children}
    </button>
  )
}

interface DiagramNodeProps {
  node: XsdTreeNode
  parsed: ParsedXsd
  depth: number
  defaultExpanded?: boolean
}

function DiagramNode({ node, parsed, depth, defaultExpanded = false }: DiagramNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const children = useMemo(
    () => (expanded ? parsed.getChildren(node) : []),
    [expanded, node, parsed],
  )
  const expandable = node.resolvable
  const centerOn = useContext(CenterContext)
  const anchorRef = useRef<HTMLDivElement>(null)
  const wantCenter = useRef(false)
  const toggle = () => {
    if (!expandable) return
    wantCenter.current = true
    setExpanded((v) => !v)
  }

  // After an expand/collapse reflows the tree, recenter this node in the viewport.
  useLayoutEffect(() => {
    if (wantCenter.current) {
      wantCenter.current = false
      centerOn(anchorRef.current)
    }
  }, [expanded, centerOn])

  // A choice group renders as a compositor node (no element box).
  if (node.kind === 'choice') {
    return (
      <div className="xsd-drow">
        <div
          ref={anchorRef}
          className={`xsd-dcomp is-lead ${expanded ? '' : 'is-collapsed'}`}
          onClick={toggle}
          title={node.documentation}
        >
          <span className="xsd-dcomp-icon is-choice" aria-label="choice">
            <ChoiceIcon />
          </span>
        </div>
        {expanded && <ChildColumn nodes={children} parsed={parsed} depth={depth} />}
      </div>
    )
  }

  const tooltipParts = [
    node.documentation,
    node.enumValues?.length ? `Values: ${node.enumValues.join(' | ')}` : undefined,
    node.restriction,
  ].filter(Boolean)
  const nativeTitle = tooltipParts.length ? tooltipParts.join('\n') : undefined
  const showType = !!node.type && !expandable

  return (
    <div className="xsd-drow">
      <div className="xsd-dcell">
        <div
          ref={anchorRef}
          className={[
            'xsd-dbox',
            depth === 0 ? 'is-root' : '',
            expandable ? 'is-expandable' : 'is-leaf',
            node.minOccurs === 0 ? 'is-optional' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={toggle}
        >
          <div className="xsd-dname">
            {node.name}
            {node.documentation && <span className="xsd-dname-doc" />}
          </div>
          {showType && (
            <div className="xsd-dtype">
              <span className="xsd-dtype-label">Type</span>
              <span className="xsd-dtype-value">{node.type}</span>
            </div>
          )}
          {node.enumValues?.length ? (
            <div className="xsd-denum">{node.enumValues.length} allowed values</div>
          ) : null}
          {expandable && (
            <span
              className="xsd-dtoggle"
              onClick={(e) => {
                e.stopPropagation()
                toggle()
              }}
            >
              {expanded ? '−' : '+'}
            </span>
          )}
        </div>
        {nativeTitle && <div className="xsd-ddoc">{nativeTitle}</div>}
      </div>

      {expandable && expanded && (
        <>
          <div className="xsd-dcomp" onClick={toggle} title="sequence — click to collapse">
            <span className="xsd-dcomp-icon" aria-label="sequence">
              <SequenceIcon />
            </span>
          </div>
          <ChildColumn nodes={children} parsed={parsed} depth={depth} />
        </>
      )}
    </div>
  )
}

interface ChildColumnProps {
  nodes: XsdTreeNode[]
  parsed: ParsedXsd
  depth: number
}

function ChildColumn({ nodes, parsed, depth }: ChildColumnProps) {
  return (
    <div className="xsd-dchildren">
      {nodes.map((child, i) => {
        const card = cardinality(child)
        return (
          <div className="xsd-dchildwrap" key={`${child.name}-${i}`}>
            {card && <span className="xsd-dcard">{card}</span>}
            <DiagramNode node={child} parsed={parsed} depth={depth + 1} />
          </div>
        )
      })}
    </div>
  )
}
