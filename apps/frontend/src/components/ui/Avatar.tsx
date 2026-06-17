/**
 * Avatar — imagem de usuário / entidade com fallback em iniciais.
 * Tamanhos: xs | sm | md | lg. Status dot: online | busy | away | offline.
 * Espelha o Avatar do manifest do HiperTMS DS (components/data/Avatar.jsx).
 */
import { cn } from '@/shared/lib/cn';

export type AvatarSize   = 'xs' | 'sm' | 'md' | 'lg';
export type AvatarStatus = 'online' | 'busy' | 'away' | 'offline';

const SIZE: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-[30px] w-[30px] text-xs',
  md: 'h-[38px] w-[38px] text-sm',
  lg: 'h-12 w-12 text-lg',
};

const DOT: Record<AvatarSize, string> = {
  xs: 'h-2 w-2',
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
  lg: 'h-3.5 w-3.5',
};

const STATUS_COLOR: Record<AvatarStatus, string> = {
  online:  'bg-emerald-500',
  busy:    'bg-red-500',
  away:    'bg-amber-500',
  offline: 'bg-zinc-400',
};

export interface AvatarProps {
  name?: string;
  src?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  /** Borda quadrada (rounded-md) em vez de circular. */
  square?: boolean;
  className?: string;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function Avatar({
  name = '',
  src,
  size = 'md',
  status,
  square = false,
  className,
}: AvatarProps) {
  return (
    <span className={cn('relative inline-flex shrink-0', SIZE[size], className)}>
      <span
        className={cn(
          'flex h-full w-full items-center justify-center overflow-hidden font-bold text-white',
          square ? 'rounded-md' : 'rounded-full',
        )}
        style={{ background: 'var(--color-navy, #1e3a5f)' }}
      >
        {src ? (
          <img src={src} alt={name} className="h-full w-full object-cover" />
        ) : (
          getInitials(name)
        )}
      </span>
      {status && (
        <span
          aria-label={status}
          title={status}
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[var(--surface-elevated,#fff)]',
            DOT[size],
            STATUS_COLOR[status],
          )}
        />
      )}
    </span>
  );
}
