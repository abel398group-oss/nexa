import type { Meta, StoryObj } from '@storybook/react';
import { Alert } from './Alert';

const meta = {
  title: 'Feedback/Alert',
  component: Alert,
  tags: ['autodocs'],
  args: { tone: 'info', title: 'Aviso', children: 'Mensagem de exemplo do alerta.' },
  argTypes: { tone: { control: 'select', options: ['info', 'success', 'warning', 'danger', 'neutral'] } },
} satisfies Meta<typeof Alert>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Info: Story = {};

export const Todos: Story = {
  render: () => (
    <div className="flex w-96 flex-col gap-2">
      <Alert tone="info" title="Informação">Canal de e-mail configurado.</Alert>
      <Alert tone="success" title="Sucesso">Campanha criada com sucesso.</Alert>
      <Alert tone="warning" title="Atenção">Limite diário quase atingido.</Alert>
      <Alert tone="danger" title="Erro">Falha ao enviar a mensagem.</Alert>
    </div>
  ),
};
