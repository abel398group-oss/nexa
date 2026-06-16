import { cn } from '@/shared/lib/cn';

// Divisor horizontal ou vertical.
export function Separator({
  orientation = 'horizontal',
  className,
}: {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn('bg-base-300', orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full', className)}
    />
  );
}
