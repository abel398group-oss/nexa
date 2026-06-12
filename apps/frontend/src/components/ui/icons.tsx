import type { SVGProps, ReactNode } from 'react';

/**
 * Ícones de linha (outline) — espelham o estilo Heroicons usado no app shell do
 * HiperTMS. Stroke 1.8, 24x24, herdam cor via `currentColor`.
 */
export type IconName =
  | 'dashboard'
  | 'inbox'
  | 'support'
  | 'contacts'
  | 'knowledge'
  | 'sellers'
  | 'campaigns'
  | 'playbook'
  | 'users'
  | 'mail'
  | 'search'
  | 'sun'
  | 'moon'
  | 'bell'
  | 'dots'
  | 'power'
  | 'chevronLeft'
  | 'chevronRight'
  | 'help'
  | 'bot';

const PATHS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  inbox: (
    <>
      <path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <path d="M3 12h5l2 3h4l2-3h5" />
    </>
  ),
  support: (
    <>
      <path d="M14.6 6.3a3.6 3.6 0 0 0-4.9 4.7l-5.1 5.1a1.9 1.9 0 1 0 2.7 2.7l5.1-5.1a3.6 3.6 0 0 0 4.7-4.9l-2.3 2.3-1.9-.3-.3-1.9 2.3-2.3Z" />
    </>
  ),
  contacts: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.6a3 3 0 0 1 0 5" />
      <path d="M17.5 19a5.5 5.5 0 0 0-2.8-4.8" />
    </>
  ),
  knowledge: (
    <>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H17a1 1 0 0 1 1 1v13H6.5A1.5 1.5 0 0 0 5 18.5V4.5Z" />
      <path d="M5 18.5A1.5 1.5 0 0 0 6.5 20H18" />
    </>
  ),
  sellers: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
      <path d="M3 12h18" />
    </>
  ),
  campaigns: (
    <>
      <path d="M3 10v4a1 1 0 0 0 1 1h2.5L11 19V5L6.5 9H4a1 1 0 0 0-1 1Z" />
      <path d="M15 8.5a4 4 0 0 1 0 7" />
      <path d="M17.5 6a7 7 0 0 1 0 12" />
    </>
  ),
  playbook: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  users: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" />
    </>
  ),
  moon: <path d="M21 12.8A8 8 0 1 1 11.2 3a6 6 0 0 0 9.8 9.8Z" />,
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5 2 5.5H4c.5-.5 2-1.5 2-5.5Z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  power: (
    <>
      <path d="M12 3.5v8" />
      <path d="M7.5 7a8 8 0 1 0 9 0" />
    </>
  ),
  chevronLeft: <path d="m14 6-6 6 6 6" />,
  chevronRight: <path d="m10 6 6 6-6 6" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.2a2.4 2.4 0 0 1 4.2 1.6c0 1.6-2 1.8-2 3.2" />
      <circle cx="11.8" cy="16.8" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  bot: (
    <>
      <rect x="5" y="8" width="14" height="10" rx="3" />
      <path d="M12 4v4M8 13h.01M16 13h.01" />
    </>
  ),
};

export function Icon({
  name,
  className = 'h-5 w-5',
  ...props
}: { name: IconName; className?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
