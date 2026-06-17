import { forwardRef } from 'react';
import { cn } from '@/shared/lib/cn';
import { Button, type ButtonProps } from './Button';

// Botão de ícone — wrapper de Button com size icon e aria-label obrigatório.
// Espelha o IconButton do HiperTMS (shared/ui/icon-button.tsx).
export type IconButtonProps = Omit<ButtonProps, 'size'> & {
  /** Texto para aria-label (acessibilidade). Obrigatório. */
  label: string;
  size?: 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ className, label, size = 'icon', children, ...props }, ref) {
    return (
      <Button
        ref={ref}
        size={size}
        aria-label={label}
        className={cn('shrink-0', className)}
        {...props}
      >
        {children}
      </Button>
    );
  },
);

IconButton.displayName = 'IconButton';
