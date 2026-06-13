import { useEffect, useState } from 'react';

export interface DemoFrame {
  caption: string;          // legenda do passo
  mock: 'click' | 'type' | 'list' | 'toggle' | 'card'; // tipo de ilustração
  label?: string;           // texto do botão/elemento em foco
  result?: string;          // resultado mostrado
}

// Mini-demo animada (loop) — simula a ação na tela, tipo um GIF.
export function HelpDemo({ frames }: { frames: DemoFrame[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % frames.length), 2200);
    return () => clearInterval(t);
  }, [frames.length]);
  const f = frames[i];

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-base-200 bg-base-100">
      {/* chrome de "janelinha" */}
      <div className="flex items-center gap-1.5 border-b border-base-200 bg-white px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-2 text-[10px] text-base-content/40">demonstração</span>
      </div>

      {/* palco */}
      <div className="relative flex h-36 items-center justify-center p-4">
        <div key={i} className="demo-fade flex w-full flex-col items-center gap-2">
          {f.mock === 'click' && (
            <div className="relative">
              <div className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow">{f.label}</div>
              <span className="demo-cursor absolute -bottom-2 -right-2 h-3 w-3 rounded-full border-2 border-white bg-brand-700 shadow" />
            </div>
          )}
          {f.mock === 'toggle' && (
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white">IA ON</div>
              <span className="text-base-content/40">→</span>
              <div className="rounded-md border border-base-300 bg-white px-3 py-1.5 text-xs">IA OFF</div>
            </div>
          )}
          {f.mock === 'type' && (
            <div className="w-full max-w-xs rounded-lg border border-base-300 bg-white px-3 py-2 text-sm text-base-content/80">
              <span>{f.label}</span><span className="demo-caret">|</span>
            </div>
          )}
          {f.mock === 'list' && (
            <div className="w-full max-w-xs space-y-1.5">
              {[0, 1, 2].map((n) => (
                <div key={n} className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${n === 1 ? 'border-brand-400 bg-brand-50' : 'border-base-200 bg-white'}`}>
                  <span className="h-2 w-2 rounded-full bg-brand-500" /> {f.label} {n + 1}
                </div>
              ))}
            </div>
          )}
          {f.mock === 'card' && (
            <div className="flex gap-2">
              {[f.label, f.result].filter(Boolean).map((t, n) => (
                <div key={n} className="rounded-lg border border-base-200 bg-white px-4 py-3 text-center shadow-sm">
                  <div className="text-lg font-bold text-base-content">{t}</div>
                </div>
              ))}
            </div>
          )}
          {f.result && f.mock !== 'card' && (
            <div className="demo-pop rounded-lg bg-white px-3 py-1.5 text-xs text-base-content/80 shadow-sm">{f.result}</div>
          )}
        </div>
      </div>

      {/* legenda + progresso */}
      <div className="border-t border-base-200 bg-white px-3 py-2">
        <div className="text-xs font-medium text-base-content">{f.caption}</div>
        <div className="mt-1.5 flex gap-1">
          {frames.map((_, n) => (
            <span key={n} className={`h-1 flex-1 rounded-full ${n === i ? 'bg-brand-600' : 'bg-base-200'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
