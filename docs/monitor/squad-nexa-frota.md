# Squad Nexa — Monitor de Frota (adições ao Monitor Proativo)

> **Repositório:** `nexa`  
> **Pré-requisito:** Squad TMS deve ter concluído `squad-tms-frota.md` antes desta entrega.
> **Princípio:** `docs/principles/proatividade.md` — a mensagem chega antes do problema.
> O Nexa é o canal de entrega; a filosofia proativa vem do motor de regras no TMS.  
> **Contexto:** O Monitor Proativo já está implementado e funcionando (MonitorService,
> ConsolidationService, WahaNotificationChannel, TenantNotificationConfig).
> Esta tarefa adiciona suporte ao domínio `fleet` nos pontos que ainda não o reconhecem.

---

## O que já funciona sem mudança

| Componente | Status |
|---|---|
| `MonitorService` — poll TMS a cada 30min | ✅ já funciona |
| `AlertState` upsert por `dedupeKey` | ✅ já funciona |
| `WahaNotificationChannel` — envio WhatsApp | ✅ já funciona |
| `TenantNotificationConfig` — 1 destinatário por tenant | ✅ já funciona |
| `ConsolidationService` — digest diário | Precisa reconhecer domínio `fleet` |
| Formatação da mensagem WhatsApp | Precisa da seção de frota |

---

## Parte 1 — Atualizar `ConsolidationService`

**Arquivo:** `src/monitor/consolidation.service.ts` (ou equivalente no projeto)

O serviço agrupa alertas por domínio para montar o digest. Adicionar o domínio `fleet`:

### 1.1 Adicionar `fleet` ao mapa de seções

```ts
const DOMAIN_LABELS: Record<string, string> = {
  logistic: '📦 Logística',
  finance:  '💰 Financeiro',
  fiscal:   '📄 Fiscal',
  fleet:    '🚛 Frota',   // ← NOVO
};
```

### 1.2 Garantir que `fleet` não é filtrado

Se houver qualquer `where` ou `filter` que liste domínios explicitamente, adicionar `'fleet'`:

```ts
// Exemplo — se existir algo assim:
const MONITORED_DOMAINS = ['logistic', 'finance', 'fiscal', 'fleet']; // ← adicionar fleet
```

---

## Parte 2 — Formatação da mensagem WhatsApp

A mensagem diária consolidada deve incluir uma seção de frota quando houver alertas.
Exemplo de saída esperada:

```
📋 *Resumo do dia — HiperTMS*
━━━━━━━━━━━━━━━━━━━━━

🚛 *Frota*
🔴 CNH vencida: João Silva (DRV-XYZ) — venceu 10/06
⚠️ CNH vencendo: Carlos Souza — vence em 5 dias (30/06)
⚠️ CRLV vencendo: ABC-1234 — vence em 12 dias (07/07)
🔴 CRLV vencido: XYZ-9876 — venceu 20/06
⚠️ Manutenção próxima: DEF-5678 — troca de óleo em 480 km

📦 *Logística*
...
```

### 2.1 Mapeamento de severidade para emoji

```ts
const SEVERITY_EMOJI: Record<string, string> = {
  CRITICAL: '🔴',
  OVERDUE:  '⚠️',
  DUE_SOON: '📅',
  INFO:     'ℹ️',
};
```

### 2.2 Formatação dos alertas de frota

Os alertas de frota chegam com `reason` já em português (gerado pelo TMS).
Não é necessário reformatar — usar o `reason` diretamente na mensagem:

```ts
function formatFleetSection(alerts: AlertState[]): string {
  if (alerts.length === 0) return '';
  const lines = alerts.map(a => `${SEVERITY_EMOJI[a.severity] ?? '•'} ${a.reason}`);
  return `🚛 *Frota*\n${lines.join('\n')}`;
}
```

---

## Parte 3 — Intents da Lia (consultas on-demand via WhatsApp)

Adicionar ao playbook da Lia os seguintes intents de frota:

| Intent | Frase de exemplo | Resposta |
|---|---|---|
| `fleet.resumo` | "pendências de frota" | Lista todos os alertas fleet abertos do tenant |
| `fleet.veiculo` | "situação do caminhão ABC-1234" | Alertas filtrados pela placa |
| `fleet.motorista` | "CNH do João" | Status CNH do motorista |

### 3.1 Intent `fleet.resumo`

```ts
// No handler de intents do Lia Support
case 'fleet.resumo': {
  const alerts = await this.monitorService.getOpenAlerts(tenantId, 'fleet');
  if (alerts.length === 0) {
    return 'Nenhuma pendência de frota no momento. ✅';
  }
  const lines = alerts.map(a => `${SEVERITY_EMOJI[a.severity]} ${a.reason}`);
  return `Pendências de frota:\n\n${lines.join('\n')}`;
}
```

---

## Parte 4 — Configuração por tenant (TenantNotificationConfig)

Nenhuma mudança de schema. O campo `categories` (se existir) deve incluir `'fleet'`
na lista de categorias monitoradas. Se não existir filtro por categoria, não há ação.

Verificar se o `TenantNotificationConfig` tem campo `enabledDomains` ou similar.
Se sim, garantir que `fleet` está na lista padrão ao criar novas configs.

---

## Checklist de entrega (Nexa)

- [ ] `ConsolidationService` — domínio `fleet` reconhecido e incluído no digest
- [ ] Formatação da mensagem WhatsApp inclui seção 🚛 Frota
- [ ] Mapeamento `SEVERITY_EMOJI` aplicado nos alertas de frota
- [ ] Intents Lia: `fleet.resumo`, `fleet.veiculo`, `fleet.motorista` adicionados
- [ ] `TenantNotificationConfig` — `fleet` incluído nos domínios padrão (se aplicável)
- [ ] Teste manual: gerar alerta no TMS e confirmar chegada via WhatsApp
