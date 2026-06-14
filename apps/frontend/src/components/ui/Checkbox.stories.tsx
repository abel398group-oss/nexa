import type { Meta, StoryObj } from '@storybook/react';
import { Checkbox } from './Checkbox';

const meta = {
  title: 'Primitivos/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
} satisfies Meta<typeof Checkbox>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Padrao: Story = { args: { defaultChecked: true } };

export const ComLabel: Story = {
  render: () => (
    <label className="inline-flex items-center gap-2 text-sm text-base-content">
      <Checkbox defaultChecked /> Receber notificações
    </label>
  ),
};

export const Desabilitado: Story = { args: { disabled: true, defaultChecked: true } };
