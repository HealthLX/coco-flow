type SpinnerSize = 'sm' | 'md'
type SpinnerTone = 'white' | 'red' | 'gray' | 'green'

const SIZE: Record<SpinnerSize, string> = {
  sm: 'w-3.5 h-3.5 border-2',
  md: 'w-4 h-4 border-2',
}

const TONE: Record<SpinnerTone, string> = {
  white: 'border-white/30 border-t-white',
  red: 'border-brand/30 border-t-brand',
  gray: 'border-line-strong border-t-fg-muted',
  green: 'border-ok/30 border-t-ok',
}

interface SpinnerProps {
  size?: SpinnerSize
  tone?: SpinnerTone
  className?: string
}

export default function Spinner({ size = 'md', tone = 'white', className = '' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block rounded-full animate-spin ${SIZE[size]} ${TONE[tone]} ${className}`.trim()}
    />
  )
}
