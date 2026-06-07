import { useEffect, useMemo, useRef, useState } from 'react';

export interface Command {
  id: string;
  label: string;
  hint?: string; // texto à direita (ex.: "Ir para", "Ação")
  icon?: string;
  keywords?: string; // termos extras p/ busca
  run: () => void;
}

// Command palette (Ctrl+K) — busca rápida de telas e ações (inspirado no TMS).
export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return commands;
    return commands.filter((c) => norm(`${c.label} ${c.keywords ?? ''} ${c.hint ?? ''}`).includes(q));
  }, [query, commands]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') return onClose();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[active];
      if (cmd) {
        onClose();
        cmd.run();
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]" onKeyDown={onKey}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-[560px] max-w-[92vw] overflow-hidden rounded-xl border border-base-200 bg-white shadow-elevated dark:bg-sidebar">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar tela ou ação…"
          className="w-full border-b border-base-200 bg-transparent px-4 py-3.5 text-sm text-base-content outline-none placeholder:text-base-content/40"
        />
        <div className="max-h-[50vh] overflow-auto py-1.5">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-base-content/50">Nada encontrado</div>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                onClose();
                c.run();
              }}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                i === active ? 'bg-brand-600 text-white' : 'text-base-content hover:bg-base-100'
              }`}
            >
              <span className="text-base">{c.icon ?? '›'}</span>
              <span className="flex-1 truncate">{c.label}</span>
              {c.hint && (
                <span className={`text-[10px] ${i === active ? 'text-white/70' : 'text-base-content/40'}`}>
                  {c.hint}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-base-200 px-4 py-2 text-[10px] text-base-content/40">
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span>esc fechar</span>
        </div>
      </div>
    </div>
  );
}
