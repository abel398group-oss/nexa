import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';

/**
 * Camada fina sobre o Recharts (mesmo motor do TMS) para padronizar cores,
 * altura e tema (claro/escuro) via tokens do design system.
 *
 * Uso:
 *   import { ChartContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, ChartTooltip, chartColors } from '@/shared/ui';
 *   <ChartContainer height={260}>
 *     <BarChart data={data}>
 *       <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
 *       <XAxis dataKey="label" /><YAxis />
 *       <ChartTooltip {...chartTooltip} />
 *       <Bar dataKey="value" fill={chartColors.brand} radius={[6, 6, 0, 0]} />
 *     </BarChart>
 *   </ChartContainer>
 */

// Paleta alinhada aos accents dos cards do dashboard / tokens do TMS.
export const chartColors = {
  brand: 'var(--brand-500, #f97316)',
  blue: '#3b82f6',
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  zinc: '#a1a1aa',
} as const;

export const chartPalette = [
  chartColors.brand,
  chartColors.blue,
  chartColors.green,
  chartColors.amber,
  chartColors.red,
  chartColors.zinc,
];

// Estilo de tooltip que respeita o tema (surface elevada + borda + raio).
const tooltipContentStyle: CSSProperties = {
  background: 'var(--surface-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--text-primary)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
};

/** Props prontos para `<Tooltip {...chartTooltip} />` (importado como ChartTooltip). */
export const chartTooltip = {
  cursor: { fill: 'var(--surface-muted)', opacity: 0.4 },
  contentStyle: tooltipContentStyle,
  labelStyle: { color: 'var(--text-muted)', marginBottom: 4 },
};

/** Wrapper responsivo com altura fixa. `children` deve ser um único gráfico do Recharts. */
export function ChartContainer({
  height = 240,
  className,
  children,
}: {
  height?: number;
  className?: string;
  children: ReactElement;
}): ReactNode {
  return (
    <div className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

// Re-exporta as peças do Recharts mais usadas para importar tudo via @/shared/ui.
export {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
