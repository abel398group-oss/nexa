import {
  ChartContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ChartTooltip,
  chartTooltip,
  chartColors,
} from '@/components/ui/Chart';

/**
 * Funil de campanhas do Dashboard. Em arquivo próprio para ser carregado via
 * React.lazy — assim o `recharts` fica num chunk async e não pesa o bundle
 * inicial das outras telas.
 */
export default function DashboardCampaignChart({
  sent,
  delivered,
  read,
  replied,
}: {
  sent: number;
  delivered: number;
  read: number;
  replied: number;
}) {
  return (
    <ChartContainer height={240}>
      <BarChart
        data={[
          { label: 'Enviados', value: sent },
          { label: 'Entregue', value: delivered },
          { label: 'Lido', value: read },
          { label: 'Respondeu', value: replied },
        ]}
        margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
        <ChartTooltip {...chartTooltip} />
        <Bar dataKey="value" name="Contatos" fill={chartColors.brand} radius={[6, 6, 0, 0]} maxBarSize={64} />
      </BarChart>
    </ChartContainer>
  );
}
