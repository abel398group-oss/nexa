import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Switch } from './Switch';

const meta = {
  title: 'Primitivos/Switch',
  component: Switch,
  tags: ['autodocs'],
} satisfies Meta<typeof Switch>;
export default meta;

type Story = StoryObj<typeof meta>;

// Switch é controlado → story usa estado local.
export const Interativo: Story = {
  render: () => {
    const [on, setOn] = useState(false);
    return (
      <label className="inline-flex items-center gap-2 text-sm text-base-content">
        <Switch checked={on} onCheckedChange={setOn} />
        IA autônoma {on ? 'ligada' : 'desligada'}
      </label>
    );
  },
};

export const Desabilitado: Story = {
  render: () => <Switch checked disabled onCheckedChange={() => {}} />,
};
