---
type: guidelines
tags: [design-system, brand, logo, voz]
updated: 2026-07-07
---

# Guidelines — Marca Nexa

---

## Identidade

**Nexa** é a plataforma de IA comercial e suporte B2B da Hipervias. O produto
integra ao HiperTMS e usa a mesma linguagem visual do ecossistema, mas tem
identidade própria como produto de relacionamento com cliente.

---

## Voz e tom

**Princípio:** direto ao resultado. Não vende features, vende tempo ganho.

| Certo | Errado |
|---|---|
| *"Lia atende enquanto você foca no que importa"* | *"Nossa IA avançada utiliza NLP para..."* |
| *"Conectou o WhatsApp, está funcionando"* | *"Onboarding simplificado para máxima eficiência"* |
| *"3 leads qualificados hoje"* | *"Módulo de qualificação de leads ativo"* |

**Tom por contexto:**

| Contexto | Tom |
|---|---|
| Onboarding | Acolhedor, encorajador, passo a passo |
| Atendimento / Inbox | Funcional, sem distrações |
| Erros | Claro sobre o problema, direto na solução |
| Marketing | Confiante, resultado-first, sem hipérbole |

---

## Logo e símbolo

- **Wordmark:** "Nexa" em Inter Semibold, azul-elétrico `#0B5FFF`
- **Símbolo:** (a definir pela equipe de design) — usar temporariamente o
  wordmark completo em contextos que precisam de ícone
- **Fundo claro:** logo em `#0B5FFF`
- **Fundo escuro (sidebar):** logo em `#FFFFFF` ou `#6DA3FF`

> **Trocado em 11/08/2026.** Era laranja-ignição `#FF5A1F`, herdado do HiperTMS.
> Saiu por dois motivos: fazia vizinhança com o âmbar de "aviso" na interface, e
> o TMS segue laranja — o Nexa passa a ter identidade própria.
>
> Duas regras que a cor nova traz junto:
> - O azul da marca é **mais fundo e mais saturado** que o azul-céu dos chips de
>   informação ("Lido", "Entregue"). Clarear o `brand-500` apaga essa distinção e
>   marca vira informação.
> - Em fundo escuro, use o tom **300** (`#6DA3FF`), nunca o 500/600 — o 600 sobre
>   card escuro dá 2,7:1, abaixo do mínimo legível. O `index.css` já faz essa
>   troca sozinho via `html.dark`.

**Não fazer:**
- Não deformar proporções
- Não usar em fundos que reduzem contraste
- Não adicionar sombras ao logo
- Não usar em cinza

---

## Personalidade da marca

| Atributo | Como aparece na UI |
|---|---|
| **Prático** | Ações claras, sem menus desnecessários |
| **Confiável** | Status sempre visível (WhatsApp conectado/desconectado) |
| **Proativo** | Notifica antes de o problema acontecer |
| **Humano** | Handoff fácil, histórico preservado, sem frieza robótica |

---

## Linguagem (pt-BR)

- Sentence case nos títulos e botões: *"Nova campanha"*, não *"NOVA CAMPANHA"*
- Nunca jargão técnico na UI voltada ao usuário final
- IDs técnicos em mono: `CONV-2024-0042`, `TICKET-127`
- Moeda: `R$ 1.290,00` (pt-BR, não inglês)
