import type { Meta, StoryObj } from '@storybook/react';
import { Select } from './Select';

const meta = {
  title: 'Primitivos/Select',
  component: Select,
  tags: ['autodocs'],
  render: (args) => (
    <Select {...args} className="max-w-xs">
      <option value="">Selecione…</option>
      <option value="whatsapp">WhatsApp</option>
      <option value="email">E-mail</option>
      <option value="portal">Portal</option>
    </Select>
  ),
} satisfies Meta<typeof Select>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Padrao: Story = {};
export const Desabilitado: Story = { args: { disabled: true } };
