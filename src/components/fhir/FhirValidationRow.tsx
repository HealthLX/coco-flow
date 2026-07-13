import { AlertCircle } from 'lucide-react'
import { useElapsedSeconds, formatSeconds } from '../../hooks/useElapsedSeconds'
import { profileLabel, type FhirDoc, type FhirRowState } from '../../pipeline/derive'
import type { FhirValidatorConfig } from '../../services/api'
import Spinner from '../Spinner'
import ValidationResult from '../ValidationResult'
import ValidatorCallMetadata from './ValidatorCallMetadata'

export default function FhirValidationRow({
  doc,
  state,
  config,
}: {
  doc: FhirDoc
  state: FhirRowState
  config: FhirValidatorConfig | undefined
}) {
  const liveSeconds = useElapsedSeconds(state.status === 'running' ? state.startedAt : null)

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="badge-fhir">{doc.resourceType ?? 'FHIR'}</span>
        <span className="text-xs font-mono text-fg-body">{doc.fileName}</span>

        <span className="ml-auto flex items-center gap-1.5 text-xs">
          {state.status === 'queued' && <span className="text-fg-subtle">Queued</span>}
          {state.status === 'running' && (
            <>
              <Spinner size="sm" tone="green" />
              <span className="text-fg-muted tabular-nums">
                {liveSeconds === null ? '' : formatSeconds(liveSeconds)}
              </span>
            </>
          )}
          {state.status !== 'queued' && state.status !== 'running' && (
            <span className="text-fg-subtle tabular-nums">
              {formatSeconds(state.elapsedMs / 1000)}
            </span>
          )}
        </span>
      </div>

      <ValidatorCallMetadata doc={doc} config={config} state={state} liveSeconds={liveSeconds} />

      {state.status === 'done' && (
        <ValidationResult
          result={{
            valid: state.result.valid,
            schema: profileLabel(state.result.schema),
            error_count: state.result.error_count,
            errors: state.result.errors,
          }}
        />
      )}

      {state.status === 'error' && (
        <div className="flex items-start gap-2 text-xs text-err bg-err-bg border border-err-border rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 " />
          {state.message}
        </div>
      )}
    </div>
  )
}
