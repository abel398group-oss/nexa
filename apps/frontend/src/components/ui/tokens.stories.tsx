import type { Meta, StoryObj } from '@storybook/react';

// Vitrine de tokens — cores da marca, superfícies e sombras.
const meta: Meta = {
  title: 'Design System/Tokens',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

function Swatch({ className, name }: { className: string; name: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className={`h-14 w-full rounded-lg border border-base-300 ${className}`} />
      <span className="text-xs text-base-content/70">{name}</span>
    </div>
  );
}

// Classes literais (Tailwind não detecta `bg-brand-${n}` montado dinamicamente).
const BRAND: { name: string; className: string }[] = [
  { name: 'brand-50', className: 'bg-brand-50' },
  { name: 'brand-100', className: 'bg-brand-100' },
  { name: 'brand-200', className: 'bg-brand-200' },
  { name: 'brand-300', className: 'bg-brand-300' },
  { name: 'brand-400', className: 'bg-brand-400' },
  { name: 'brand-500', className: 'bg-brand-500' },
  { name: 'brand-600', className: 'bg-brand-600' },
  { name: 'brand-700', className: 'bg-brand-700' },
  { name: 'brand-800', className: 'bg-brand-800' },
  { name: 'brand-900', className: 'bg-brand-900' },
];

export const Cores: Story = {
  render: () => (
    <div className="space-y-6 bg-base-100 p-8 text-base-content">
      <div>
        <h3 className="mb-3 text-sm font-semibold">Marca — Laranja-Ignição (brand-*)</h3>
        <div className="grid grid-cols-5 gap-3 md:grid-cols-10">
          {BRAND.map((b) => (
            <Swatch key={b.name} name={b.name} className={b.className} />
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-3 text-sm font-semibold">Superfícies (base-*)</h3>
        <div className="grid grid-cols-4 gap-3">
          <Swatch name="base-100" className="bg-base-100" />
          <Swatch name="base-200" className="bg-base-200" />
          <Swatch name="base-300" className="bg-base-300" />
          <Swatch name="surface (var)" className="bg-[var(--surface)]" />
        </div>
      </div>
    </div>
  ),
};

export const Sombras: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-6 bg-base-100 p-8 md:grid-cols-3">
      {['shadow-card', 'shadow-card-hover', 'shadow-elevated', 'shadow-glow-brand'].map((s) => (
        <div key={s} className="flex flex-col items-center gap-2">
          <div className={`h-20 w-full rounded-xl bg-[var(--surface)] ${s}`} />
          <span className="text-xs text-base-content/70">{s}</span>
        </div>
      ))}
    </div>
  ),
};
