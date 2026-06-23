# PRD — Canal WhatsApp Status (Campanhas)

> **Status:** Backend implementado e testado · Frontend pendente  
> **Módulo:** Campanhas (`application/sender/`)  
> **ADR:** [ADR-029](../../adr/029-canal-status-whatsapp.md)

---

## Objetivo

Permitir que o operador publique uma mensagem de texto ou imagem no **Status do WhatsApp** do número conectado, atingindo todos os contatos de uma vez sem precisar enviar mensagem individual para ninguém.

É o equivalente digital de um "quadro de avisos" — o contato vê no Stories do WhatsApp se quiser, sem receber uma mensagem na caixa de entrada.

---

## Diferença em relação à campanha de mensagem

| Aspecto | Campanha de mensagem | Campanha de Status |
|---------|---------------------|--------------------|
| Destinatários | Lista de contatos (`campaign_targets`) | Nenhum — broadcast passivo |
| Anti-spam por destinatário | Sim (janela de intervalo entre envios) | Não se aplica |
| Rastreamento individual | Sim (entregue, lido por contato) | Não — WhatsApp não expõe leituras de Status via API |
| Janela de horário | Aplicada | Aplicada |
| Resultado | N mensagens enviadas | 1 publicação no Status |

---

## Campos da campanha

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | string | ✅ | Nome interno da campanha |
| `type` | string | ✅ | Fixo: `"status"` |
| `template` | string | ✅ | Texto do Status (máx. 700 chars recomendado) |
| `mediaUrl` | string | ❌ | URL de imagem — se preenchido, posta imagem com `template` como legenda |
| `scheduledAt` | datetime | ❌ | Agendamento futuro — se omitido, executa imediatamente |

---

## Fluxo de execução

```
Operador cria campanha (type: "status")
  → status: pending
    → scheduledAt atingido (ou imediato)
      → SenderService detecta no tick (@Interval)
        → status: running
          → sem mediaUrl: waha.sendStatusText(template)
          → com mediaUrl:  waha.sendStatusImage(mediaUrl, template)
            → statusPostedAt = now()
            → status: done
```

**Implementação de referência:**
- `shared/waha/waha-client.service.ts` → `sendStatusText()` / `sendStatusImage()`
- `application/sender/sender.service.ts` → handler `type: 'status'`
- `presentation/http/sender/sender.controller.ts` → `CreateCampaignDto` aceita `type: 'status'`
- `sender.service.spec.ts` → cenários cobertos: texto simples, imagem com legenda, agendamento, WAHA offline

---

## Comportamento de erro

| Cenário | Comportamento |
|---------|--------------|
| WAHA desconectado | Campanha permanece `running`, reprocessada no próximo tick |
| `mediaUrl` inacessível | Erro logado, campanha marcada como `failed` |
| Fora da janela de horário | Aguarda próxima janela disponível |

---

## Limitações conhecidas

- WhatsApp não expõe métricas de visualização de Status via API — não é possível saber quantos contatos viram.
- Suporte a **vídeo** depende da versão do WAHA instalada — verificar antes de expor no frontend.
- O Status expira em **24 horas** no WhatsApp — comportamento padrão da plataforma, fora do controle do sistema.
- Um número só pode ter **1 Status ativo por vez** — publicar novo substitui o anterior.

---

## Requisitos do frontend (a implementar)

### Formulário "Nova campanha"

- Seletor de tipo no topo: `Mensagem` (padrão) | `Status WhatsApp`
- Quando `type = "status"`:
  - **Ocultar** seleção de destinatários e upload de lista — não existe `campaign_targets`
  - Campo `template` (textarea, máx. 700 chars recomendado com contador visível)
  - Campo de imagem opcional (`mediaUrl`): aceitar URL direta ou upload — se preenchido, o texto vira legenda da imagem
  - Campo de agendamento opcional (`scheduledAt`): date-time picker; se omitido, executa imediatamente após iniciar. MVP pode omitir o date picker e deixar envio imediato apenas.

### Listagem de campanhas

- Badge `Status` (cor distinta de `WhatsApp`) para campanhas `type: 'status'`
- Barra de progresso não se aplica — sem targets, sem percentual
- Exibir `statusPostedAt` formatado ("Publicado em DD/MM às HH:mm") quando disponível

### Comportamento de edição

- Campanha de Status em `draft`: permite editar `name`, `template`, `mediaUrl`, `scheduledAt`
- Campanha `done`: somente renomear (mesmo comportamento das campanhas de mensagem)
- **Não existe** "pausar" para Status — a publicação é atômica (1 chamada de API), não há fila para pausar
