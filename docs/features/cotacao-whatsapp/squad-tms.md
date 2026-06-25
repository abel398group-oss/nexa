# Squad TMS — Cotação via WhatsApp

> **Repositório:** `hipertms_v12` — somente leitura/análise. Implementação pelo squad TMS.  
> **Princípio:** `docs/principles/proatividade.md`

## O que já existe (não mexer)

| Endpoint | Descrição | Auth |
|---|---|---|
| `GET /api/public/calc/options` | Catálogo de veículos, cargas e tabelas ANTT | Público |
| `POST /api/public/calc/dedicated` | Estimativa frete dedicado (FCL) | Público |
| `POST /api/public/calc/fractional` | Estimativa frete fracionado (LCL) | Público |
| `GET /api/public/geography/cities/search` | Busca de cidades por nome | Público |

Esses 4 endpoints já são suficientes para **Modo 1 (cotação pública)**.
O Nexa pode chamar diretamente sem autenticação.

---

## O que precisa ser construído

### Parte 1 — Endpoint de cotação personalizada (Modo 2)

Para clientes com conta no TMS, a cotação usa a tabela real do tenant.

**Arquivo:** `apps/api/src/application/nexa-external/nexa-external.service.ts`

Adicionar método `calculateTenantQuote()`:

```ts
import { TariffEngineService } from '../pricing-tariff-engine/tariff-engine.service';
import { GeographyService } from '../pricing-core/geography.service';
import { resolveOperationType } from '../pricing-taxation/taxation.calculations';

// Injetar no constructor:
// private readonly tariff: TariffEngineService,
// private readonly geography: GeographyService,

export interface NexaQuoteInput {
  tenantId: string;
  originCode: string;       // código IBGE da cidade de origem
  destCode: string;         // código IBGE da cidade de destino
  modality: 'FCL' | 'LCL';
  weightKg?: number;        // obrigatório se LCL
  vehicleTypeId?: string;   // obrigatório se FCL
  cargoType?: string;
  merchandiseValue: number;
}

async calculateTenantQuote(input: NexaQuoteInput) {
  if (!input.tenantId) return { success: false, error: 'tenantId obrigatório' };

  // Resolver rota
  const route = await this.geography.calculatePublicRoute(
    input.originCode,
    input.destCode,
  ) as Record<string, unknown>;

  if (!route.exists || !route.route) {
    return { success: false, error: 'Rota não encontrada' };
  }

  const routeCode = String(route.route);

  const result = await this.tariff.calculate({
    tenant_id: input.tenantId,
    modality: input.modality,
    origin_immediate_code: routeCode.slice(0, 6),
    destination_immediate_code: routeCode.slice(6, 12),
    route_code: routeCode,
    cargo_data: {
      weight: input.weightKg,
      vehicle_type_id: input.vehicleTypeId,
      cargo_type: input.cargoType,
      invoice_value: input.merchandiseValue,
    },
    options: {
      operation_type: resolveOperationType(input.originCode, input.destCode),
      include_fees: true,
    },
  });

  if (!result.success) {
    return { success: false, error: 'Não foi possível calcular a cotação' };
  }

  return {
    success: true,
    distanceKm: result.route.distance_km,
    estimate: result.totals.finalTotal,
    breakdown: {
      freight: result.breakdown.freightWeight.freightWeight,
      fees: result.breakdown.fees.total,
      taxes: result.breakdown.taxes.total,
    },
    modality: input.modality,
  };
}
```

### Parte 2 — Rota HTTP no controller nexa-external

**Arquivo:** `apps/api/src/presentation/http/nexa-external/nexa-external.controller.ts`

```ts
import { Body, Post } from '@nestjs/common';

// Adicionar ao NexaExternalController:

// POST /nexa/calc/quote
@Post('calc/quote')
calcQuote(@Body() body: {
  tenantId: string;
  originCode: string;
  destCode: string;
  modality: 'FCL' | 'LCL';
  weightKg?: number;
  vehicleTypeId?: string;
  cargoType?: string;
  merchandiseValue: number;
}) {
  return this.nexa.calculateTenantQuote(body);
}
```

> **Segurança:** o endpoint usa o `InternalTokenGuard` já existente no controller.
> O `tenantId` vem do Nexa (identificado via `lookupByPhone`), nunca do cliente final.

---

## Resumo dos endpoints que o Nexa vai consumir

| Endpoint | Auth | Para que serve |
|---|---|---|
| `GET /api/public/calc/options` | Público | Carregar catálogo de veículos/cargas para a Lia |
| `GET /api/public/geography/cities/search?q=...` | Público | Resolver nome de cidade → código IBGE |
| `POST /api/public/calc/dedicated` | Público | Cotação genérica FCL (prospect) |
| `POST /api/public/calc/fractional` | Público | Cotação genérica LCL (prospect) |
| `POST /api/nexa/calc/quote` | ServiceToken | Cotação com tabela do tenant (cliente existente) |

---

## Checklist de entrega (TMS)

- [ ] `nexa-external.service.ts` — método `calculateTenantQuote()` implementado
- [ ] `nexa-external.service.ts` — `TariffEngineService` e `GeographyService` injetados
- [ ] `nexa-external.controller.ts` — rota `POST /nexa/calc/quote` adicionada
- [ ] Teste manual: chamar `POST /nexa/calc/quote` com tenantId real e verificar resposta
- [ ] Confirmar que `InternalTokenGuard` cobre o novo endpoint
