import { cn } from './cn'

export default function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded bg-surface-3', className)}
    />
  )
}
