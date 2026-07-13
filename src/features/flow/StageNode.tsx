import {
  AlertTriangle,
  Check,
  Download,
  FileCode2,
  FileText,
  MinusCircle,
  ShieldCheck,
  Shuffle,
  Sparkles,
} from 'lucide-react'
import { cn } from '../../components/ui/cn'
import { useElapsedSeconds, formatSeconds } from '../../hooks/useElapsedSeconds'
import { STAGE_META, type StageId, type StageStatus } from '../../pipeline/types'

const ICONS: Record<StageId, typeof FileCode2> = {
  schema: FileCode2,
  generate: FileText,
  'validate-xsd': ShieldCheck,
  transform: Shuffle,
  fhir: Sparkles,
  'validate-fhir': ShieldCheck,
  export: Download,
}

/** Ring + fill per state. Running is the accent (magenta) so a live run reads at a glance. */
const RING: Record<StageStatus['state'], string> = {
  idle: 'border-line-strong bg-surface text-fg-subtle',
  blocked: 'border-line bg-surface-2 text-fg-subtle/60',
  running: 'border-accent bg-accent/10 text-accent animate-pulse-ring',
  passed: 'border-ok bg-ok/10 text-ok',
  failed: 'border-err bg-err/10 text-err',
  skipped: 'border-line border-dashed bg-surface-2 text-fg-subtle',
}

export default function StageNode({
  status,
  selected,
  onSelect,
}: {
  status: StageStatus
  selected: boolean
  onSelect: () => void
}) {
  const Icon = status.state === 'failed' ? AlertTriangle : status.state === 'skipped' ? MinusCircle : ICONS[status.id]
  const meta = STAGE_META[status.id]
  const live = useElapsedSeconds(status.state === 'running' ? status.startedAt : null)

  const interactive = status.state !== 'blocked'

  // A disabled node with no explanation reads as "broken" rather than "not yet". Say which
  // stage has to land first.
  const title = interactive
    ? meta.hint
    : `${meta.hint} — available once the previous stage produces its input`

  const timing =
    status.state === 'running'
      ? live === null
        ? null
        : formatSeconds(live)
      : status.elapsedMs !== null
        ? formatSeconds(status.elapsedMs / 1000)
        : null

  // No background box on the node: it would paint over the connector, which now runs behind the
  // node's dead space to reach the circle. It also made the selected stage read as a separate
  // card rather than a stop on one rail — so selection lives on the circle instead.
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!interactive}
      aria-current={selected ? 'step' : undefined}
      title={title}
      className={cn(
        'group relative z-10 flex w-[7.5rem] flex-col items-center gap-1.5 px-2 py-3',
        interactive ? 'cursor-pointer' : 'cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full border-2',
          'transition-all duration-[var(--dur)]',
          RING[status.state],
          interactive && 'group-hover:scale-105',
          selected && 'ring-2 ring-accent/60 ring-offset-2 ring-offset-surface',
        )}
      >
        {status.state === 'passed' ? (
          <Check className="h-5 w-5" strokeWidth={2.5} />
        ) : (
          <Icon className="h-5 w-5" />
        )}
      </span>

      <span
        className={cn(
          'text-xs font-semibold leading-none transition-colors',
          status.state === 'blocked'
            ? 'text-fg-subtle'
            : selected
              ? 'text-accent'
              : 'text-fg group-hover:text-accent',
        )}
      >
        {meta.label}
      </span>

      <span className="flex h-4 items-center gap-1 text-[10px] leading-none text-fg-muted">
        {timing && <span className="tabular-nums">{timing}</span>}
        {timing && status.artifactCount !== null && <span aria-hidden>·</span>}
        {status.artifactCount !== null && status.state !== 'running' && (
          <span className="tabular-nums">{status.artifactCount}</span>
        )}
        {status.state === 'skipped' && <span>skipped</span>}
      </span>
    </button>
  )
}
