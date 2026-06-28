import { CheckCircle2, XCircle } from 'lucide-react'
import type { ValidationResult as Result } from '../services/api'

interface ValidationResultProps {
  result: Result
}

export default function ValidationResult({ result }: ValidationResultProps) {
  if (result.valid) {
    return (
      <div className="flex items-start gap-2 text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-600" />
        <div>
          <span className="font-semibold">Valid</span> against{' '}
          <span className="font-mono">{result.schema}</span>. No schema violations found.
        </div>
      </div>
    )
  }

  return (
    <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
        <div>
          <span className="font-semibold">Invalid</span> against{' '}
          <span className="font-mono">{result.schema}</span>: {result.error_count} issue
          {result.error_count === 1 ? '' : 's'} found.
        </div>
      </div>
      <ul className="mt-2.5 space-y-1.5 pl-6">
        {result.errors.map((issue, i) => (
          <li key={i} className="border-l-2 border-red-200 pl-2.5">
            <div className="text-red-900">{issue.message}</div>
            {(issue.path || issue.line != null) && (
              <div className="text-[11px] text-red-500 mt-0.5 font-mono">
                {issue.path ? issue.path : ''}
                {issue.path && issue.line != null ? ' · ' : ''}
                {issue.line != null ? `line ${issue.line}` : ''}
              </div>
            )}
          </li>
        ))}
      </ul>
      {result.error_count > result.errors.length && (
        <div className="mt-2 pl-6 text-[11px] text-red-500 italic">
          … {result.error_count - result.errors.length} more issue(s) not shown.
        </div>
      )}
    </div>
  )
}
