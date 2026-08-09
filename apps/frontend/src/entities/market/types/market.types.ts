// Mercado (ADR 037). No backend é a linha de `products` — "mercado" é o nome na tela.

export interface MarketPendencia {
  campo: 'identidade' | 'conhecimento' | 'modelos' | 'vendedores';
  motivo: string;
  /** false = aviso; não impede liberar. */
  bloqueia: boolean;
}

export interface MarketReadiness {
  pronto: boolean;
  pendencias: MarketPendencia[];
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
