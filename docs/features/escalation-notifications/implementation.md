# Escalation Notifications — Guia de Implementação

> Status: **pendente** | Relacionado: ADR 015 (pipeline de suporte) · ADR 016 (escalonamento)

## Problema

Quando `EscalationAgentService.decide()` retorna `escalate: true`, o `SupportAgentService` define `needsHuman = true` e devolve a mensagem de escalonamento ao cliente — mas **nenhuma notificação é criada** para alertar a equipe humana. O operador só fica sabendo se monitorar o inbox manualmente.

## O que já existe

| Peça | Arquivo | Estado |
|---|---|---|
| Decisão de escalonamento | `application/agents/escalation-agent.service.ts` | ✅ Pronto |
| Criação de notificações | `application/notifications/notifications.service.ts` | ✅ Pronto |
| Import `NotificationsModule` em `AgentsModule` | `application/agents/agents.module.ts` | ✅ Já importado |
| Exibição no frontend | `components/ui/NotificationBell.tsx` | ✅ Pronto (polling 30s) |

O único wiring faltante é: injetar `NotificationsService` em `SupportAgentService` e disparar a notificação no momento correto.

---

## Implementação

### 1. Adicionar tipo `'escalation'` em `NotificationsService`

**`apps/backend/src/application/notifications/notifications.service.ts`**

```ts
// Antes
export interface CreateNotification {
  type: 'hot_lead' | 'complaint' | 'opt_out' | 'info';
  // ...
}

// Depois
export interface CreateNotification {
  type: 'hot_lead' | 'complaint' | 'opt_out' | 'info' | 'escalation';
  // ...
}
```

---

### 2. Injetar `NotificationsService` em `SupportAgentService`

**`apps/backend/src/application/agents/support-agent.service.ts`**

```ts
// imports — adicionar
import { NotificationsService } from '@/application/notifications/notifications.service';

// constructor — adicionar parâmetro
constructor(
  private readonly conversations: ConversationsService,
  private readonly ai: AnthropicService,
  private readonly classifier: CaseClassifierAgentService,
  private readonly diagnostic: DiagnosticAgentService,
  private readonly resolution: ResolutionAgentService,
  private readonly escalation: EscalationAgentService,
  private readonly prisma: PrismaService,
  private readonly notifications: NotificationsService,   // ← novo
) {}
```

> `NotificationsModule` já está importado em `AgentsModule` e exporta `NotificationsService` — nenhuma mudança no módulo é necessária.

---

### 3. Disparar notificação após decisão de escalonamento

**`apps/backend/src/application/agents/support-agent.service.ts`** — bloco `// ── 4. ESCALONAMENTO`

```ts
// ── 4. ESCALONAMENTO ────────────────────────────────────────────────────
const escalationDecision = this.escalation.decide({
  category: classification.category,
  priority: classification.priority,
  diagnostic: diag,
  resolution: resol,
  requiresHumanFromClassifier: classification.requiresHuman,
});

let draft = escalationDecision.escalate ? escalationDecision.message : resol.draft;
const needsHuman = escalationDecision.escalate;

// ← NOVO: notificação para a equipe quando há escalonamento
if (needsHuman) {
  const conversationLink = input.conversationId
    ? `/inbox/${input.conversationId}`
    : undefined;

  await this.notifications.create(tenantId, {
    type: 'escalation',
    title: '🔴 Escalonamento — atendimento humano necessário',
    body: `Categoria: ${classification.category} · Prioridade: ${classification.priority} · Motivo: ${escalationDecision.reason}`,
    link: conversationLink,
  });
}
```

#### Payload da notificação

| Campo | Valor |
|---|---|
| `type` | `'escalation'` |
| `title` | `'🔴 Escalonamento — atendimento humano necessário'` |
| `body` | `Categoria: <category> · Prioridade: <priority> · Motivo: <reason>` |
| `link` | `/inbox/<conversationId>` (ou `undefined` se sem conversationId) |

#### Valores de `reason` possíveis

| Razão | Condição |
|---|---|
| `fiscal_financeiro_low_confidence` | Categoria fiscal/financeiro + confiança baixa |
| `priority_critical` | Prioridade `critical` |
| `high_priority_unresolved` | Alta prioridade + resolução falhou |
| `classifier_requires_human` | Classificador pediu humano explicitamente |

---

### 4. Frontend — ícone para tipo `escalation` (opcional, recomendado)

O `NotificationBell.tsx` já renderiza qualquer notificação. Para dar destaque visual ao tipo `escalation`, adicione um ícone diferenciado:

**`apps/frontend/src/components/ui/NotificationBell.tsx`** — dentro do `.map()`:

```tsx
function notifIcon(type: string): string {
  switch (type) {
    case 'escalation': return '🔴';
    case 'hot_lead':   return '🔥';
    case 'complaint':  return '⚠️';
    default:           return '•';
  }
}

// No render do item — antes do título:
<span className="mr-1">{notifIcon(n.type)}</span>
<span className="text-sm font-medium text-base-content">{n.title}</span>
```

Sem essa mudança, a notificação ainda aparece (fundo azul para não-lida, título + body legíveis) — apenas sem ícone colorido.

---

## Ordem de execução

1. `notifications.service.ts` — adicionar `'escalation'` no tipo (1 linha)
2. `support-agent.service.ts` — injetar `NotificationsService` + bloco `if (needsHuman)` (~15 linhas)
3. `NotificationBell.tsx` — adicionar `notifIcon()` e renderizá-lo (opcional, ~10 linhas)
4. Testar manualmente: enviar mensagem de categoria fiscal com resposta de baixa confiança → verificar que a notificação aparece no sino com link para a conversa

---

## Teste manual

1. Abrir o Nexa com um tenant configurado
2. Enviar mensagem via canal WhatsApp/web para a Lia sobre tema fiscal (ex.: "Tenho um problema com minha nota fiscal de entrada, não está sendo aceita pelo SEFAZ")
3. Aguardar a Lia responder e o `SupportAgent` processar
4. Verificar: sino de notificações no frontend deve exibir badge vermelho
5. Abrir sino → deve aparecer item tipo `escalation` com link para a conversa
6. Clicar no item → deve navegar para `/inbox/<conversationId>`

---

## Observações

- `notifications.create()` **nunca derruba o fluxo chamador** (try/catch interno no service) — falha silenciosa com log `warn`. Seguro usar com `await`.
- O polling atual do `NotificationBell` é 30s. Se o squad quiser notificação em tempo real, o caminho é emitir via socket.io (gateway já existe para o inbox) — fora do escopo desta tarefa.
- Não há necessidade de migration de banco: o campo `type` em `Notification` é `String` no Prisma (sem enum restrito no DB).
