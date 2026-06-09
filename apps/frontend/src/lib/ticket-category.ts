/**
 * ticket-category.ts
 * Labels e cores para categorias e prioridades de tickets de suporte (ADR 016).
 */

export type TicketCategory =
  | 'fiscal'
  | 'cte'
  | 'mdfe'
  | 'frete'
  | 'financeiro'
  | 'cadastro'
  | 'usuarios'
  | 'integracoes'
  | 'api'
  | 'erro_sistema'
  | 'treinamento';

export type TicketPriority = 'critical' | 'high' | 'medium' | 'low';

export interface CategoryConfig {
  label: string;
  emoji: string;
  color: string; // tailwind bg
  textColor: string; // tailwind text
}

export const CATEGORY_CONFIG: Record<TicketCategory, CategoryConfig> = {
  fiscal:       { label: 'Fiscal',       emoji: '⚖️',  color: 'bg-purple-100', textColor: 'text-purple-800' },
  cte:          { label: 'CT-e',         emoji: '📄',  color: 'bg-blue-100',   textColor: 'text-blue-800' },
  mdfe:         { label: 'MDF-e',        emoji: '🗂️', color: 'bg-indigo-100', textColor: 'text-indigo-800' },
  frete:        { label: 'Frete',        emoji: '🚚',  color: 'bg-cyan-100',   textColor: 'text-cyan-800' },
  financeiro:   { label: 'Financeiro',   emoji: '💰',  color: 'bg-yellow-100', textColor: 'text-yellow-800' },
  cadastro:     { label: 'Cadastro',     emoji: '👤',  color: 'bg-gray-100',   textColor: 'text-gray-700' },
  usuarios:     { label: 'Usuários',     emoji: '🔐',  color: 'bg-slate-100',  textColor: 'text-slate-700' },
  integracoes:  { label: 'Integrações',  emoji: '🔗',  color: 'bg-teal-100',   textColor: 'text-teal-800' },
  api:          { label: 'API',          emoji: '⚙️',  color: 'bg-lime-100',   textColor: 'text-lime-800' },
  erro_sistema: { label: 'Erro sistema', emoji: '🐛',  color: 'bg-red-100',    textColor: 'text-red-800' },
  treinamento:  { label: 'Treinamento',  emoji: '📚',  color: 'bg-green-100',  textColor: 'text-green-800' },
};

export interface PriorityConfig {
  label: string;
  emoji: string;
  color: string;
  textColor: string;
  ringColor: string;
}

export const PRIORITY_CONFIG: Record<TicketPriority, PriorityConfig> = {
  critical: { label: 'Crítica', emoji: '🚨', color: 'bg-red-600',    textColor: 'text-white',      ringColor: 'ring-red-600' },
  high:     { label: 'Alta',    emoji: '🔴', color: 'bg-orange-100', textColor: 'text-orange-800', ringColor: 'ring-orange-400' },
  medium:   { label: 'Média',   emoji: '🟡', color: 'bg-yellow-100', textColor: 'text-yellow-800', ringColor: 'ring-yellow-400' },
  low:      { label: 'Baixa',   emoji: '🟢', color: 'bg-green-100',  textColor: 'text-green-800',  ringColor: 'ring-green-400' },
};

export function getCategoryConfig(cat?: string | null): CategoryConfig | null {
  if (!cat) return null;
  return CATEGORY_CONFIG[cat as TicketCategory] ?? null;
}

export function getPriorityConfig(pri?: string | null): PriorityConfig | null {
  if (!pri) return null;
  return PRIORITY_CONFIG[pri as TicketPriority] ?? null;
}
