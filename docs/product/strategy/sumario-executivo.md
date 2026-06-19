# Sumário Executivo — Nexa

> Estratégia do produto, tese de mercado e fases de crescimento.
> Referência: `product/strategy/sumario-executivo.md` do HiperTMS.
> Data: 2026-06-19

## Tese

Transportadoras que usam o HiperTMS precisam vender mais contratos e dar suporte
sem escalar o time proporcionalmente. O Nexa resolve isso com uma IA (Lia) que
opera no WhatsApp — o canal onde o cliente transportador já está — e aprende com
a base de conhecimento real do produto.

**Diferencial vs bots genéricos**: a Lia conhece profundamente o HiperTMS
(CT-e, MDF-e, precificação, planos) e o perfil real do cliente (via conector TMS).
Não é um bot de FAQ — é uma especialista no produto.

## Mercado

- **Alvo imediato**: clientes e prospects do HiperTMS (transportadoras BR)
- **TAM ampliado**: qualquer SaaS B2B que vende e suporta via WhatsApp
- **Modelo**: plataforma multi-tenant com planos por capacidade de uso

## Fases de crescimento

### Fase 1 — Validação (atual → 10 tenants)
- Objetivo: provar que a Lia reduz tempo de atendimento e qualifica leads
- Produto: plataforma funcionando em produção com 1 conector (HiperTMS)
- Revenue: early adopters — sem cobrança ou pricing experimental
- Métrica North Star: **% de conversas resolvidas pela Lia sem intervenção humana**

### Fase 2 — Tração (10–50 tenants)
- Objetivo: modelo de cobrança rodando; churn < 5%/mês
- Produto: analytics, motor proativo, canal e-mail, segundo conector
- Revenue: planos mensais por volume de conversas / tenants
- Métrica: **MRR** + **NPS** dos operadores

### Fase 3 — Escala (50–200 tenants)
- Objetivo: crescimento previsível; time de vendas alimentado pela própria Lia
- Produto: marketplace de conectores, embeddings/pgvector, multi-idioma
- Revenue: modelo de plataforma (take-rate por conector)
- Métrica: **GRR** (Gross Revenue Retention) > 95%

## Modelo de monetização (rascunho)

| Plano | Foco | Conversas/mês | Tenants-alvo |
|---|---|---|---|
| **Starter** | Validar | até 500 | 1–2 usuários, 1 número WA |
| **Growth** | Crescer | até 2.000 | equipe de 5, 2 números WA |
| **Scale** | Operar | até 10.000 | equipe ilimitada, múltiplos WA |
| **Enterprise** | Custom | ilimitado | SLA, conectores custom |

Ancoras de pricing: volume de conversas (input principal), número de usuários
(expansão), conectores adicionais (upsell).

## Métricas North Star por fase

| Fase | North Star | Meta |
|---|---|---|
| 1 (Validação) | % conversas resolvidas pela Lia sem intervenção | > 60% |
| 2 (Tração) | MRR | R$ 10k/mês |
| 3 (Escala) | GRR | > 95% |

## Riscos

| Risco | Mitigação |
|---|---|
| Ban de números WhatsApp pelo Meta | Anti-ban robusto (WAHA, limites, opt-out, NOWEB engine) |
| Alucinação da Lia danificando relacionamento | Kill switch, Supervisor IA, KB aprovada |
| Dependência de 1 conector (HiperTMS) | Arquitetura plugável desde o início (ADR 010) |
| Custo de IA crescendo com volume | Tracking por tenant + limiares + cache de KB |

## Relacionados

- `docs/product/vision.md` · `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/adr/009-leads-como-plataforma.md` · `docs/adr/010-connector-architecture.md`
- `docs/ANALISE_HIPERTMS_GAPS.md` §6
