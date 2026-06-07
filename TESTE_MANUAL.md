# Roteiro de Teste Manual — Nexa (Lia / HiperTMS)

> Estado atual: **banco limpo** (só o login admin), **n8n desligado**, **WAHA conectado e apontando só pro Nexa**.
> Número conectado (onde os leads mandam mensagem): **+55 12 99788-0659**
> Login: `admin@nexa.local` / `admin123` — http://localhost:5173

---

## A melhor forma de testar: 2 frentes

A IA tem dois caminhos. Vale testar os dois, mas o **mais importante é o INBOUND** (a resposta da Lia).

### 🟢 Frente 1 — RESPOSTA da IA (inbound) — *teste principal*
Simula um lead te chamando no WhatsApp. É aqui que se vê a Lia "pensando".

1. No topo do sistema, clique em **IA OFF → IA ON** (liga a autonomia / auto-resposta).
2. Do **seu celular**, mande uma mensagem para **+55 12 99788-0659**.
3. A Lia responde sozinha em alguns segundos. Acompanhe no **Inbox**.

**Roteiros pra testar (mande um de cada vez, de números diferentes se puder):**

| O que mandar | O que DEVE acontecer |
|---|---|
| "Oi, queria saber sobre o sistema de vocês" | Lia se apresenta (Lia do HiperTMS), faz pergunta de qualificação |
| "Quanto custa?" | Lia responde com os planos (Básico R$89 / Essencial R$299 / Profissional R$599) |
| "Tenho 20 caminhões, quero contratar" | Lead **quente** → score sobe, pede e-mail, cria oportunidade e **avisa o vendedor** |
| "Quero marcar uma reunião" | Lia tenta agendar / encaminha pra humano |
| "Tô com um problema no sistema" | Roteia pro agente de **suporte** (usa base de conhecimento) |
| "Que serviço de porcaria" (reclamação) | Detecta reclamação → registra → tom de contorno / handoff |
| "SAIR" | Opt-out: marca como descadastrado, para de responder (LGPD) |

✅ Checar depois: **Inbox** (conversa + score), **Painel** (métricas sobem), **Vendedores** (se cadastrou vendedor, ele recebe aviso do lead quente).

### 🔵 Frente 2 — DISPARO (outbound) — campanha em massa
1. **Contatos → Importar** o arquivo `contatos_teste.csv` (já está pronto, com **seus próprios números** — seguro pra testar em você mesmo).
2. **Disparo → Nova campanha**: escreve a mensagem (já vem um modelo da Lia do HiperTMS), opcional anexar PDF e link (use **https://www.hipertms.com.br**), define quantos enviar.
3. **Iniciar**. Você recebe a mensagem no seu WhatsApp.
4. **Responda** a mensagem → cai na Frente 1 (a Lia conversa de volta).

> ⚠️ A lista de teste tem só os **seus 2 números** de propósito. Pra testar em outras pessoas, é só editar o `contatos_teste.csv`.
> 🛡️ Proteções ativas: horário comercial (7h–19h), delay 30–90s entre envios, limite diário (aquecimento), rodapé "Responda SAIR".

---

## Antes de começar — checklist rápido
- [ ] Cadastre 1 vendedor em **Vendedores** (pra testar o aviso de lead quente) — opcional
- [ ] Confira a **Base de Conhecimento** (planos já estão lá)
- [ ] Ligue a **IA (ON)** antes do teste inbound
- [ ] Quando terminar, **IA OFF** pra não responder sozinho fora do teste

## Se quiser religar o n8n depois
```
docker start wa_leads_n8n wa_leads_n8n_worker
```
(e re-adicionar o webhook do n8n no WAHA, se quiser ele respondendo junto)
