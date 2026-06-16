// Página de catálogo do design system — disponível APENAS em modo desenvolvimento.
// Acesse em /dev/tokens. Não é exposta em builds de produção (vite tree-shakes
// a rota pois o import é condicional em App.tsx).
// Ver ADR 014 — seção 7 "Alternativa adotada: Página /dev/tokens".

const SURFACES = [
  { token: '--surface-muted',    label: 'surface-muted',    desc: 'Background body / página' },
  { token: '--surface',          label: 'surface',           desc: 'Cards, painéis (.card)' },
  { token: '--surface-elevated', label: 'surface-elevated',  desc: 'Modais, dropdowns' },
  { token: '--surface-input',    label: 'surface-input',     desc: 'Inputs, textareas (.input)' },
];

const TEXTS = [
  { token: '--text-primary',   label: 'text-primary',   desc: 'Títulos, labels' },
  { token: '--text-secondary', label: 'text-secondary', desc: 'Subtítulos, metadados' },
  { token: '--text-muted',     label: 'text-muted',     desc: 'Placeholders, disabled' },
];

const BORDERS = [
  { token: '--border',       label: 'border',       desc: 'Cards, divisores' },
  { token: '--border-input', label: 'border-input', desc: 'Inputs, formulários' },
];

const ACCENTS = [
  { token: '--accent-brand', label: 'accent-brand', desc: 'Laranja primário — CTAs' },
  { token: '--accent-amber', label: 'accent-amber', desc: 'Alertas, custo' },
  { token: '--accent-red',   label: 'accent-red',   desc: 'Erros, exclusão, opt-out' },
  { token: '--accent-green', label: 'accent-green', desc: 'Sucesso, status ativo' },
];

const SHADOWS = [
  '--shadow-card', '--shadow-card-hover', '--shadow-elevated',
  '--shadow-inner-soft', '--shadow-up', '--shadow-glow-brand',
];

function Swatch({ token, label, desc }: { token: string; label: string; desc: string }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <div
        className="h-10 w-10 shrink-0 rounded-lg border border-base-200"
        style={{ background: `var(${token})` }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs font-semibold text-base-content">{token}</p>
        <p className="text-[11px] text-base-content/50">{desc}</p>
      </div>
      <span className="font-mono text-[10px] text-base-content/40">{label}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-base-content/40">{title}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export function DevTokensPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-2 p-8">
      {/* cabeçalho */}
      <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        <strong>Ambiente de desenvolvimento</strong> — Esta página não é exposta em produção.
        Use o toggle de tema (barra lateral) para testar dark/light mode.
      </div>

      <h1 className="mb-6 text-2xl font-bold text-base-content">Design System · Tokens &amp; Átomos</h1>

      {/* ── TOKENS ── */}
      <Section title="Superfícies">
        {SURFACES.map((s) => <Swatch key={s.token} {...s} />)}
      </Section>

      <Section title="Texto">
        {TEXTS.map((s) => <Swatch key={s.token} {...s} />)}
      </Section>

      <Section title="Bordas">
        {BORDERS.map((s) => <Swatch key={s.token} {...s} />)}
      </Section>

      <Section title="Accent / Brand">
        {ACCENTS.map((s) => <Swatch key={s.token} {...s} />)}
      </Section>

      {/* Sombras */}
      <section className="mb-10">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-base-content/40">Sombras</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SHADOWS.map((t) => (
            <div key={t} className="flex flex-col items-center gap-2 rounded-xl border border-base-200 bg-base-100 p-5">
              <div
                className="h-12 w-full rounded-lg"
                style={{ background: 'var(--surface)', boxShadow: `var(${t})` }}
              />
              <span className="font-mono text-[10px] text-base-content/50">{t}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── ÁTOMOS ── */}
      <section className="mb-10">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-base-content/40">Átomos — Botões</h2>
        <div className="card flex flex-wrap items-center gap-4 p-6">
          <button className="btn-primary">btn-primary</button>
          <button className="btn-outline">btn-outline</button>
          <button className="btn-ghost">btn-ghost</button>
          <button className="btn-primary" disabled>btn-primary disabled</button>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-base-content/40">Átomos — Card</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card p-5">
            <p className="text-sm font-semibold text-base-content">Card padrão</p>
            <p className="mt-1 text-xs text-base-content/50">.card p-5</p>
          </div>
          <div className="card p-5">
            <p className="text-sm font-semibold text-base-content">Card hover</p>
            <p className="mt-1 text-xs text-base-content/50">Passe o mouse para ver sombra</p>
          </div>
          <div className="card p-5">
            <p className="text-sm font-semibold text-base-content">Card com badge</p>
            <span className="badge mt-2">badge</span>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-base-content/40">Átomos — Input</h2>
        <div className="card flex max-w-sm flex-col gap-3 p-6">
          <input className="input w-full" placeholder="Placeholder…" />
          <input className="input w-full" placeholder="Desabilitado" disabled />
          <textarea className="input w-full resize-none" rows={3} placeholder="Textarea…" />
        </div>
      </section>
    </div>
  );
}
