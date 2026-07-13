import { useRef } from 'react'
import { cn } from './cn'

export interface Segment<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

/**
 * Single-choice strip. Arrow keys move between options (roving tabindex), so the whole
 * control is one tab stop rather than N.
 */
export default function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: {
  segments: Segment<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const move = (from: number, delta: number) => {
    const n = segments.length
    for (let step = 1; step <= n; step++) {
      const i = (((from + delta * step) % n) + n) % n
      if (!segments[i].disabled) {
        refs.current[i]?.focus()
        onChange(segments[i].value)
        return
      }
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 p-0.5 rounded-md bg-surface-3 border border-line',
        className,
      )}
    >
      {segments.map((seg, i) => {
        const active = seg.value === value
        return (
          <button
            key={seg.value}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={seg.disabled}
            onClick={() => onChange(seg.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                move(i, 1)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                move(i, -1)
              }
            }}
            className={cn(
              'rounded font-semibold transition-colors duration-[var(--dur-fast)]',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
              active
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg-body hover:bg-surface/60',
            )}
          >
            {seg.label}
          </button>
        )
      })}
    </div>
  )
}
