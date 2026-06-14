import {
  ChartContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ChartTooltip,
  Legend,
  chartTooltip,
  chartColors,
} from '@/components/ui/Chart';

export interface ActivityPoint {
  day: string; // YYYY-MM-DD
  inbound: number;
  outbound: number;
  conversations: number;
}

// rótulo curto DD/MM a partir de YYYY-MM-DD (sem criar Date pra evitar shift de fuso)
function shortDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/**
 * Atividade por período (Q5): mensagens recebidas/enviadas e novas conversas
 * por dia. Arquivo próprio p/ carregar via React.lazy (recharts em chunk async).
 */
export default function DashboardActivityChart({ series }: { series: ActivityPoint[] }) {
  const data = series.map((p) => ({ ...p, label: shortDay(p.day) }));
  return (
    <ChartContainer height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} minTickGap={16} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
        <ChartTooltip {...chartTooltip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="inbound" name="Recebidas" stroke={chartColors.blue} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="outbound" name="Enviadas" stroke={chartColors.brand} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="conversations" name="Novas conversas" stroke={chartColors.green} strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}
