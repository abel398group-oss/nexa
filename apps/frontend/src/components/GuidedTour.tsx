import { useEffect, useState, useCallback } from 'react';

export interface TourStep { selector: string; title: string; text: string; }

// Tour guiado leve: destaca o elemento + mostra um cartão. Sem dependências.
export function GuidedTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [idx, setIdx] = useState(0);

  // resolve os passos cujos elementos existem na tela
  const resolved = steps.filter((s) => document.querySelector(s.selector));
  const step = resolved[idx];

  const highlight = useCallback((sel: string | null) => {
    document.querySelectorAll('.tour-highlight').forEach((el) => el.classList.remove('tour-highlight'));
    if (sel) {
      const el = document.querySelector(sel);
      el?.classList.add('tour-highlight');
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (!step) { finish(); return; }
    highlight(step.selector);
    return () => highlight(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, step?.selector]);

  function finish() {
    highlight(null);
    onClose();
  }

  if (!step) return null;
  const last = idx === resolved.length - 1;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50" onClick={finish}>
      {/* cartão do tour (rodapé central) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-8 left-1/2 w-[22rem] -translate-x-1/2 rounded-xl bg-white p-5 shadow-xl"
      >
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-600">
          Tour · {idx + 1}/{resolved.length}
        </div>
        <h3 className="mb-1 text-base font-bold text-base-content">{step.title}</h3>
        <p className="mb-4 text-sm text-base-content/75">{step.text}</p>
        <div className="flex items-center justify-between">
          <button onClick={finish} className="text-xs text-base-content/50 hover:text-base-content">Pular</button>
          <div className="flex gap-2">
            {idx > 0 && (
              <button onClick={() => setIdx(idx - 1)} className="rounded-md border border-base-300 px-3 py-1.5 text-xs font-medium hover:bg-base-100">
                Anterior
              </button>
            )}
            <button
              onClick={() => (last ? finish() : setIdx(idx + 1))}
              className="rounded-md bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              {last ? 'Concluir 🎉' : 'Próximo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
