import {
  ChartContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ChartTooltip,
  Legend,
  chartTooltip,
  chartColors,
} from '@/components/ui/Chart';

export interface EvolutionPoint {
  weekStart: string; // YYYY-MM-DD (segunda-feira)
  received: number;
  won: number;
}

// rótulo curto DD/MM a partir de YYYY-MM-DD (sem criar Date pra evitar shift de fuso)
function shortDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/**
 * F6+ (seller-leads): evolução semanal do funil — leads recebidos × fechados
 * por semana. Arquivo próprio p/ carregar via React.lazy (recharts em chunk
 * async), mesmo padrão do DashboardActivityChart.
 */
export default function OpportunitiesEvolutionChart({ series }: { series: EvolutionPoint[] }) {
  const data = series.map((p) => ({ ...p, label: shortDay(p.weekStart) }));
  return (
    <ChartContainer height={200}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} minTickGap={16} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
        <ChartTooltip {...chartTooltip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="received" name="Recebidos" fill={chartColors.blue} radius={[3, 3, 0, 0]} />
        <Bar dataKey="won" name="Fechados" fill={chartColors.green} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
