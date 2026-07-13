import { CheckCircle2, XCircle } from 'lucide-react'
import type { ValidationResult as Result } from '../services/api'

interface ValidationResultProps {
  result: Result
}

export default function ValidationResult({ result }: ValidationResultProps) {
  if (result.valid) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-ok-border bg-ok-bg p-3 text-xs text-ok">
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div>
          <span className="font-semibold">Valid</span> against{' '}
          <span className="font-mono">{result.schema}</span>. No schema violations found.
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-err-border bg-err-bg p-3 text-xs text-err">
      <div className="flex items-start gap-2">
        <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div>
          <span className="font-semibold">Invalid</span> against{' '}
          <span className="font-mono">{result.schema}</span>: {result.error_count} issue
          {result.error_count === 1 ? '' : 's'} found.
        </div>
      </div>
      <ul className="mt-2.5 space-y-1.5 pl-6">
        {result.errors.map((issue, i) => (
          <li key={i} className="border-l-2 border-err-border pl-2.5">
            <div>{issue.message}</div>
            {(issue.path || issue.line != null) && (
              <div className="mt-0.5 font-mono text-[11px] text-err/70">
                {issue.path ? issue.path : ''}
                {issue.path && issue.line != null ? ' · ' : ''}
                {issue.line != null ? `line ${issue.line}` : ''}
              </div>
            )}
          </li>
        ))}
      </ul>
      {result.error_count > result.errors.length && (
        <div className="mt-2 pl-6 text-[11px] italic text-err/70">
          … {result.error_count - result.errors.length} more issue(s) not shown.
        </div>
      )}
    </div>
  )
}
