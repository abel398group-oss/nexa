# Squad Nexa — Cotação de Frete via WhatsApp

> **Repositório:** `nexa`  
> **Pré-requisito:** Squad TMS entregou `POST /api/nexa/calc/quote`.  
> **Princípio:** `docs/principles/proatividade.md`

---

## Arquitetura do fluxo

```
WhatsApp (cliente)
    ↓ mensagem
WAHA → Nexa (webhook)
    ↓
QuoteConversationService  ← estado da conversa (Redis ou DB)
    ↓ coleta dados via Lia
HiperTmsConnector
    ├── GET /public/geography/cities/search  (resolve cidade → código)
    ├── GET /public/calc/options             (catálogo veículos/cargas)
    ├── POST /public/calc/dedicated          (prospect FCL)
    ├── POST /public/calc/fractional         (prospect LCL)
    └── POST /nexa/calc/quote               (cliente com conta)
    ↓ resultado
QuoteFormatter → mensagem WhatsApp
    ↓
WAHA → cliente
```

---

## Parte 1 — HiperTmsConnector: novos métodos

**Arquivo:** `src/connectors/hipertms/hipertms.connector.ts` (ou equivalente)

```ts
// ── Catálogo (veículos, tipos de carga) ─────────────────────────────────────
async getCalcOptions() {
  return this.get('/public/calc/options');
}

// ── Busca de cidade por nome ─────────────────────────────────────────────────
async searchCity(query: string): Promise<Array<{ code: string; name: string; state: string }>> {
  const res = await this.get(`/public/geography/cities/search?q=${encodeURIComponent(query)}`);
  return res?.cities ?? res ?? [];
}

// ── Cotação pública FCL (prospect sem conta) ─────────────────────────────────
async calcPublicDedicated(input: {
  originCode: string;
  destCode: string;
  cargoType: string;
  vehicleTypeId: string;
  merchandiseValue: number;
  taxRegime: 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL';
}) {
  return this.post('/public/calc/dedicated', input);
}

// ── Cotação pública LCL (prospect sem conta) ─────────────────────────────────
async calcPublicFractional(input: {
  originCode: string;
  destCode: string;
  weightKg: number;
  merchandiseValue: number;
  taxRegime: 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL';
}) {
  return this.post('/public/calc/fractional', input);
}

// ── Cotação com tabela real do tenant ────────────────────────────────────────
async calcTenantQuote(input: {
  tenantId: string;
  originCode: string;
  destCode: string;
  modality: 'FCL' | 'LCL';
  weightKg?: number;
  vehicleTypeId?: string;
  cargoType?: string;
  merchandiseValue: number;
}) {
  return this.post('/nexa/calc/quote', input, { useServiceToken: true });
}
```

---

## Parte 2 — QuoteConversationService (estado da coleta)

Cria e mantém o estado da conversa de cotação por telefone/tenant.

```ts
// src/quote/quote-conversation.service.ts

export type QuoteStep =
  | 'ORIGIN'
  | 'DESTINATION'
  | 'MODALITY'
  | 'VEHICLE_TYPE'   // só FCL
  | 'WEIGHT'         // só LCL
  | 'CARGO_VALUE'
  | 'CALCULATING'
  | 'DONE';

export interface QuoteConversationState {
  phone: string;
  tenantId: string | null;   // null = prospect (usa cotação pública)
  step: QuoteStep;
  originCode?: string;
  originLabel?: string;
  destCode?: string;
  destLabel?: string;
  modality?: 'FCL' | 'LCL';
  vehicleTypeId?: string;
  vehicleLabel?: string;
  weightKg?: number;
  merchandiseValue?: number;
  retries: number;
  startedAt: Date;
}

@Injectable()
export class QuoteConversationService {
  // TTL: 10 minutos de inatividade
  private readonly TTL_MS = 10 * 60 * 1000;
  private sessions = new Map<string, QuoteConversationState>();

  start(phone: string, tenantId: string | null): QuoteConversationState {
    const state: QuoteConversationState = {
      phone, tenantId,
      step: 'ORIGIN',
      retries: 0,
      startedAt: new Date(),
    };
    this.sessions.set(phone, state);
    return state;
  }

  get(phone: string): QuoteConversationState | null {
    const s = this.sessions.get(phone);
    if (!s) return null;
    if (Date.now() - s.startedAt.getTime() > this.TTL_MS) {
      this.sessions.delete(phone);
      return null;
    }
    return s;
  }

  update(phone: string, patch: Partial<QuoteConversationState>) {
    const s = this.sessions.get(phone);
    if (s) Object.assign(s, patch);
  }

  clear(phone: string) {
    this.sessions.delete(phone);
  }
}
```

> **Nota:** Em produção, substituir o `Map` por Redis com TTL para suportar múltiplas instâncias.

---

## Parte 3 — QuoteHandler: lógica de progresso da conversa

```ts
// src/quote/quote.handler.ts

@Injectable()
export class QuoteHandler {
  constructor(
    private conv: QuoteConversationService,
    private tms: HiperTmsConnector,
    private formatter: QuoteFormatter,
  ) {}

  async handle(phone: string, message: string, tenantId: string | null): Promise<string> {
    let state = this.conv.get(phone);

    // Iniciar nova sessão se não existir
    if (!state) {
      state = this.conv.start(phone, tenantId);
      return '📍 Qual a cidade de *origem*? (ex: São Paulo/SP)';
    }

    // Máximo 3 tentativas por campo
    if (state.retries >= 3) {
      this.conv.clear(phone);
      return 'Não consegui entender. Um de nossos atendentes vai te ajudar. 🙋';
    }

    switch (state.step) {
      case 'ORIGIN': return this.handleOrigin(state, message);
      case 'DESTINATION': return this.handleDestination(state, message);
      case 'MODALITY': return this.handleModality(state, message);
      case 'VEHICLE_TYPE': return this.handleVehicleType(state, message);
      case 'WEIGHT': return this.handleWeight(state, message);
      case 'CARGO_VALUE': return this.handleCargoValue(state, message);
      default: this.conv.clear(phone); return 'Sessão encerrada. Digite novamente para cotar.';
    }
  }

  private async handleOrigin(state: QuoteConversationState, msg: string): Promise<string> {
    const cities = await this.tms.searchCity(msg);
    if (!cities.length) {
      this.conv.update(state.phone, { retries: state.retries + 1 });
      return '❌ Cidade não encontrada. Tente novamente (ex: "São Paulo SP")';
    }
    const city = cities[0];
    this.conv.update(state.phone, {
      originCode: city.code,
      originLabel: `${city.name}/${city.state}`,
      step: 'DESTINATION',
      retries: 0,
    });
    return `✅ Origem: *${city.name}/${city.state}*\n\n📍 Qual a cidade de *destino*?`;
  }

  private async handleDestination(state: QuoteConversationState, msg: string): Promise<string> {
    const cities = await this.tms.searchCity(msg);
    if (!cities.length) {
      this.conv.update(state.phone, { retries: state.retries + 1 });
      return '❌ Cidade não encontrada. Tente novamente.';
    }
    const city = cities[0];
    this.conv.update(state.phone, {
      destCode: city.code,
      destLabel: `${city.name}/${city.state}`,
      step: 'MODALITY',
      retries: 0,
    });
    return `✅ Destino: *${city.name}/${city.state}*\n\nÉ frete:\n1️⃣ Dedicado (veículo completo)\n2️⃣ Fracionado (carga parcial)`;
  }

  private handleModality(state: QuoteConversationState, msg: string): string {
    const m = msg.trim().toLowerCase();
    const isFCL = m === '1' || m.includes('dedic') || m.includes('compl') || m.includes('fcl');
    const isLCL = m === '2' || m.includes('frac') || m.includes('parci') || m.includes('lcl');
    if (!isFCL && !isLCL) {
      this.conv.update(state.phone, { retries: state.retries + 1 });
      return 'Digite *1* para Dedicado ou *2* para Fracionado.';
    }
    if (isFCL) {
      this.conv.update(state.phone, { modality: 'FCL', step: 'VEHICLE_TYPE', retries: 0 });
      return 'Qual o tipo de veículo?\n1️⃣ Truck (2 eixos)\n2️⃣ Carreta (3 eixos)\n3️⃣ Bitrem (4 eixos)\n4️⃣ Rodotrem (5+ eixos)';
    }
    this.conv.update(state.phone, { modality: 'LCL', step: 'WEIGHT', retries: 0 });
    return 'Qual o peso total da carga? (em kg, ex: 500)';
  }

  private async handleCargoValue(state: QuoteConversationState, msg: string): Promise<string> {
    const value = parseFloat(msg.replace(/[^\d,\.]/g, '').replace(',', '.'));
    if (!value || value <= 0) {
      this.conv.update(state.phone, { retries: state.retries + 1 });
      return 'Digite o valor em reais (ex: 50000 ou 50.000)';
    }
    this.conv.update(state.phone, { merchandiseValue: value, step: 'CALCULATING' });
    return this.calculate(state.phone);
  }

  private async calculate(phone: string): Promise<string> {
    const state = this.conv.get(phone);
    if (!state) return 'Sessão expirada. Digite novamente para cotar.';

    try {
      let result: any;
      if (state.tenantId) {
        result = await this.tms.calcTenantQuote({
          tenantId: state.tenantId,
          originCode: state.originCode!,
          destCode: state.destCode!,
          modality: state.modality!,
          weightKg: state.weightKg,
          vehicleTypeId: state.vehicleTypeId,
          merchandiseValue: state.merchandiseValue!,
        });
      } else {
        result = state.modality === 'FCL'
          ? await this.tms.calcPublicDedicated({
              originCode: state.originCode!,
              destCode: state.destCode!,
              cargoType: 'GENERAL',
              vehicleTypeId: state.vehicleTypeId!,
              merchandiseValue: state.merchandiseValue!,
              taxRegime: 'SIMPLES_NACIONAL',
            })
          : await this.tms.calcPublicFractional({
              originCode: state.originCode!,
              destCode: state.destCode!,
              weightKg: state.weightKg!,
              merchandiseValue: state.merchandiseValue!,
              taxRegime: 'SIMPLES_NACIONAL',
            });
      }

      this.conv.clear(phone);
      return this.formatter.format(state, result);
    } catch {
      this.conv.clear(phone);
      return '❌ Não consegui calcular a cotação agora. Tente em alguns minutos ou fale com o comercial.';
    }
  }

  // handleVehicleType e handleWeight seguem o mesmo padrão...
}
```

---

## Parte 4 — QuoteFormatter

```ts
// src/quote/quote.formatter.ts

function fmt(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatQuoteResult(state: QuoteConversationState, result: any): string {
  const isPublic = !state.tenantId;
  const modalLabel = state.modality === 'FCL'
    ? `🚛 Frete Dedicado — ${state.vehicleLabel ?? 'Veículo'}`
    : `📦 Frete Fracionado — ${state.weightKg?.toLocaleString('pt-BR')} kg`;

  return [
    '📋 *Cotação de Frete*',
    '━━━━━━━━━━━━━━━━━━━',
    `🗺️ ${state.originLabel} → ${state.destLabel}`,
    `📏 Distância: ${Math.round(result.distanceKm)} km`,
    modalLabel,
    '',
    `💰 *Estimativa: ${fmt(result.estimate ?? result.hipertmsEstimate)}*`,
    result.minimumFloor ? `📊 Piso ANTT: ${fmt(result.minimumFloor)}` : null,
    result.toll ? `🛣️ Pedágio estimado: ${fmt(result.toll)}` : null,
    '',
    isPublic
      ? 'ℹ️ Valores de referência de mercado. Para proposta formal entre em contato.'
      : 'ℹ️ Valor baseado na sua tabela de preços.',
  ].filter(Boolean).join('\n');
}
```

---

## Parte 5 — Intents da Lia

Adicionar ao roteador de intents:

| Intent | Frases de gatilho | Ação |
|---|---|---|
| `quote.start` | "cotar frete", "quanto custa frete", "cotação", "quero cotar" | Iniciar `QuoteHandler` |
| `quote.cancel` | "cancelar", "parar", "desistir" | `QuoteConversationService.clear()` |
| `quote.status` | "cotações", "minha última cotação" | Buscar histórico de `QuoteState` |

Qualquer mensagem enquanto há uma `QuoteConversationState` ativa deve ser roteada diretamente
para `QuoteHandler` sem passar pelo roteamento normal de intents.

---

## Parte 6 — Persistência (QuoteState)

Adicionar tabela no Prisma para histórico:

```prisma
model NexaQuoteState {
  id              String   @id @default(cuid())
  tenantId        String?
  phone           String
  originLabel     String
  destLabel       String
  modality        String
  estimate        Float
  rawResult       Json
  convertedToLead Boolean  @default(false)
  createdAt       DateTime @default(now())

  @@index([phone])
  @@index([tenantId])
  @@map("nexa_quote_states")
}
```

---

## Checklist de entrega (Nexa)

- [ ] `HiperTmsConnector` — 5 novos métodos de cotação
- [ ] `QuoteConversationService` — gerenciamento de estado da conversa (Map → Redis em prod)
- [ ] `QuoteHandler` — máquina de estados da coleta de dados
- [ ] `QuoteFormatter` — formatação da mensagem de resposta
- [ ] Intents da Lia — `quote.start`, `quote.cancel`, `quote.status`
- [ ] Roteamento: mensagens durante sessão ativa → `QuoteHandler` diretamente
- [ ] Prisma migration: `NexaQuoteState`
- [ ] Teste E2E: fluxo completo FCL e LCL (prospect e cliente)
- [ ] Follow-up proativo 24h após cotação não convertida
