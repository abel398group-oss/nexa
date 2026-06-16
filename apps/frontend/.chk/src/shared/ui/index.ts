/**
 * @/shared/ui — fachada pública do design system do Nexa.
 *
 * Telas e features devem importar daqui:
 *   import { Button, Card, Input, StatusBadge, Table } from '@/shared/ui';
 *
 * Importe direto de '@/components/ui/*' apenas dentro do próprio design system.
 * Tokens (cores/sombras/zoom/dark) ficam em src/index.css + tailwind.config.js,
 * espelhando o globals.css do HiperTMS.
 */

// Ícones de linha (outline)
export * from '@/components/ui/icons';

// Moldura de página
export * from '@/components/ui/PageHeader';
export * from '@/components/ui/Breadcrumb';

// Primitivos base
export * from '@/components/ui/Button';
export * from '@/components/ui/Input';
export * from '@/components/ui/Textarea';
export * from '@/components/ui/Select';
export * from '@/components/ui/Label';
export * from '@/components/ui/Card';
export * from '@/components/ui/Checkbox';
export * from '@/components/ui/Switch';
export * from '@/components/ui/Separator';

// Dados / navegação
export * from '@/components/ui/Table';
export * from '@/components/ui/Tabs';
export * from '@/components/ui/Pagination';
// Chart NÃO entra no barrel de propósito: o recharts é pesado e deve ser
// carregado sob demanda (ver pages/DashboardCampaignChart.tsx + React.lazy).
// Importe de '@/components/ui/Chart' direto dentro de um componente lazy.
export * from '@/components/ui/Calendar';

// Feedback / status
export * from '@/components/ui/StatusBadge';
export * from '@/components/ui/Badge';
export * from '@/components/ui/Alert';
export * from '@/components/ui/Tooltip';
export * from '@/components/ui/EmptyState';
export * from '@/components/ui/ErrorState';
export * from '@/components/ui/LoadingState';
export * from '@/components/ui/Skeleton';
export * from '@/components/ui/Sheet';

// Overlays
export * from '@/components/ui/Popover';
export * from '@/components/ui/Modal';

// Confirmação (hook imperativo) — modal de confirmar/cancelar
export { useConfirm, ConfirmProvider } from '@/app/providers/ConfirmContext';
