import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-surface rounded-lg border border-line shadow-sm', className)}
      {...rest}
    />
  )
}

export function CardHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start gap-3 px-4 py-3 border-b border-line', className)}>
      {icon && <span className="mt-0.5 text-fg-muted">{icon}</span>}
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-fg leading-tight">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...rest} />
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-4 py-3 border-t border-line bg-surface-2 rounded-b-lg', className)}
      {...rest}
    />
  )
}
