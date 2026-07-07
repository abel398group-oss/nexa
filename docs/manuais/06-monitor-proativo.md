---
type: manual
tags: [manual, monitor, tms, alertas, proativo]
updated: 2026-07-07
summary: Manual do usuário — Monitor Proativo TMS (alertas automáticos via WhatsApp).
---

# Manual 06 — Monitor Proativo TMS

O **Monitor Proativo TMS** observa o HiperTMS do seu cliente e envia alertas
automáticos via WhatsApp quando algo precisa de atenção — antes que vire problema.

---

## O que o Monitor detecta

| Módulo | Alertas gerados |
|---|---|
| **Embarques** | Embarques abertos > X dias sem atualização |
| **Financeiro** | Faturas vencidas, contas a pagar próximas do vencimento |
| **Frota** | CNH próxima do vencimento, CRLV vencido, km de manutenção atingido |
| **Cotações** | Cotações em aberto sem resposta > X horas |

---

## Requisitos

- Conector TMS ativo (ver Manual 07 — Configurações)
- WhatsApp conectado via WAHA
- Plano com Monitor habilitado

---

## Ativar o Monitor

1. Acesse **Configurações → Integrações → Monitor TMS**
2. Selecione o tenant TMS que deseja monitorar
3. Escolha os módulos a monitorar (embarques, financeiro, frota, cotações)
4. Configure os thresholds (limiares):
   - Embarques: **dias sem atualização** (padrão: 3 dias)
   - Financeiro: **dias para vencimento** (padrão: 2 dias)
   - Frota: **dias para vencimento CNH/CRLV** (padrão: 30 dias)
5. Escolha o **contato que receberá os alertas** (WhatsApp do responsável)
6. Ative e clique em **Salvar**

---

## Receber e interagir com alertas

Quando o Monitor detecta uma pendência, a Lia envia uma mensagem pro WhatsApp:

```
⚠️ Monitor TMS — Embarques pendentes
Você tem 3 embarques sem atualização há mais de 3 dias.

📦 EMB-2024-0842 — Santos → São Paulo (5 dias)
📦 EMB-2024-0855 — Campinas → Rio (4 dias)
📦 EMB-2024-0861 — Curitiba → BH (3 dias)

Quer ver os detalhes ou tomar alguma ação?
```

**Você pode responder diretamente:**
- *"Mostre o EMB-0842"* → Lia busca detalhes no TMS
- *"Quais faturas vencem essa semana?"* → Lia lista do financeiro
- *"Quando vence a CNH do João Silva?"* → Lia consulta frota

---

## Consultas on-demand

Além dos alertas automáticos, você pode perguntar qualquer coisa sobre o TMS:

| Pergunta | O que a Lia retorna |
|---|---|
| "Quantos embarques estão abertos?" | Contagem e lista |
| "Qual o status do CT-e 2024-00123?" | Detalhes do documento fiscal |
| "Quem tem fatura vencida essa semana?" | Lista de clientes com vencimento |
| "Veículos com revisão pendente?" | Lista por frota |

---

## Configurar frequência dos alertas

Acesse **Configurações → Monitor → Frequência**:

| Opção | Descrição |
|---|---|
| **A cada 15 minutos** | Checagem contínua (recomendado) |
| **A cada hora** | Para operações de menor volume |
| **Uma vez ao dia** | Resumo diário às 18h BRT |
| **Sob demanda** | Só quando você perguntar à Lia |

---

## Desativar temporariamente

1. Acesse **Configurações → Monitor TMS**
2. Toggle **"Monitor ativo"** → desligar
3. Para reativar, ligue o toggle novamente

> Alertas pausados durante desativação **não são enviados retroativamente**.
