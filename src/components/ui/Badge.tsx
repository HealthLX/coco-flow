import type { HTMLAttributes } from 'react'
import { cn } from './cn'

export type BadgeTone =
  | 'canonical'
  | 'fhir'
  | 'xsd'
  | 'xslt'
  | 'brand'
  | 'accent'
  | 'ok'
  | 'warn'
  | 'err'
  | 'neutral'

const TONES: Record<BadgeTone, string> = {
  canonical: 'bg-canonical-bg text-canonical border-canonical-border',
  fhir: 'bg-fhir-bg text-fhir border-fhir-border',
  xsd: 'bg-xsd-bg text-xsd border-xsd-border',
  xslt: 'bg-xslt-bg text-xslt border-xslt-border',
  brand: 'bg-brand text-brand-fg border-transparent',
  accent: 'bg-accent/10 text-accent border-accent/30',
  ok: 'bg-ok-bg text-ok border-ok-border',
  warn: 'bg-warn-bg text-warn border-warn-border',
  err: 'bg-err-bg text-err border-err-border',
  neutral: 'bg-surface-3 text-fg-muted border-line',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

export default function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full',
        'text-xs font-medium border',
        TONES[tone],
        className,
      )}
      {...rest}
    />
  )
}
