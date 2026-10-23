import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-grass-400 text-ink-950 hover:bg-grass-300 shadow-[0_10px_30px_-10px_color-mix(in_oklab,var(--color-grass-400)_65%,transparent)] disabled:shadow-none',
  secondary: 'bg-tint/[0.07] text-ink-100 ring-1 ring-inset ring-tint/10 hover:bg-tint/[0.12]',
  ghost: 'text-ink-200 hover:bg-tint/[0.07] hover:text-ink-100',
  danger: 'bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-400/25 hover:bg-red-500/25'
}

export const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  md: 'h-11 px-5 text-sm gap-2.5 rounded-xl',
  lg: 'h-14 px-7 text-base gap-3 rounded-2xl'
}

const iconSizes: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 }

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  children?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', icon: Icon, className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={iconSizes[size]} strokeWidth={2.25} />}
      {children}
    </button>
  )
}

export function IconButton({
  icon: Icon,
  label,
  className = '',
  size = 18,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; size?: number }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`inline-flex size-9 items-center justify-center rounded-lg text-ink-300 transition hover:bg-tint/[0.08] hover:text-ink-100 disabled:opacity-40 ${className}`}
      {...rest}
    >
      <Icon size={size} strokeWidth={2} />
    </button>
  )
}
