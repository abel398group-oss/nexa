# Fix — Sidebar sobrepondo o conteúdo (Inbox/Suporte)

> **Para o squad de front.** Bug de layout: a barra lateral, ao expandir no hover,
> flutua por cima do conteúdo e esconde informação — visível principalmente no
> Inbox (cobre a lista de conversas).
>
> Data: 2026-06 · Severidade: média (UX/usabilidade) · Área: `apps/frontend`

---

## 1. Sintoma

Ao passar o mouse na barra lateral, ela expande e **cobre** a lista de conversas
do Inbox (os chips de tag dos contatos ficam "espiando" atrás da sidebar). O
conteúdo coberto fica ilegível e não clicável enquanto a sidebar está expandida.

```
ANTES (bug):  hover expande a sidebar POR CIMA do conteúdo
┌──────────────┬───────────────── main ─────────────────┐
│ SIDEBAR 240px│██ (cobre a lista do Inbox) ██           │
│ (fixed, hover)│   ↑ lista de conversas atrás           │
└──────────────┴────────────────────────────────────────┘
 conteúdo só reserva 64px (pl-16) → os 176px extras invadem a lista
```

---

## 2. Causa raiz

Arquivo `apps/frontend/src/components/Layout.tsx`:

- **Linha ~249** — a sidebar é fixa e expande no hover, mas sobrepõe (não empurra):
  ```tsx
  <aside className="group/sb fixed inset-y-0 left-0 z-30 flex w-16 ... transition-[width] hover:w-60 ...">
  ```
- **Linha ~298** — o conteúdo reserva apenas a largura do rail recolhido (64px), fixo:
  ```tsx
  <div className="flex h-full min-w-0 flex-col pl-16">
  ```

Como a sidebar é `fixed` e o `pl-16` não muda quando ela vira `w-60`, a faixa de
64px→240px fica **por cima** do conteúdo. O impacto é pior em páginas que já têm
uma coluna esquerda colada ao rail — `InboxPage.tsx` (linha ~174, `<aside className="... w-80 ...">`, 320px) e `SupportPage.tsx`.

---

## 3. Solução recomendada — sidebar com "fixar" (pin) que empurra o conteúdo

Trocar o *expandir-no-hover-por-cima* por um **toggle explícito** (fixar/recolher)
que **empurra** o conteúdo. Sem sobreposição, sem layout-shift no hover.

1. **Estado persistido** do menu (recolhido x expandido):
   ```tsx
   const [navOpen, setNavOpen] = useState(
     () => localStorage.getItem('nexa_nav_open') === '1'
   );
   function toggleNav() {
     setNavOpen((o) => { localStorage.setItem('nexa_nav_open', o ? '0' : '1'); return !o; });
   }
   ```
2. **Largura da sidebar segue o estado** (remover o `hover:w-60`):
   ```tsx
   <aside className={`fixed inset-y-0 left-0 z-30 flex flex-col ... transition-[width] duration-200
     ${navOpen ? 'w-60' : 'w-16'}`}>
   ```
   As labels/grupos/rodapé passam a aparecer por `navOpen` (não por `group-hover/sb`).
3. **Conteúdo acompanha a largura** (offset dinâmico, no lugar do `pl-16` fixo):
   ```tsx
   <div className={`flex h-full min-w-0 flex-col transition-[padding] duration-200
     ${navOpen ? 'pl-60' : 'pl-16'}`}>
   ```
4. **Botão de toggle** — no topo do rail ou na topbar (esq. do título). Usar os
   ícones que já existem (`icons.tsx`, nomes em **camelCase**):
   ```tsx
   <button onClick={toggleNav} title={navOpen ? 'Recolher menu' : 'Expandir menu'} ...>
     <Icon name={navOpen ? 'chevronLeft' : 'chevronRight'} className="h-5 w-5" />
   </button>
   ```
   (Não há ícone `menu`/hambúrguer no set atual — usar `chevronRight`/`chevronLeft`
   ou adicionar um `menu` em `icons.tsx`.)
5. **Recolhido**: mostrar só ícones + `title`/tooltip (já existe `title={it.label}`).

Resultado: ao expandir, o conteúdo reflui ao lado da sidebar — **nada é coberto**,
inclusive a lista de conversas do Inbox.

> Mobile (`< md`): a sidebar deve virar overlay com **scrim** (fundo escurecido)
> e fechar ao clicar fora — aí sim overlay é aceitável, porque é modal.

---

## 4. Alternativa rápida (menor esforço, se não der pra fazer o pin agora)

Manter o rail **sempre recolhido** (64px) e desativar o expandir-no-hover:

- Remover `hover:w-60 hover:shadow-elevated` do `<aside>`.
- Trocar as revelações `group-hover/sb:*` por tooltips nos itens (o `title` já existe).

Zero sobreposição na hora, com mudança mínima. Perde a expansão com labels — por
isso é paliativo; a solução da §3 é a definitiva.

> **Não recomendado:** manter o hover-expand como overlay "melhorado" (sombra/scrim).
> Mesmo com sombra, ele continua cobrindo a lista do Inbox/Suporte — não resolve.

---

## 5. Critérios de aceite (Definition of Done)

- [ ] Com a sidebar expandida, **nenhum** conteúdo é coberto em nenhuma rota
      (testar com foco em **/inbox** e **/support**, que têm coluna esquerda própria).
- [ ] Expandir/recolher **empurra** o conteúdo (não sobrepõe) e a transição é suave.
- [ ] Estado (expandido/recolhido) **persiste** entre navegações e reloads.
- [ ] Recolhido: ícones com tooltip; item ativo destacado (manter o realce atual).
- [ ] Sem layout-shift acidental ao passar o mouse (o hover não deve mais mexer na largura).
- [ ] Mobile: sidebar como overlay com scrim e fechar-ao-clicar-fora.
- [ ] Tema claro e escuro OK; foco/teclado no botão de toggle (acessibilidade).
- [ ] Sem regressão no `GuidedTour` (o seletor `aside nav` continua válido).

---

## 6. Arquivos envolvidos

- `apps/frontend/src/components/Layout.tsx` — sidebar (`<aside>` ~L249) e offset do
  conteúdo (`pl-16` ~L298). **Mudança principal aqui.**
- `apps/frontend/src/pages/InboxPage.tsx` / `SupportPage.tsx` — só **validar** que a
  coluna esquerda (`aside w-80`) fica 100% visível; não devem precisar de mudança.
- `apps/frontend/src/components/ui/icons.tsx` — já tem `chevronLeft`/`chevronRight`
  (camelCase). Adicionar um `menu` só se quiserem o ícone de hambúrguer.
- Tokens/transições: `tailwind.config.*` (`ease-layout` já existe).

---

## 7. Referências

- `docs/architecture/frontend-architecture.md` (design system, dark mode via `html.dark`)
- ADR 014 — Design System · Storybook (`pnpm storybook`) para validar o componente.
