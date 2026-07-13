import { lazy, Suspense, useEffect, useRef } from 'react'
import { CheckCircle2, PencilLine } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Skeleton from '../../components/ui/Skeleton'
import type { PipelineRun } from '../../pipeline/usePipelineRun'

// ~100 kB gzipped — only the pipeline page pays for it.
const CodeEditor = lazy(() => import('../../components/editor/CodeEditor'))

const REVALIDATE_DEBOUNCE_MS = 600

/**
 * The generated sample, editable. Breaking it re-runs XSD validation against what's on
 * screen and marks the offending line, so the schema stops being an abstraction.
 */
export default function CanonicalEditor({ run }: { run: PipelineRun }) {
  const { state, actions } = run
  const { artifacts, stages } = state
  const issues = artifacts.xsdValidation?.errors ?? []

  // Re-validate after typing settles. Ref-latched so a re-render mid-debounce doesn't
  // schedule a second pass.
  const timer = useRef<number>()
  const validateRef = useRef(actions.validateXsd)
  validateRef.current = actions.validateXsd

  const dirty = artifacts.canonicalDirty
  useEffect(() => {
    if (!dirty) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void validateRef.current(), REVALIDATE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer.current)
  }, [dirty, artifacts.canonicalXml])

  if (!artifacts.canonicalXml) return null

  const validation = artifacts.xsdValidation
  const validating = stages['validate-xsd'].state === 'running'

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line">
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
        <Badge tone="canonical">Canonical</Badge>
        <span className="truncate font-mono text-xs text-fg-body">
          {artifacts.canonicalFilename}
        </span>

        <span className="ml-auto flex items-center gap-2 text-[11px]">
          {dirty && (
            <span className="flex items-center gap-1 text-warn">
              <PencilLine className="h-3 w-3" />
              edited
            </span>
          )}
          {validating ? (
            <span className="text-fg-muted">checking…</span>
          ) : validation ? (
            validation.valid ? (
              <span className="flex items-center gap-1 text-ok">
                <CheckCircle2 className="h-3 w-3" />
                valid
              </span>
            ) : (
              <span className="text-err">
                {validation.error_count} error{validation.error_count === 1 ? '' : 's'}
              </span>
            )
          ) : null}
        </span>
      </div>

      <div className="min-h-[18rem] flex-1 overflow-hidden">
        <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
          <CodeEditor
            value={artifacts.canonicalXml}
            onChange={actions.editCanonical}
            issues={issues}
            dark
            className="h-full"
          />
        </Suspense>
      </div>

      <p className="border-t border-line bg-surface-2 px-3 py-1.5 text-[11px] text-fg-subtle">
        Edit the sample — it re-validates as you type, and the transform runs from what's here.
      </p>
    </div>
  )
}
