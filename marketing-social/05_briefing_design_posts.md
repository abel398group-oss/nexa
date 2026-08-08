# HiperTMS — Briefing de Design dos Posts

Especificações para montar as peças no design (Figma/Canva). Cada peça tem o texto exato, a hierarquia e as cores. Os arquivos `*.png` desta pasta servem como **referência visual** — este documento é a fonte da verdade do conteúdo.

---

## 0. Especificações gerais (tokens)

**Formatos**

| Peça | Dimensão | Obs. |
|---|---|---|
| Post / card de feed | 1080 × 1080 px | quadrado |
| Carrossel (cada tela) | 1080 × 1080 px | exportar 1 arquivo por tela |
| Story / Reels capa | 1080 × 1920 px | usar mesma linguagem, texto centralizado |
| Foto de perfil | 1080 × 1080 px | seguro para corte circular |
| Capa do Facebook | 1702 × 630 px | conteúdo no centro (perfil cobre canto inferior esquerdo) |

**Cores**

| Nome | Hex | Uso |
|---|---|---|
| Laranja (primária) | `#FF5A1F` | destaque, CTA, "TMS", palavra-chave |
| Laranja claro | `#FF6A33` | variação sobre fundo escuro |
| Grafite (secundária) | `#16181D` | fundo escuro, texto sobre claro, "Hiper" |
| Off-white | `#FAFAF9` | texto sobre grafite |
| Creme (fundo claro) | `#FFF3ED` | fundo das peças claras |
| Cinza texto | `#3A3D44` | corpo sobre fundo claro |
| Cinza mudo | `#C9CCD1` / `#8A8F98` | corpo/legenda sobre fundo escuro |
| Painel escuro | `#23262E` | chips/cards sobre grafite |

**Tipografia**

- **Logo (wordmark):** fonte **Baloo 2**. "Hiper" peso 600 (SemiBold), "TMS" peso 800 (ExtraBold). É o único lugar que usa Baloo 2.
- **Títulos e corpo:** sans-serif neutro (Inter, Helvetica ou similar), como no site. **Não** usar Baloo 2 nos títulos.
- **Pesos:** títulos em bold (700); corpo em regular (400); rótulos/badges em bold.

**Logo — regra de ouro**

- O logo é **só o wordmark de texto "HiperTMS"** — "Hiper" grafite + "TMS" laranja. **Sem símbolo.**
- **Não** usar o "H" geométrico antigo (postes + travessa). Ele foi aposentado.
- O **monograma "H"** (letra H laranja em Baloo 2, sobre quadrado grafite arredondado) é usado **só** na foto de perfil e em espaços muito apertados.

**Grid e margens**

- Margem de segurança: ~70 px em todos os lados (1080 px).
- Fundo escuro (grafite) para peças de marca/oferta; fundo claro (creme) para peças educativas/técnicas — alterne para dar ritmo ao feed.
- Logo no topo: wordmark pequeno (~altura 40–52 px de "corpo"), alinhado à esquerda (posts) ou centralizado (hero/marca).

---

## 1. Foto de perfil

- **Fundo:** creme `#FFF3ED`.
- **Elemento único:** quadrado grafite `#16181D` arredondado (raio ~28% do lado), centralizado, ocupando ~78% do quadro; margem de creme em volta para não cortar no círculo.
- **Dentro do quadrado:** letra **"H"** em Baloo 2 ExtraBold, cor laranja `#FF5A1F`, centralizada.
- **Referência:** `01_foto_perfil.png`.

---

## 2. Capa do Facebook (1702 × 630)

- **Fundo:** grafite `#16181D`.
- **Conteúdo centralizado** (deixe o canto inferior esquerdo livre — a foto de perfil sobrepõe):
  1. Wordmark **HiperTMS** (Hiper off-white + TMS laranja), centralizado no topo do bloco.
  2. Título: **"O TMS feito para vender frete"** — off-white, bold.
  3. Subtítulo: **"Cadastrou, cotou em 5 minutos."** — laranja claro `#FF6A33`, bold.
  4. Filete laranja curto (~300 px) abaixo, centralizado.
- **Referência:** `02_capa_facebook.png`.

---

## 3. Hero — punchline principal (1080²)

- **Fundo:** grafite.
- **Elementos (de cima para baixo, centralizados):**
  1. Wordmark **HiperTMS** (topo).
  2. Badge contornado laranja: **"O PUNCHLINE"** (texto laranja, borda laranja, pílula vazada).
  3. Título grande em duas linhas: **"O TMS feito para"** (off-white) / **"vender frete"** (laranja).
  4. Subtítulo em duas linhas, cinza mudo: **"O primeiro sistema feito para o transportador VENDER — não só emitir CT-e."**
  5. Botão (pílula laranja, texto grafite): **"Cote em segundos"**.
  6. Rodapé discreto, cinza: **"hipertms.com.br"**.
- **Referência:** `hero_cotacoes.png`.

---

## 4. Card — Força 1 · Cotação (1080²)

- **Fundo:** creme `#FFF3ED`.
- **Elementos (alinhados à esquerda, margem 70 px):**
  1. Wordmark **HiperTMS** no topo.
  2. Badge vazado laranja: **"FORÇA 1 · COTAÇÃO"**.
  3. Título em três linhas: **"Todo o Brasil"** (grafite) / **"precificado"** (grafite) / **"em 5 minutos"** (laranja).
  4. Corpo (cinza `#3A3D44`): "+5.500 municípios já vêm com tabela pronta, criada pelo nosso time de precificação. Qualquer cidade para qualquer cidade — e você ajusta preço ou desconto em segundos."
  5. Botão pílula laranja, texto branco: **"Calcule grátis"**.
- **Referência:** `forca1_cotacao.png`.

---

## 5. Card — Força 2 · Frota (pneus e combustível) (1080²)

- **Fundo:** grafite.
- **Elementos (esquerda):**
  1. Wordmark **HiperTMS** (versão off-white/laranja) no topo.
  2. Badge vazado laranja: **"FORÇA 2 · FROTA"**.
  3. Título em duas linhas: **"Pneus e combustível"** (off-white) / **"sob controle"** (laranja).
  4. Corpo (cinza mudo): "Você lança o abastecimento. O HiperTMS cuida do resto: programação de pneus, lubrificantes e manutenção, de forma automática."
  5. Três chips (retângulos arredondados painel `#23262E`, texto off-white): **"Ordens de abastecimento"**, **"Programação de pneus"**, **"Alertas automáticos"**.
- **Referência:** `forca2_pneus-combustivel.png`.

---

## 6. Card — Força 3 · Financeiro (1080²)

- **Fundo:** creme.
- **Elementos (esquerda):**
  1. Wordmark **HiperTMS** no topo.
  2. Badge vazado laranja: **"FORÇA 3 · FINANCEIRO"**.
  3. Título em duas linhas: **"Gestão financeira"** (grafite) / **"no automático"** (laranja).
  4. Corpo (cinza): "Informe a média de faturamento e geramos todo o plano de contas e o planejamento financeiro — com base em mais de 30 anos de gestão de transportadora."
  5. Botão pílula grafite, texto off-white: **"Planejamento em minutos"**.
  6. Fecho em laranja, bold: **"Menos digitação. Mais decisão."**
- **Referência:** `forca3_financeiro.png`.

---

## 7. Posts do plano da página

Legendas completas (para o campo de texto do post) estão em `01_pagina_facebook_instagram.md`. Aqui vai o **conteúdo visível na arte**.

### Post 1 — Boas-vindas (fundo grafite)

- Wordmark **HiperTMS** centralizado no topo.
- Título: **"O TMS feito para"** (off-white) / **"vender frete"** (laranja).
- Subtítulo (cinza mudo): "Cadastrou, cotou. Comece a vender frete em 5 minutos."
- Botão laranja: **"Siga a página"**.
- Rodapé: **"hipertms.com.br"**.
- **Referência:** `post1_boas-vindas.png`.

### Post 2 — A dor da planilha (fundo grafite)

- Wordmark no topo (esquerda).
- Título centralizado: **"Cotou devagar,"** (off-white) / **"perdeu a carga."** (laranja).
- Corpo (cinza mudo): "O cliente fecha com quem responde primeiro. No HiperTMS, a cotação sai em segundos — com imposto, custo e margem, item a item."
- Botão laranja: **"Cote em segundos"**.
- **Referência:** `post2_dor-da-planilha.png`.

### Post 5 — Calculadora ANTT (fundo creme)

- Wordmark no topo (esquerda).
- Título em três linhas: **"Você sabe o piso"** (grafite) / **"mínimo ANTT"** (grafite) / **"da sua rota?"** (laranja).
- Corpo (cinza): "Simule o piso ANTT e o custo real estimado — com impostos, pedágio e margem, cidade a cidade."
- Botão laranja, texto branco: **"Calcule grátis"**.
- Rodapé cinza: "Calculadora aberta · link na bio".
- **Referência:** `post5_calculadora.png`.

### Post 8 — Planos e preço (fundo grafite)

- Wordmark no topo.
- Título centralizado: **"Preço de PME,"** (off-white) / **"sem taxa de implantação"** (laranja claro).
- Três faixas de plano (retângulos arredondados), nome à esquerda e preço à direita:
  - **Básico** — R$ 89 /mês (faixa painel escuro).
  - **Essencial** — R$ 299 /mês · mais escolhido (faixa **laranja**, texto grafite — plano destacado).
  - **Profissional** — R$ 599 /mês (faixa painel escuro).
- **Referência:** `post8_planos.png`.

---

## 8. Carrossel do eixo (6 telas, 1080² cada)

Sequência do lançamento. Todas com wordmark **HiperTMS** no topo à esquerda e contador **"n/6"** no rodapé direito. Alterna fundo grafite/creme para dar ritmo.

| Tela | Fundo | Texto (destaque em laranja) | Extra |
|---|---|---|---|
| 1 | Grafite | "A maioria dos sistemas para transportadora só **emite documento fiscal**." (última linha em cinza) | "Deslize →" em laranja |
| 2 | Grafite | "O HiperTMS é o primeiro feito para **VENDER frete**." | — |
| 3 | Creme | "Montar tabela de preço trava a PME: cidade por cidade, região por região." | corpo em cinza |
| 4 | Grafite | "No HiperTMS, **+5.500 municípios já vêm precificados**." | linha de apoio: "Qualquer cidade para qualquer cidade." |
| 5 | Grafite | "Não é só software. **É uma comunidade de especialistas por você**." | apoio: "Precificação, frota e financeiro: tarefas terceirizadas via sistema." |
| 6 | **Laranja** | "Em 5 minutos, todo o Brasil precificado." (última linha off-white) | monograma "H" no topo + botão grafite **"Criar conta grátis"** + "hipertms.com.br · link na bio" |

- **Referência:** `carrossel_1.png` … `carrossel_6.png`.

---

## 9. Checklist de exportação

- [ ] Formatos corretos (1080² para feed/carrossel; 1080×1920 para stories; 1702×630 para capa FB).
- [ ] Logo sempre **texto** (sem símbolo antigo); monograma "H" só no perfil.
- [ ] "TMS" e a palavra-chave de cada título em laranja `#FF5A1F`.
- [ ] Contraste: texto off-white sobre grafite; grafite/cinza sobre creme.
- [ ] Margem de segurança de ~70 px; nada essencial nas bordas.
- [ ] Exportar carrossel como arquivos numerados na ordem 1→6.
