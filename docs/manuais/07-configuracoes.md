---
type: manual
tags: [manual, configuracoes, whatsapp, conectores, planos]
updated: 2026-07-07
summary: Manual do usuário — configurações do Nexa (WhatsApp, conectores, planos, horários).
---

# Manual 07 — Configurações

---

## WhatsApp (WAHA)

O Nexa usa o **WAHA** para conectar ao WhatsApp Business.

### Conectar WhatsApp

1. Acesse **Configurações → WhatsApp**
2. Clique em **"Conectar número"**
3. Escaneie o QR Code com o WhatsApp do número que deseja usar
4. Aguarde confirmação (verde = conectado)

**Requisitos:**
- WhatsApp Business ou pessoal (não WhatsApp Business API pago)
- O número não pode estar logado em outro dispositivo

### Desconectar / Reconectar

- **Desconectar:** Configurações → WhatsApp → "Desconectar"
- **Reconectar:** repita o processo de QR Code

> Se o WhatsApp desconectar (celular reiniciou, bateria acabou), o Nexa
> notifica por e-mail e pausa o atendimento automático.

### Múltiplos números

No plano **Profissional+** é possível conectar mais de um número:
1. Configurações → WhatsApp → "+ Novo número"
2. Cada número tem sua própria caixa de entrada (Inbox)

---

## Conectores — HiperTMS

1. Acesse **Configurações → Integrações → HiperTMS**
2. Insira:
   - **URL da API** do tenant TMS
   - **API Key** gerada no TMS (Configurações → Integrações → Nexa)
3. Clique em **Testar conexão**
4. Se OK → **Salvar**

**O que a integração habilita:**
- Sincronização automática de clientes TMS → Contatos Nexa
- Monitor Proativo TMS (ver Manual 06)
- Cotação de frete via Lia (se habilitado no plano)
- Suporte nativo TMS (tickets direto no painel TMS)

---

## Horário de atendimento

Define quando a Lia atende automaticamente.

1. Acesse **Configurações → Lia → Horário**
2. Configure dias e horários (ex: Seg–Sex 08h–18h)
3. Defina mensagem de fora do horário:
   > *"Nosso atendimento é de segunda a sexta das 8h às 18h. Responderemos assim que possível."*

**Fora do horário:**
- Lia envia mensagem de ausência
- Mensagens ficam na fila para revisão no próximo horário

---

## Plano e limites

Acesse **Configurações → Plano** para ver:

| Informação | Descrição |
|---|---|
| **Plano atual** | Starter / Profissional / Enterprise |
| **Conversas este mês** | Uso vs. limite do plano |
| **Usuários ativos** | Slots ocupados vs. disponíveis |
| **Conectores ativos** | TMS, e-mail, outros |
| **Data de renovação** | Próximo ciclo de cobrança |

Para fazer upgrade: clique em **"Ver planos"** ou entre em contato com o suporte.

---

## Notificações

Acesse **Configurações → Notificações**:

| Notificação | Quando chega |
|---|---|
| **Nova conversa** | Lead novo entra no inbox |
| **Handoff solicitado** | Lia pede humano |
| **WhatsApp desconectado** | Canal cai |
| **Alerta do Monitor** | Pendência detectada no TMS |
| **Ticket crítico** | Ticket marcado como urgente |

Configure por **canal**: e-mail, browser (push), ou ambos.
