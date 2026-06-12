import { Link } from 'react-router-dom';

/**
 * LandingPage — página pública inicial do Nexa (apresenta o produto).
 * Espelha o padrão da landing do HiperTMS: hero escuro com glows de marca,
 * headline, CTAs e um card de exemplo com brilho laranja. Rota: `/`.
 */

const WHATSAPP_URL =
  'https://wa.me/5512997880659?text=Ol%C3%A1%2C%20quero%20saber%20mais%20sobre%20o%20Nexa';

// Ícones inline (outline) — nexa não usa lucide.
const Spark = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </svg>
);
const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const Chat = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-4A8.4 8.4 0 1 1 21 11.5Z" />
  </svg>
);

const FEATURES = [
  { title: 'Qualificação 24h', desc: 'A Lia classifica intenção e dá um lead score em tempo real.' },
  { title: 'Respostas com IA + RAG', desc: 'Contexto da sua base de conhecimento em cada resposta.' },
  { title: 'Handoff instantâneo', desc: 'Lead quente cai direto no vendedor certo, em segundos.' },
  { title: 'Supervisor de qualidade', desc: 'Cada mensagem revisada antes de chegar ao cliente.' },
];

export function LandingPage() {
  return (
    <div className="min-h-app overflow-y-auto bg-base-100">
      {/* ===== Navbar ===== */}
      <header className="sticky top-0 z-20 border-b border-base-300/70 bg-base-100/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-10">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">N</span>
            <span className="text-lg font-bold tracking-tight text-base-content">Nexa</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 sm:inline-flex dark:text-emerald-400"
            >
              <Chat /> Falar com a Lia
            </a>
            <Link
              to="/login"
              className="inline-flex items-center rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              Entrar
            </Link>
          </div>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden border-b border-base-300/60 px-4 pb-20 pt-12 sm:px-6 lg:px-10">
        {/* fundo escuro + glows de marca (igual ao TMS) */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0e0f13] via-[#16181d] to-[#23262e]" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              'radial-gradient(closest-side at 18% 18%, rgba(255,90,31,0.18), transparent 60%), radial-gradient(closest-side at 78% 24%, rgba(255,138,92,0.12), transparent 62%), radial-gradient(closest-side at 50% 92%, rgba(30,58,95,0.22), transparent 60%)',
          }}
        />

        <div className="relative mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-x-16">
            {/* coluna texto */}
            <div className="text-center lg:max-w-xl lg:text-left">
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/75 backdrop-blur-sm lg:mx-0">
                <span className="text-[#FF8A5C]"><Spark /></span>
                A sua equipe de vendas que nunca dorme
              </div>

              <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.1rem]">
                Atenda, qualifique e venda no WhatsApp — 24 horas, com IA.
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.75] text-white/70 sm:text-[17px] lg:mx-0">
                A Lia conversa com seus leads no WhatsApp e no e-mail, classifica a intenção em
                tempo real e entrega os quentes direto para o seu time — enquanto vendas, suporte e
                follow-up acontecem no mesmo lugar.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-white shadow-md shadow-brand-500/20 transition-all hover:bg-brand-600 hover:shadow-lg active:scale-[0.99]"
                >
                  Entrar na plataforma <Arrow />
                </Link>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-6 py-3 text-base font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
                >
                  <Chat /> Falar com a Lia
                </a>
              </div>

              {/* mini-cards de features */}
              <div className="mt-9 grid gap-3 sm:grid-cols-2">
                {FEATURES.map((f) => (
                  <div
                    key={f.title}
                    className="flex items-start gap-3 rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 backdrop-blur-sm"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-[#FF8A5C]">
                      <Spark />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{f.title}</p>
                      <p className="text-xs leading-relaxed text-white/65">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* coluna card de exemplo (conversa) */}
            <div className="relative mx-auto w-full max-w-md lg:mx-0 lg:max-w-none lg:justify-self-end">
              <div className="relative transition-transform duration-500 ease-out lg:-mr-4 lg:rotate-[5deg] lg:hover:rotate-[2deg]">
                <div
                  className="pointer-events-none absolute -inset-8 z-0 scale-[1.08] rounded-[2.25rem] blur-3xl"
                  aria-hidden
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(255,90,31,0.30), rgba(255,122,71,0.16) 45%, rgba(30,58,95,0.30))',
                  }}
                />
                <div className="relative rounded-3xl border-2 border-brand-500/70 bg-[#16181d] p-5 shadow-elevated">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">Conversa · WhatsApp</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Lia online
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white/[0.08] px-3 py-2 text-sm text-white/85">
                      Oi, quanto custa o plano pra 3 vendedores?
                    </div>
                    <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-500/90 px-3 py-2 text-sm text-white">
                      Oi! Pra 3 vendedores fica no plano Time. Posso já te mostrar uma simulação e
                      agendar com um consultor agora?
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
                    <div className="flex items-center gap-2 text-white/55">
                      <span className="rounded-md bg-white/[0.06] px-2 py-1 font-medium text-white/80">
                        Intenção: pricing
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white/45">Lead score</span>
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-semibold text-emerald-300">
                        87
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand-500/10 px-3 py-2 text-xs font-medium text-[#FF8A5C]">
                    <Arrow /> Handoff: enviado para o vendedor João
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Faixa "o que você ganha" ===== */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-10">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
          O que você ganha
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-center text-2xl font-bold text-base-content sm:text-3xl">
          Menos lead perdido, mais venda fechada — no piloto automático.
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15">
                <Spark />
              </span>
              <p className="mt-3 text-sm font-semibold text-base-content">{f.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-base-content/60">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-center gap-3 rounded-3xl bg-signature px-6 py-12 text-center">
          <h3 className="text-2xl font-bold text-white">Pronto para colocar a Lia pra vender?</h3>
          <p className="max-w-md text-sm text-white/80">
            Entre na plataforma e acompanhe seus atendimentos em tempo real.
          </p>
          <Link
            to="/login"
            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-semibold text-[#16181d] transition-transform hover:scale-[1.02]"
          >
            Entrar na plataforma <Arrow />
          </Link>
        </div>
      </section>

      {/* ===== Rodapé ===== */}
      <footer className="border-t border-base-300/60 px-4 py-8 sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-xs text-base-content/45 sm:flex-row">
          <span>© 2026 Nexa · Plataforma de IA Comercial e Suporte</span>
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Acessar a plataforma →
          </Link>
        </div>
      </footer>
    </div>
  );
}
