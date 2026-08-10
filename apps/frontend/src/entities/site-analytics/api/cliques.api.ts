// Quem clicou no link da campanha (ADR: campaign-link.ts).
// Rota separada da visão geral de propósito: aquela é contagem anônima, esta é
// pessoa identificada.
import { api } from '@/shared/lib/api';

export interface CliqueDeLead {
  nome: string | null;
  email: string | null;
  telefone: string | null;
  /** Slug da campanha que trouxe (utm_campaign). */
  campanha: string | null;
  /** Página onde caiu. */
  pagina: string;
  quando: string;
  /** Quantas vezes essa pessoa voltou ao site. */
  visitas: number;
}

export async function listCliques(params: { dias?: number; campanha?: string } = {}): Promise<CliqueDeLead[]> {
  const r = await api.get('/analytics/site/cliques', {
    params: {
      dias: params.dias ? String(params.dias) : undefined,
      campanha: params.campanha || undefined,
    },
  });
  return r.data;
}
