import { Fragment } from 'react'
import { STAGE_ORDER, type StageId, type StageStatus } from '../../pipeline/types'
import FlowEdge from './FlowEdge'
import StageNode from './StageNode'

/**
 * The whole run, at a glance: seven stages, wired together, with data visibly moving between
 * them while a stage is working. This is the screen's thesis — everything else is a panel
 * hanging off whichever node you click.
 */
export default function PipelineRail({
  stages,
  selected,
  onSelect,
  stale = false,
}: {
  stages: Record<StageId, StageStatus>
  selected: StageId
  onSelect: (id: StageId) => void
  /** The sample was edited, so edges downstream of it are carrying results that no longer hold. */
  stale?: boolean
}) {
  return (
    <div
      role="group"
      aria-label="Pipeline stages"
      className="flex items-start overflow-x-auto px-4 py-2"
    >
      {STAGE_ORDER.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && (
            <FlowEdge
              from={stages[STAGE_ORDER[i - 1]]}
              to={stages[id]}
              stale={stale && i >= STAGE_ORDER.indexOf('validate-xsd')}
            />
          )}
          <StageNode
            status={stages[id]}
            selected={selected === id}
            onSelect={() => onSelect(id)}
          />
        </Fragment>
      ))}
    </div>
  )
}
