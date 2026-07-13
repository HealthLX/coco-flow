import { cn } from '../../components/ui/cn'
import type { StageStatus } from '../../pipeline/types'

/** The edge takes its state from the stage it feeds into. */
type EdgeState = 'idle' | 'flowing' | 'done' | 'blocked' | 'stale'

function edgeState(from: StageStatus, to: StageStatus, stale: boolean): EdgeState {
  if (to.state === 'running') return 'flowing'
  if (stale && from.state === 'passed') return 'stale'
  if (from.state === 'passed' && (to.state === 'passed' || to.state === 'failed')) return 'done'
  if (from.state === 'passed') return 'idle'
  return 'blocked'
}

const STROKE: Record<EdgeState, string> = {
  flowing: 'stroke-accent',
  done: 'stroke-ok/60',
  idle: 'stroke-line-strong',
  stale: 'stroke-warn/70',
  blocked: 'stroke-line',
}

/**
 * The travelling-data effect: a marching dashed stroke plus a packet dot. Both are CSS
 * animations on an inline SVG — no JS, no animation library, and `prefers-reduced-motion`
 * stops them via the global rule in tokens.css.
 */
export default function FlowEdge({
  from,
  to,
  stale = false,
}: {
  from: StageStatus
  to: StageStatus
  stale?: boolean
}) {
  const state = edgeState(from, to, stale)
  const flowing = state === 'flowing'

  // Two alignments have to hold for this to read as one rail rather than as dividers:
  //
  // Vertical — the line meets the middle of the circles, not the middle of the whole node
  // (which includes the label and timing below). StageNode is py-3 (12px) then an h-11 circle
  // (44px), so the circle's centre is 34px down.
  //
  // Horizontal — a node is w-[7.5rem] (120px) but its circle is only 44px, leaving 38px of dead
  // space on each side. Without the negative margin the line stops at the node's edge and floats
  // short of the circle it is supposed to be joining. -mx-[38px] spans exactly that gap, so the
  // line runs circle-edge to circle-edge and touches neither.
  return (
    <div className="relative -mx-[38px] flex min-w-[1.5rem] flex-1 self-start pt-[34px]">
      <svg className="h-px w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
        <line
          x1="0"
          y1="0"
          x2="100%"
          y2="0"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={flowing || state === 'stale' ? '6 6' : undefined}
          className={cn(STROKE[state], flowing && 'animate-flow-dash')}
        />
      </svg>

      {flowing && (
        <span
          className="absolute top-[31px] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_8px_rgb(var(--accent))] animate-flow-packet"
          aria-hidden
        />
      )}
    </div>
  )
}
