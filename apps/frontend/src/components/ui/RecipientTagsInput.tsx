/**
 * RecipientTagsInput — multiple-contact field with removable tags.
 *
 * ≤ 2 contacts: inline tags + input (press Enter or click Add).
 * ≥ 3 contacts: collapses to "N contatos configurados — clique para ver",
 *               expanding a vertical list with × per item.
 * Cap: configurable (default 10).
 * Validation:
 *   whatsapp → digits only with DDI (≥ 12 chars, e.g. 5511999999999)
 *   email    → standard format
 *   duplicate → rejected with inline feedback
 */
import { useState, useRef, KeyboardEvent } from 'react';
import { cn } from '@/shared/lib/cn';
import { cleanText } from '@/shared/lib/sanitize';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Recipient {
  label?: string;
  contact: string;
  channel: 'whatsapp' | 'email';
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Number of items above which the list collapses. */
const COLLAPSE_AT = 3;
const DEFAULT_MAX = 10;

// ─── Validation ──────────────────────────────────────────────────────────────

function validateContact(
  raw: string,
  channel: 'whatsapp' | 'email',
  existing: Recipient[],
): string | null {
  const contact = cleanText(raw);
  if (!contact) return null;
  if (existing.some((r) => r.contact === contact)) return 'Já adicionado.';
  if (channel === 'whatsapp') {
    if (!/^\d{12,}$/.test(contact))
      return 'Telefone inválido — use DDI + DDD + número (ex: 5511999999999).';
  } else {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return 'E-mail inválido.';
  }
  return null;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Tag({
  contact,
  onRemove,
}: {
  contact: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-600">
      {contact}
      <button
        type="button"
        aria-label={`Remover ${contact}`}
        onClick={onRemove}
        className="text-brand-400 hover:text-error transition-colors leading-none"
      >
        ×
      </button>
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RecipientTagsInputProps {
  value: Recipient[];
  onChange: (items: Recipient[]) => void;
  channel: 'whatsapp' | 'email';
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Maximum number of recipients. Default 10. */
  max?: number;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RecipientTagsInput({
  value,
  onChange,
  channel,
  label,
  placeholder,
  disabled = false,
  max = DEFAULT_MAX,
  className,
}: RecipientTagsInputProps) {
  const [inputVal, setInputVal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const atCap = value.length >= max;
  const isCollapsed = value.length >= COLLAPSE_AT;

  const defaultPlaceholder =
    placeholder ??
    (channel === 'whatsapp' ? '+ 5511999999999' : '+ email@empresa.com');

  function addContact() {
    const contact = cleanText(inputVal);
    if (!contact) return;
    const err = validateContact(contact, channel, value);
    if (err) {
      setError(err);
      return;
    }
    onChange([...value, { contact, channel }]);
    setInputVal('');
    setError(null);
  }

  function removeAt(idx: number) {
    const next = value.filter((_, i) => i !== idx);
    onChange(next);
    // auto-collapse when dropping below threshold
    if (next.length < COLLAPSE_AT) setExpanded(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addContact();
    }
    if (e.key === 'Escape') {
      setInputVal('');
      setError(null);
    }
  }

  const sharedInputClass = cn(
    'h-9 rounded-md border border-base-300 bg-white px-3 text-sm text-base-content shadow-sm outline-none transition-colors',
    'placeholder:text-base-content/40 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/30',
    disabled && 'pointer-events-none opacity-50',
  );

  return (
    <div className={cn('space-y-1.5', className)}>
      {/* Label */}
      {label && (
        <p className="text-xs font-medium text-base-content/60">{label}</p>
      )}

      {/* ── Inline mode: 0–2 contacts ─────────────────────────────────────── */}
      {!isCollapsed && (
        // Clickable wrapper focuses the hidden input
        <div
          role="group"
          aria-label={label ?? 'contatos'}
          onClick={() => !disabled && inputRef.current?.focus()}
          className={cn(
            'flex flex-wrap gap-1.5 min-h-[36px] w-full cursor-text rounded-md border border-base-300 bg-white px-2 py-1.5 shadow-sm transition-colors',
            'focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-500/30',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          {value.map((r, i) => (
            <Tag key={r.contact} contact={r.contact} onRemove={() => removeAt(i)} />
          ))}
          {!atCap && (
            <input
              ref={inputRef}
              type={channel === 'email' ? 'email' : 'text'}
              inputMode={channel === 'whatsapp' ? 'numeric' : 'email'}
              value={inputVal}
              onChange={(e) => {
                setInputVal(e.target.value);
                setError(null);
              }}
              onKeyDown={onKeyDown}
              placeholder={value.length === 0 ? defaultPlaceholder : '+ adicionar...'}
              disabled={disabled}
              className="min-w-[140px] flex-1 bg-transparent text-sm text-base-content outline-none placeholder:text-base-content/40"
              aria-label={`Adicionar ${channel === 'whatsapp' ? 'telefone' : 'e-mail'}`}
            />
          )}
        </div>
      )}

      {/* ── Collapsed mode: ≥ 3 contacts ──────────────────────────────────── */}
      {isCollapsed && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          disabled={disabled}
          aria-expanded={expanded}
          className={cn(
            'w-full flex items-center justify-between rounded-md border border-base-300 bg-white px-3 py-2 shadow-sm',
            'hover:bg-base-50 transition-colors text-left',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          <span className="text-xs text-base-content/70">
            <span className="font-semibold text-base-content">{value.length}</span>{' '}
            contato{value.length !== 1 ? 's' : ''} configurado{value.length !== 1 ? 's' : ''} — clique
            para {expanded ? 'ocultar' : 'ver'}
          </span>
          <span
            className={cn(
              'text-base-content/40 text-[10px] transition-transform duration-200',
              expanded && 'rotate-180',
            )}
            aria-hidden
          >
            ▼
          </span>
        </button>
      )}

      {/* ── Expanded list ─────────────────────────────────────────────────── */}
      {isCollapsed && expanded && (
        <div
          className="overflow-hidden rounded-md border border-base-200 bg-white divide-y divide-base-100"
          aria-label="Lista de contatos"
        >
          {value.map((r, i) => (
            <div key={r.contact} className="flex items-center justify-between px-3 py-2">
              <span className="font-mono text-xs text-base-content/80 truncate">{r.contact}</span>
              <button
                type="button"
                aria-label={`Remover ${r.contact}`}
                onClick={() => removeAt(i)}
                disabled={disabled}
                className="ml-3 shrink-0 text-base text-base-content/30 hover:text-error transition-colors leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Add row (below list, when collapsed and not at cap) ───────────── */}
      {isCollapsed && !atCap && (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type={channel === 'email' ? 'email' : 'text'}
            inputMode={channel === 'whatsapp' ? 'numeric' : 'email'}
            value={inputVal}
            onChange={(e) => {
              setInputVal(e.target.value);
              setError(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={defaultPlaceholder}
            disabled={disabled}
            className={cn(sharedInputClass, 'flex-1')}
            aria-label={`Adicionar ${channel === 'whatsapp' ? 'telefone' : 'e-mail'}`}
          />
          <button
            type="button"
            onClick={addContact}
            disabled={disabled || !inputVal.trim()}
            className={cn(
              'h-9 shrink-0 rounded-md border border-base-300 bg-white px-3 text-xs font-medium text-base-content/70 shadow-sm',
              'hover:border-brand-500 hover:text-brand-600 transition-colors',
              'disabled:pointer-events-none disabled:opacity-40',
            )}
          >
            + Adicionar
          </button>
        </div>
      )}

      {/* ── Cap message ───────────────────────────────────────────────────── */}
      {atCap && (
        <p className="text-xs text-base-content/50">
          Máximo de {max} contato{max !== 1 ? 's' : ''} atingido.
        </p>
      )}

      {/* ── Validation error ──────────────────────────────────────────────── */}
      {error && (
        <p className="text-xs text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
