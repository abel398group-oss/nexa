import type { Meta, StoryObj } from '@storybook/react';
import { Icon, type IconName } from './icons';

const NAMES: IconName[] = [
  'dashboard', 'inbox', 'support', 'contacts', 'knowledge', 'sellers', 'campaigns', 'playbook',
  'users', 'mail', 'search', 'sun', 'moon', 'bell', 'dots', 'power', 'chevronLeft', 'chevronRight',
  'chevronDown', 'help', 'bot', 'plus', 'edit', 'trash', 'upload', 'download', 'play', 'pause',
  'refresh', 'undo', 'calendar', 'filter', 'send', 'check', 'close', 'building', 'eye', 'reply',
  'trophy', 'zap', 'dollar', 'ban', 'mute', 'alert', 'archive', 'pulse',
];

const meta = {
  title: 'Primitivos/Icons',
  component: Icon,
  tags: ['autodocs'],
} satisfies Meta<typeof Icon>;
export default meta;

type Story = StoryObj<typeof meta>;

// Galeria com todos os ícones de linha do design system.
export const Galeria: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-8">
      {NAMES.map((name) => (
        <div key={name} className="flex flex-col items-center gap-1 rounded-lg border border-base-200 p-3 text-center">
          <Icon name={name} className="h-6 w-6 text-base-content" />
          <span className="text-[10px] text-base-content/50">{name}</span>
        </div>
      ))}
    </div>
  ),
};
