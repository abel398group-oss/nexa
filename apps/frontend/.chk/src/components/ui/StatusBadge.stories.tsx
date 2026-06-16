import type { Meta, StoryObj } from '@storybook/react';
import { StatusBadge } from './StatusBadge';

const meta = {
  title: 'Feedback/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
  args: { children: 'Status', tone: 'neutral' },
  argTypes: {
    tone: {
      control: 'select',
      options: ['neutral', 'info', 'success', 'warning', 'danger', 'primary'],
    },
    variant: { control: 'select', options: ['soft', 'outlined', 'pill'] },
    size: { control: 'select', options: ['xs', 'sm', 'md'] },
  },
} satisfies Meta<typeof StatusBadge>;
export default meta;

type Story = StoryObj<typeof meta>;

const TONES = ['neutral', 'info', 'success', 'warning', 'danger', 'primary'] as const;

export const Padrao: Story = {};

export const Tons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {TONES.map((t) => (
        <StatusBadge key={t} tone={t} dot>
          {t}
        </StatusBadge>
      ))}
    </div>
  ),
};

export const Outlined: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {TONES.map((t) => (
        <StatusBadge key={t} tone={t} variant="outlined">
          {t}
        </StatusBadge>
      ))}
    </div>
  ),
};
