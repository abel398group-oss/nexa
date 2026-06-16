import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';

const meta = {
  title: 'Feedback/Badge',
  component: Badge,
  tags: ['autodocs'],
  args: { children: 'Status' },
  argTypes: {
    variant: { control: 'select', options: ['success', 'error', 'warning', 'info', 'neutral'] },
  },
} satisfies Meta<typeof Badge>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};

export const Variantes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="success">Ativo</Badge>
      <Badge variant="error">Erro</Badge>
      <Badge variant="warning">Pendente</Badge>
      <Badge variant="info">Novo</Badge>
      <Badge variant="neutral">Rascunho</Badge>
    </div>
  ),
};
