import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FlaskConical } from 'lucide-react'
import PipelineRail from '../features/flow/PipelineRail'
import RunToolbar from '../features/flow/RunToolbar'
import StagePanel, { type FhirView } from '../features/flow/StagePanel'
import { useFixturesEnabled } from '../pipeline/DriverProvider'
import { usePipelineRun } from '../pipeline/usePipelineRun'
import { STAGE_ORDER, type StageId } from '../pipeline/types'

export default function FlowPage() {
  const run = usePipelineRun()
  const [params] = useSearchParams()
  const fixtures = useFixturesEnabled()
  const [selected, setSelected] = useState<StageId>('schema')
  const [fhirView, setFhirView] = useState<FhirView>('compare')

  const { state, actions } = run
  const busy = useMemo(
    () => STAGE_ORDER.some((id) => state.stages[id].state === 'running'),
    [state.stages],
  )

  // Deep link: /flow?canonical=roster&autorun=1. Latched, because StrictMode double-invokes
  // effects in dev and the demo would otherwise fire twice.
  const autorun = useRef(false)
  useEffect(() => {
    if (autorun.current) return
    const canonical = params.get('canonical')
    if (!canonical) return
    autorun.current = true

    actions.selectBuiltin(canonical)
    if (params.get('autorun') === '1') {
      setSelected('generate')
      // Let the selection land before the run reads it.
      queueMicrotask(() => void actions.runAll())
    }
  }, [params, actions])

  // Follow the run: whichever stage is working becomes the open panel, unless the user
  // has clicked elsewhere since the run started.
  const userPicked = useRef(false)
  useEffect(() => {
    if (userPicked.current) return
    const running = STAGE_ORDER.find((id) => state.stages[id].state === 'running')
    if (running) setSelected(running)
  }, [state.stages])

  const pick = (id: StageId) => {
    userPicked.current = true
    setSelected(id)
  }

  useEffect(() => {
    if (!busy) userPicked.current = false
  }, [busy])

  return (
    // The pipeline always renders dark, whatever the app theme is. It's a console: dense,
    // code-heavy, and watched while it runs — the tokens are custom properties, so the
    // `dark` class here re-points them for this subtree only.
    <div className="dark flex h-full min-h-0 flex-col bg-bg text-fg-body">
      {fixtures && (
        <div className="flex items-center gap-2 border-b border-warn-border bg-warn-bg px-4 py-1.5 text-[11px] text-warn">
          <FlaskConical className="h-3.5 w-3.5" />
          Fixture mode — replaying checked-in sample files. No backend is being called.
        </div>
      )}

      <RunToolbar run={run} busy={busy} />

      <div className="flex-none border-b border-line bg-surface">
        <PipelineRail
          stages={state.stages}
          selected={selected}
          onSelect={pick}
          stale={state.artifacts.canonicalDirty}
        />
      </div>

      <div className="min-h-0 flex-1 bg-surface">
        <StagePanel
          stage={selected}
          run={run}
          busy={busy}
          fhirView={fhirView}
          onFhirViewChange={setFhirView}
        />
      </div>
    </div>
  )
}
