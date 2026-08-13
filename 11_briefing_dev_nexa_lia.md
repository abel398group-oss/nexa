# HiperTMS — Briefing para o desenvolvedor da Lia (Nexa)

**Resumo do reposicionamento comercial de agosto/2026 e o que muda no comportamento da Lia**
_Commits de referência: `9cfb59df` (repricing) · `d51edbf2` (inteligência de precificação) · `a60eab0f` (kit SDR) · fonte da verdade: `marketing-social/00_posicionamento.md`_

---

## 1. O que mudou (contexto em 1 minuto)

O HiperTMS abandonou a estratégia de entrada barata self-service. O plano Básico de R$ 89 foi extinto — geraria mais clientes do que o suporte comporta, e o lead qualificado já paga R$ 850–1.500/mês em TMS. O produto foi reposicionado pelo valor:

- **Nova grade:** Básico **R$ 599/mês** (R$ 5.990/ano) + Corporativo sob consulta. `essencial` e `profissional` foram **desativados para novas vendas** (`isActive: false` — assinaturas existentes intactas). Já aplicado em produção via `apply-plan-repricing-2026-08.sql`.
- **Preço não aparece em nenhum canal público** (site, social, anúncio, disparo). O valor é apresentado por um especialista humano, junto da proposta de implantação.
- **"Sem implantação / 5 minutos / conta grátis" saiu do vocabulário.** A implantação agora é **conduzida pelo time interno** e é parte do valor vendido (e remunera o time de vendas).
- **O `/signup` self-service acabou.** A página virou captação de lead ("Fale com um especialista") que abre o WhatsApp da Lia com mensagem estruturada. A conta é criada pelo time interno após a venda. O endpoint `POST /auth/signup` continua existindo, mas só para uso interno.
- **Objetivo do funil: demonstração agendada** (não mais "conta criada"). Autônomo/agregado (1–3 veículos) saiu do ICP.
- **Pilar novo de comunicação: "inteligência de precificação"** — nosso time acompanha as métricas do mercado (custos, insumos, pedágio, piso ANTT) e elabora/mantém as tabelas dentro do sistema. É o nome público da camada service-as-a-software. Categoria interna do produto: *um sistema de precificação e cotação de frete que embute as demais funcionalidades de um TMS*.

## 2. O que muda no comportamento da Lia

A árvore completa e atualizada está em `marketing-social/07_scripts_lia_prospeccao.md`. Os pontos que exigem mudança de implementação:

### 2.1. Preço — a mudança mais importante

- A Lia **NÃO informa preço** em prospecção nem em atendimento a lead — **nem "a partir de"**. Qualquer valor antigo em prompt/knowledge base (R$ 89, R$ 299, R$ 599 público) deve ser removido.
- Pergunta de preço = **lead quente**: a Lia qualifica (nº de veículos, sistema atual, rotas) e **escala para especialista humano** com o resumo da conversa.
- Se o lead insistir muito, resposta de contorno sem número: *"Fica na faixa do que transportadoras já investem num TMS completo — e a diferença é que aqui a precificação vem pronta. O especialista te passa o valor exato junto do escopo, sem enrolação."*

### 2.2. CTA e fluxo

- CTA final de toda conversa: **agendar demonstração com especialista** (dia/hora concretos), nunca "crie sua conta" ou link de cadastro.
- A isca continua a mesma: **cotar uma rota real do lead na conversa** (print da cotação). Depois da cotação → oferecer demonstração.
- Fluxo pós-positivação: rota cotada → demo agendada → lembrete D-1 → no-show ganha 1 reagendamento único. Lead esfriado: 1 retomada única e vai para nutrição.
- Novos gatilhos de escalação para humano: pergunta de preço/proposta, frota > 20 veículos, pedido de demonstração, 2 mensagens sem resposta adequada. Sempre transferir com resumo (nome, empresa, frota, rotas, sistema atual).

### 2.3. Vocabulário

- **Usar:** "inteligência de precificação", "tabela viva / mantida pelo nosso time", "contratos que entendem cada cliente", "implantação conduzida por especialistas", "Todo o Brasil precificado, desde o primeiro dia".
- **Nunca usar:** "sem implantação", "sem taxa de implantação", "5 minutos", "conta grátis", "crie sua conta", "R$ 89" (ou qualquer valor), "service as a software" (jargão interno), "consultoria".
- Respostas novas de FAQ (ver doc 07, seção 4): "De onde vêm esses preços?" e **"E quando o diesel/pedágio/piso muda?"** → é a inteligência de precificação: o time acompanha as métricas e mantém a tabela viva; a margem e as regras continuam do cliente. Nunca prometer reajuste automático do contrato do cliente — a inteligência alimenta a **tabela**; o contrato de cada cliente é soberano.
- Autônomo/agregado (1 caminhão): atender bem, indicar a calculadora pública gratuita, **não empurrar venda** e marcar segmento B na base (nutrição).

### 2.4. Novo canal de entrada: leads do site

A página `hipertms.com.br/signup` agora abre `wa.me/5512997880659` com mensagem estruturada:

```
Olá! Quero falar com um especialista do HiperTMS.
Nome: <nome>
Transportadora: <empresa>
Telefone: <fone>
Email: <email>
```

A Lia deve **reconhecer esse formato** como lead quente vindo do site: saudar pelo nome, confirmar os dados, fazer 1–2 perguntas de qualificação (frota, sistema atual) e ir direto para oferta de cotação de rota + agendamento de demonstração. A seção de contato da landing e os anúncios Meta (click-to-WhatsApp) também desembocam nesse número.

## 3. Impactos técnicos no Nexa (verificar)

- **Sincronização de planos:** o backend sincroniza plano/limites com o Nexa (`nexa-plan-sync.service.ts`, chamado no signup e nas trocas de plano). A grade mudou: `basic` agora tem os limites do antigo Essencial — **3 números de WhatsApp inclusos** (antes 1), 5 usuários, 5 empresas. `essencial`/`profissional` não entram em novas vendas. Conferir se algum mapeamento de tier/limite no lado Nexa assume os valores antigos.
- **Volume:** campanha de ~30.000 leads frios via WhatsApp está planejada (`06_plano_leads_email_whatsapp.md`): ramp-up de 200–400 msgs/dia, template aprovado na API oficial para o 1º toque, opt-out obrigatório ("SAIR"), e **número de prospecção separado do número de atendimento** dos clientes atuais.
- **Métricas novas a expor:** taxa de positivação, rota cotada na conversa, **demonstrações agendadas** (novo KPI do funil, substitui "contas criadas"), comparecimento/no-show, escalações por motivo.

## 4. Documentos de referência (pasta `marketing-social/`)

| Doc | O que é |
|---|---|
| `00_posicionamento.md` | **Fonte da verdade**: categoria, pilares, política comercial, vocabulário |
| `07_scripts_lia_prospeccao.md` | Árvore de conversa completa da Lia (atualizada) |
| `06_plano_leads_email_whatsapp.md` | Campanha dos 30k leads (cadência, canais, riscos) |
| `08_roteiros_video_cotacao.md` | Vídeos que a Lia pode enviar (só a positivados) |
| `10_battle_card_objecoes.md` | Objeções e respostas (base ótima para o prompt da Lia) |
| `meta/Instrucoes para a Agencia...docx` | Social/ads — de onde virão leads de clique no WhatsApp |

**Resumo do resumo:** a Lia deixou de ser vendedora de conta de R$ 89 e virou **qualificadora premium**: cota rota real, nunca fala preço, e o sucesso dela é demonstração agendada com especialista.
