import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { Info, Link2, Pin, PinOff } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Skeleton from '../../components/ui/Skeleton'
import { cn } from '../../components/ui/cn'
import type { Highlight } from '../../components/editor/CodeEditor'
import { buildLinkMap, type Link as ValueLink } from '../../lib/linkMap'
import type { Leaf } from '../../lib/xmlLeaves'
import type { FhirDoc } from '../../pipeline/derive'

const CodeEditor = lazy(() => import('../../components/editor/CodeEditor'))

const CONFIDENCE_CLASS: Record<ValueLink['confidence'], string> = {
  exact: 'cm-link-exact',
  derived: 'cm-link-derived',
  date: 'cm-link-date',
  ambiguous: 'cm-link-ambiguous',
}

const CONFIDENCE_COPY: Record<ValueLink['confidence'], string> = {
  exact: 'carried across unchanged',
  derived: 'derived — the transform decorated this value',
  date: 'same date, reformatted',
  ambiguous: 'this value appears in several places',
}

function findLeafAt(leaves: Leaf[], offset: number | null): Leaf | null {
  if (offset == null) return null
  return leaves.find((l) => offset >= l.from && offset <= l.to) ?? null
}

/**
 * Canonical XML on the left, the FHIR it produced on the right, with the link between them
 * made visible. Answers the question this audience actually has — "where did this field go?"
 * — which today can only be answered by reading two documents side by side and guessing.
 */
export default function LinkedSplitView({
  canonicalXml,
  canonicalFilename,
  fhirDocs,
}: {
  canonicalXml: string
  canonicalFilename: string
  fhirDocs: FhirDoc[]
}) {
  const [docIndex, setDocIndex] = useState(0)
  const [hovered, setHovered] = useState<Leaf | null>(null)
  const [pinned, setPinned] = useState<Leaf | null>(null)
  const [onlyUnmapped, setOnlyUnmapped] = useState(false)

  const map = useMemo(
    () => buildLinkMap(canonicalXml, fhirDocs.map((d) => ({ fileName: d.fileName, xml: d.xml }))),
    [canonicalXml, fhirDocs],
  )

  const active = pinned ?? hovered
  const activeLink = active ? (map.byCanonical.get(active.id) ?? null) : null
  const doc = fhirDocs[docIndex]

  const unmappedIds = useMemo(() => new Set(map.unmapped.map((l) => l.id)), [map])

  // Left gutter: every canonical leaf, coloured by how well it maps.
  const canonicalHighlights: Highlight[] = useMemo(() => {
    const out: Highlight[] = []
    for (const leaf of map.canonicalLeaves) {
      const link = map.byCanonical.get(leaf.id)
      const isUnmapped = unmappedIds.has(leaf.id)
      if (onlyUnmapped && !isUnmapped) continue
      if (!link && !isUnmapped) continue

      const isActive = active?.id === leaf.id
      out.push({
        from: leaf.from,
        to: leaf.to,
        className: isActive
          ? 'cm-link-active'
          : isUnmapped
            ? 'cm-link-unmapped'
            : CONFIDENCE_CLASS[link!.confidence],
      })
    }
    return out
  }, [map, active, onlyUnmapped, unmappedIds])

  // Right gutter: only what the hovered/pinned canonical field reaches, in this document.
  const fhirHighlights: Highlight[] = useMemo(() => {
    if (!activeLink) return []
    return activeLink.targets
      .filter((t) => t.docIndex === docIndex)
      .map((t) => ({ from: t.leaf.from, to: t.leaf.to, className: 'cm-link-active' }))
  }, [activeLink, docIndex])

  // Follow the link: if the target is off-screen, bring it into view.
  const scrollTo = fhirHighlights.length ? fhirHighlights[0].from : null

  const hoverCanonical = useCallback(
    (offset: number | null) => {
      if (pinned) return
      setHovered(findLeafAt(map.canonicalLeaves, offset))
    },
    [map.canonicalLeaves, pinned],
  )

  const clickCanonical = useCallback(
    (offset: number | null) => {
      const leaf = findLeafAt(map.canonicalLeaves, offset)
      setPinned((prev) => (prev && leaf && prev.id === leaf.id ? null : leaf))
      setHovered(leaf)
    },
    [map.canonicalLeaves],
  )

  // If the pinned field lands in another document, follow it there.
  const targetDocs = activeLink ? new Set(activeLink.targets.map((t) => t.docIndex)) : null

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-fg-muted">
          <Link2 className="h-3.5 w-3.5" />
          Hover a canonical value to see what it became. Click to pin it.
        </span>

        <button
          onClick={() => setOnlyUnmapped((v) => !v)}
          className={cn(
            'ml-auto rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
            onlyUnmapped
              ? 'border-warn bg-warn-bg text-warn'
              : 'border-line bg-surface text-fg-muted hover:text-fg-body',
          )}
        >
          {map.unmapped.length} unmapped
        </button>

        {pinned && (
          <button
            onClick={() => setPinned(null)}
            className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent"
          >
            <PinOff className="h-3 w-3" />
            Unpin
          </button>
        )}
      </div>

      {/* What the active field maps to, said in words rather than left to the colours. */}
      <div className="flex min-h-[2.25rem] items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-xs">
        {!active ? (
          <span className="text-fg-subtle">Nothing selected.</span>
        ) : activeLink ? (
          <>
            {pinned && <Pin className="h-3 w-3 flex-shrink-0 text-accent" />}
            <code className="font-mono text-fg">{active.path.split('/').slice(-2).join('/')}</code>
            <span className="text-fg-subtle">→</span>
            <code className="truncate font-mono text-accent">
              {activeLink.targets
                .slice(0, 3)
                .map((t) => t.leaf.path.split('/').slice(-2).join('/'))
                .join(', ')}
              {activeLink.targets.length > 3 && ` +${activeLink.targets.length - 3}`}
            </code>
            <span className="ml-auto flex-shrink-0 text-fg-muted">
              {CONFIDENCE_COPY[activeLink.confidence]}
            </span>
          </>
        ) : (
          <>
            {pinned && <Pin className="h-3 w-3 flex-shrink-0 text-accent" />}
            <code className="font-mono text-fg">{active.path.split('/').slice(-2).join('/')}</code>
            <span className="text-warn">
              is not carried into the FHIR output — the transform either drops it or translates
              its code, and value matching can't tell those apart.
            </span>
          </>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-line">
          <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-1.5">
            <Badge tone="canonical">Canonical</Badge>
            <span className="truncate font-mono text-[11px] text-fg-body">{canonicalFilename}</span>
          </div>
          <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
            <CodeEditor
              value={canonicalXml}
              readOnly
              dark
              highlights={canonicalHighlights}
              onHoverOffset={hoverCanonical}
              onClickOffset={clickCanonical}
              className="min-h-0 flex-1"
            />
          </Suspense>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-line">
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line bg-surface-2 px-3 py-1.5">
            <Badge tone="fhir">FHIR</Badge>
            {fhirDocs.map((d, i) => (
              <button
                key={d.fileName}
                onClick={() => setDocIndex(i)}
                className={cn(
                  'whitespace-nowrap rounded px-2 py-0.5 font-mono text-[11px] transition-colors',
                  i === docIndex
                    ? 'bg-surface font-semibold text-fg shadow-sm'
                    : 'text-fg-muted hover:text-fg-body',
                  // Mark the tabs that hold what the pinned field reaches.
                  targetDocs?.has(i) && i !== docIndex && 'text-accent',
                )}
              >
                {d.resourceType ?? d.fileName}
              </button>
            ))}
          </div>
          {doc ? (
            <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
              <CodeEditor
                key={doc.fileName}
                value={doc.xml}
                readOnly
                dark
                highlights={fhirHighlights}
                scrollTo={scrollTo}
                className="min-h-0 flex-1"
              />
            </Suspense>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-fg-subtle">
              No FHIR output.
            </div>
          )}
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-fg-subtle">
        <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
        Links are inferred by matching values, not by reading the XSLT. A field whose code the
        transform translates (<code className="font-mono">M</code> →{' '}
        <code className="font-mono">male</code>) shares no value, so it reads as unmapped even
        though it was carried across.
      </p>
    </div>
  )
}
