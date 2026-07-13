import { Play, RotateCcw, PencilLine } from 'lucide-react'
import Button from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { CANONICALS } from '../../pipeline/derive'
import type { PipelineRun } from '../../pipeline/usePipelineRun'

export default function RunToolbar({ run, busy }: { run: PipelineRun; busy: boolean }) {
  const { state, actions } = run
  const selected = state.selection.canonical
  const dirty = state.artifacts.canonicalDirty

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {CANONICALS.map((c) => {
          const active = selected === c.name
          return (
            <button
              key={c.name}
              onClick={() => actions.selectBuiltin(c.name)}
              disabled={busy}
              title={c.description}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-[var(--dur-fast)]',
                'disabled:cursor-not-allowed disabled:opacity-50',
                active
                  ? 'border-brand bg-brand text-brand-fg'
                  : 'border-line bg-surface text-fg-body hover:border-brand/50 hover:text-brand',
              )}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {dirty && (
          <span className="flex items-center gap-1.5 rounded-full border border-warn-border bg-warn-bg px-2.5 py-1 text-[11px] font-medium text-warn">
            <PencilLine className="h-3 w-3" />
            Sample edited — downstream results are stale
          </span>
        )}

        <Button
          variant="subtle"
          size="sm"
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          onClick={actions.reset}
          disabled={busy || !selected}
        >
          Reset
        </Button>

        <Button
          size="sm"
          icon={<Play className="h-3.5 w-3.5" />}
          onClick={actions.runAll}
          loading={busy}
          disabled={!selected}
        >
          {busy ? 'Running' : 'Run pipeline'}
        </Button>
      </div>
    </div>
  )
}
