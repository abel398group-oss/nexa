import { cn } from '@/lib/cn';

// Estado de carregamento centralizado (spinner + rótulo).
export function LoadingState({ label = 'Carregando…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <span
        className="size-7 animate-spin rounded-full border-2 border-base-300 border-t-brand-500"
        aria-hidden
      />
      <p className="text-sm text-base-content/60">{label}</p>
    </div>
  );
}
