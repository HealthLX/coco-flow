import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'
import Spinner from '../Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg hover:bg-brand-hover',
  secondary: 'bg-surface text-brand border border-brand hover:bg-brand/10',
  ghost: 'bg-transparent text-brand hover:bg-brand/10',
  subtle: 'bg-surface-3 text-fg-body border border-line hover:bg-surface-2 hover:text-fg',
  danger: 'bg-err text-white hover:bg-err/90',
}

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5 rounded',
  md: 'px-4 py-2 text-sm gap-2 rounded-md',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold whitespace-nowrap',
        'transition-colors duration-[var(--dur-fast)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size="sm" tone={variant === 'primary' || variant === 'danger' ? 'white' : 'red'} />
      ) : (
        icon
      )}
      {children}
    </button>
  )
})

export default Button
