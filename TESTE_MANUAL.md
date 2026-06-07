# Roteiro de Teste Manual — Nexa (Lia / HiperTMS)

> **Atualizado.** Estado atual: **n8n desligado**, **WAHA conectado** apontando só pro Nexa,
> **autonomia da IA LIGADA por padrão** (a Lia já responde sozinha — não precisa mais ligar a cada restart).
> Número conectado (onde os leads mandam mensagem): **+55 12 99788-0659**
> Login admin: `admin@nexa.local` / `admin123` — http://localhost:5173

---

## 🆕 O que mudou desde a última versão
- ✅ **A Lia agora VENDE com método** (playbook): saudação → descoberta → qualificação (BANT-lite) → proposta → objeções → CTA → handoff.
- ✅ **CTA muda conforme o lead esquenta** (frio → explora; morno → demo; quente → pede e-mail/encaminha).
- ✅ **Base de conhecimento enriquecida** (12 temas reais do HiperTMS: frota, motoristas, fiscal, precificação, financeiro, etc.).
- ✅ **Nunca mais fica em silêncio** — se não puder responder com segurança, dá um aceno que mantém a conversa.
- ✅ **Tela "Playbook IA"** pra editar objeções/tom/CTA sem código.
- ✅ **Visual**: menu lateral retrátil (botão « Recolher), busca rápida **Ctrl+K**, telas com carregamento "esqueleto" (skeleton) e telas vazias bonitas.

---

## A melhor forma de testar

### 🟢 Frente 1 — RESPOSTA da IA (inbound) — *teste principal*
A autonomia já está **LIGADA**. Do **seu celular**, mande mensagem para **+55 12 99788-0659** e acompanhe no **Inbox**.

**Roteiro de jornada (mande em sequência, como um lead real):**

| O que mandar | O que DEVE acontecer |
|---|---|
| "oi" | Lia cumprimenta e pergunta o motivo do contato |
| "tenho problema pra emitir CT-e" | Explica como o HiperTMS resolve (fiscal/SEFAZ) |
| "como funciona o controle de motorista?" | Responde fundo (CNH, vencimento, diárias) |
| "quantos caminhões / 800 docs por mês" | Qualifica e **recomenda o plano certo** |
| "tá caro" | Rebate com **ROI** amarrado ao volume dele |
| "quero contratar / sou eu que decido" | CTA forte: pede e-mail e encaminha pro especialista |
| "SAIR" | Opt-out: descadastra e para de responder (LGPD) |

✅ Confira depois: **Inbox** (a conversa aparece), **Painel** (métricas), e o **botão IA** no topo (liga/desliga a resposta automática a qualquer momento).

### 🔵 Frente 2 — DISPARO (outbound) — campanha em massa
1. **Contatos → Importar** o `contatos_teste.csv` (já tem seus 2 números — seguro).
2. **Disparo → Nova campanha**: mensagem (modelo já vem pronto), opcional PDF + link (use **https://www.hipertms.com.br**), define quantos enviar.
3. **Iniciar** → você recebe no WhatsApp. **Responda** → cai na Frente 1 (a Lia conversa de volta).

> 🛡️ Proteções: horário 7h-19h, delay 30-90s entre envios, limite diário (aquecimento), rodapé "Responda SAIR".

---

## 🎯 Testar o Playbook IA (editar a Lia sem código)
1. Menu **Playbook IA**.
2. Edite uma **objeção** (ex.: mude a resposta de "tá caro") e clique **Salvar**.
3. No WhatsApp, mande "tá caro" → a Lia responde com o **texto novo**. (Botão "Restaurar padrão" volta de fábrica.)

## 🖥️ Testar o visual novo
- **Recolher menu**: botão « no rodapé do menu lateral (vira só ícones; ele lembra como você deixou).
- **Busca rápida**: aperte **Ctrl+K** → navegue por teclado.
- **Modo escuro**: botão 🌙 no topo.

---

## Checklist rápido
- [ ] IA já está **ON** (canto superior) — pode deixar ligada
- [ ] Cadastre 1 vendedor em **Vendedores** (opcional, pra testar aviso de lead quente)
- [ ] Base de conhecimento já vem preenchida (tela **Conhecimento**)

## Religar o n8n (se algum dia precisar)
```
docker start wa_leads_n8n wa_leads_n8n_worker
```
(e re-adicionar o webhook do n8n no WAHA)

## ⏳ Ainda NÃO implementado (planejado)
- **Lia fechar a venda sozinha** (gerar link de pagamento / self-checkout) — parado pra fazer depois.
- **Handoff completo** (botão "Assumir" / pausar robô por conversa / pesquisa de satisfação) — planejado.
