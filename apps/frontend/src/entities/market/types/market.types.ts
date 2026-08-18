// Mercado (ADR 037). No backend é a linha de `products` — "mercado" é o nome na tela.

export interface MarketPendencia {
  campo: 'identidade' | 'conhecimento' | 'modelos' | 'vendedores';
  motivo: string;
  /** false = aviso; não impede liberar. */
  bloqueia: boolean;
}

/// Vendedor no contexto de um mercado (`seller_markets`). `role` distingue quem
/// trabalha de quem lidera; hoje só `seller` é usado na prática.
export interface MarketSeller {
  id: string;
  name: string;
  email: string | null;
  role?: string;
  /** Data em que volta, se estiver afastado. */
  awayUntil?: string | null;
  /** Calculado no backend — a tela não recalcula a regra. */
  ausente?: boolean;
}

export interface MarketSellers {
  vinculados: MarketSeller[];
  disponiveis: MarketSeller[];
}

/** O que o servidor contou para decidir — o que EXISTE, não só o que falta. */
export interface MarketCounts {
  conhecimentoUtil: number;
  conhecimentoSemFonte: number;
  modelos: number;
  vendedores: number;
  temIdentidade: boolean;
}

export interface MarketReadiness {
  pronto: boolean;
  pendencias: MarketPendencia[];
  counts: MarketCounts;
}

export interface Market {
  id: string;
  code: string;
  name: string;
  /** draft = em montagem · active = liberado · paused = suspenso */
  status: string;
  displayName: string | null;
  brandColor: string | null;
  brandTagline: string | null;
  signupUrl: string | null;
  senderName: string | null;
  releasedAt: string | null;
  /** Ausente na listagem do vendedor (`?liberados=true`). */
  readiness?: MarketReadiness;
}
