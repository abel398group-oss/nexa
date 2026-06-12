import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './Input';

const meta = {
  title: 'Primitivos/Input',
  component: Input,
  tags: ['autodocs'],
  args: { placeholder: 'Digite algo…' },
} satisfies Meta<typeof Input>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Padrao: Story = {};
export const Desabilitado: Story = { args: { disabled: true, value: 'Somente leitura' } };
export const Largura: Story = {
  render: () => (
    <div className="w-72">
      <Input placeholder="100% da largura do container" />
    </div>
  ),
};
