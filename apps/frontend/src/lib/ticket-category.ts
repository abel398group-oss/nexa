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
  color: string; // tailwind bg
  textColor: string; // tailwind text
}

export const CATEGORY_CONFIG: Record<TicketCategory, CategoryConfig> = {
  fiscal:       { label: 'Fiscal',       color: 'bg-purple-100', textColor: 'text-purple-800' },
  cte:          { label: 'CT-e',         color: 'bg-blue-100',   textColor: 'text-blue-800' },
  mdfe:         { label: 'MDF-e',        color: 'bg-indigo-100', textColor: 'text-indigo-800' },
  frete:        { label: 'Frete',        color: 'bg-cyan-100',   textColor: 'text-cyan-800' },
  financeiro:   { label: 'Financeiro',   color: 'bg-yellow-100', textColor: 'text-yellow-800' },
  cadastro:     { label: 'Cadastro',     color: 'bg-gray-100',   textColor: 'text-gray-700' },
  usuarios:     { label: 'Usuários',     color: 'bg-slate-100',  textColor: 'text-slate-700' },
  integracoes:  { label: 'Integrações',  color: 'bg-teal-100',   textColor: 'text-teal-800' },
  api:          { label: 'API',          color: 'bg-lime-100',   textColor: 'text-lime-800' },
  erro_sistema: { label: 'Erro sistema', color: 'bg-red-100',    textColor: 'text-red-800' },
  treinamento:  { label: 'Treinamento',  color: 'bg-green-100',  textColor: 'text-green-800' },
};

export interface PriorityConfig {
  label: string;
  color: string;
  textColor: string;
  ringColor: string;
}

export const PRIORITY_CONFIG: Record<TicketPriority, PriorityConfig> = {
  critical: { label: 'Crítica', color: 'bg-red-600',    textColor: 'text-white',      ringColor: 'ring-red-600' },
  high:     { label: 'Alta',    color: 'bg-orange-100', textColor: 'text-orange-800', ringColor: 'ring-orange-400' },
  medium:   { label: 'Média',   color: 'bg-yellow-100', textColor: 'text-yellow-800', ringColor: 'ring-yellow-400' },
  low:      { label: 'Baixa',   color: 'bg-green-100',  textColor: 'text-green-800',  ringColor: 'ring-green-400' },
};

export function getCategoryConfig(cat?: string | null): CategoryConfig | null {
  if (!cat) return null;
  return CATEGORY_CONFIG[cat as TicketCategory] ?? null;
}

export function getPriorityConfig(pri?: string | null): PriorityConfig | null {
  if (!pri) return null;
  return PRIORITY_CONFIG[pri as TicketPriority] ?? null;
}
