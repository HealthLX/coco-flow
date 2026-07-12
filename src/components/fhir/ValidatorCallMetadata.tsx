import { formatSeconds } from '../../hooks/useElapsedSeconds'
import { profileLabel, type FhirDoc, type FhirRowState } from '../../pipeline/derive'
import type { FhirValidatorConfig } from '../../services/api'

/**
 * The upstream request behind this row. Stays visible after the call settles, so a passing
 * result still shows what it was actually checked against.
 */
export default function ValidatorCallMetadata({
  doc,
  config,
  state,
  liveSeconds,
}: {
  doc: FhirDoc
  config: FhirValidatorConfig | undefined
  state: FhirRowState
  liveSeconds: number | null
}) {
  if (!config || state.status === 'queued') return null
  // A cold engine loads the IG before it can validate anything, which dominates the wait.
  const coldStart = state.status === 'running' && !config.sessionActive && (liveSeconds ?? 0) > 3

  return (
    <div className="mb-2 rounded-lg border border-line bg-surface-2 p-2.5 font-mono text-[11px] leading-relaxed text-fg-muted">
      <div className="text-fg-body">
        {config.method} {config.endpoint}
      </div>
      <div>
        sv={config.fhirVersion} · igs={config.igs.join(', ')} · txServer={config.txServer}
      </div>
      <div>profiles={doc.profile ? profileLabel(doc.profile) : '[] (base FHIR R4)'}</div>
      <div>
        filesToValidate=[{doc.fileName}] · timeout={config.timeoutMs / 1000}s · attempts&le;
        {config.maxAttempts}
      </div>

      {coldStart && (
        <div className="mt-1 text-warn">
          cold engine — loading {config.igs[0]} definitions, this first call can take ~50s
        </div>
      )}

      {state.status === 'done' && (
        <div className="mt-1 text-fg-subtle">
          → {state.result.error_count} issue{state.result.error_count === 1 ? '' : 's'} in{' '}
          {formatSeconds(state.elapsedMs / 1000)}
        </div>
      )}
      {state.status === 'error' && (
        <div className="mt-1 text-err">
          → request failed after {formatSeconds(state.elapsedMs / 1000)}
        </div>
      )}
    </div>
  )
}
