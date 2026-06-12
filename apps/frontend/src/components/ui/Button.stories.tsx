import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta = {
  title: 'Primitivos/Button',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Botão' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'outline', 'ghost', 'destructive', 'secondary', 'success', 'link'],
    },
    size: { control: 'select', options: ['sm', 'md', 'lg', 'icon'] },
  },
} satisfies Meta<typeof Button>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Variantes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary">Primary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="success">Success</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

export const Tamanhos: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="ícone">★</Button>
    </div>
  ),
};

export const Loading: Story = { args: { loading: true, children: 'Salvando…' } };
export const Desabilitado: Story = { args: { disabled: true } };
