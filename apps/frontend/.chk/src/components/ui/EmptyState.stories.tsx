import type { Meta, StoryObj } from '@storybook/react';
import { EmptyState } from './EmptyState';
import { Button } from './Button';
import { Icon } from './icons';

const meta = {
  title: 'Feedback/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
} satisfies Meta<typeof EmptyState>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Simples: Story = {
  args: { title: 'Nenhum contato ainda', description: 'Importe sua base ou adicione um contato para começar.' },
};

export const ComAcao: Story = {
  render: () => (
    <EmptyState
      icon={<Icon name="sellers" className="h-9 w-9" />}
      title="Nenhum vendedor cadastrado"
      description="Adicione um vendedor — ele recebe os leads quentes automaticamente."
      action={<Button><Icon name="plus" className="h-4 w-4" /> Adicionar vendedor</Button>}
    />
  ),
};
