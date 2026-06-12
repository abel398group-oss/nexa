import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

// Botão canônico do design system (tokens brand-*/base-*). Espelha o Button do TMS.
export type ButtonVariant =
  | 'primary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  | 'secondary'
  | 'success'
  | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/30 disabled:pointer-events-none disabled:opacity-50';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-white shadow-sm hover:bg-brand-600',
  destructive: 'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-600/30',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-600/30',
  outline: 'border border-base-300 bg-base-100 text-base-content shadow-sm hover:bg-base-200',
  secondary: 'bg-base-200 text-base-content hover:bg-base-300',
  ghost: 'text-base-content hover:bg-base-200',
  link: 'text-brand-600 underline-offset-4 hover:underline',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4',
  lg: 'h-10 px-6',
  icon: 'h-9 w-9',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Desabilita o botão e mostra um spinner. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={Boolean(disabled || loading)}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANT[variant], SIZE[size], className)}
      {...props}
    >
      {loading && (
        <span
          className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
});
