# PRD — Cotação de Frete via WhatsApp (Lia)

**Status:** Planejado  
**Data:** 2026-06-25  
**Princípio:** `docs/principles/proatividade.md` — o cliente recebe o valor antes de precisar ligar.

---

## Problema

Transportadoras perdem clientes porque o processo de cotação é lento:
o interessado manda e-mail ou liga, aguarda retorno humano, e muitas vezes já fechou com o concorrente.

A Lia pode cotar em segundos, 24h por dia, direto no WhatsApp.

---

## Objetivo

Permitir que qualquer pessoa (cliente existente ou prospect) receba uma estimativa de frete
via WhatsApp em menos de 60 segundos, sem interação humana.

---

## Dois modos de cotação

### Modo 1 — Cotação Pública (prospect / sem conta no TMS)

Para quem ainda não é cliente da transportadora. A Lia usa a calculadora pública do TMS
(`/api/public/calc/`), que retorna estimativas de mercado com disclaimer.

**Quando usar:** o número do WhatsApp não está cadastrado no TMS como cliente.

### Modo 2 — Cotação Personalizada (cliente com conta no TMS)

Para quem já é cliente da transportadora. A Lia usa a tabela de preços real do tenant
(`POST /api/nexa/calc/quote`), que retorna o preço exato que a transportadora cobra.

**Quando usar:** o número do WhatsApp identifica um tenant no TMS (via `lookupByPhone`).

---

## Fluxo de conversa

```
Cliente: "quero cotar um frete" / "quanto custa frete de SP pra BH?"

Lia: "Claro! Me passa os dados:
      📍 Cidade de origem (ex: São Paulo/SP)"

Cliente: "São Paulo SP"

Lia: "📍 Cidade de destino?"

Cliente: "Belo Horizonte MG"

Lia: "É frete dedicado (veículo completo) ou fracionado (carga parcial)?"

Cliente: "dedicado"

[Se dedicado]
Lia: "Qual tipo de veículo?
      1️⃣ Truck (2 eixos)
      2️⃣ Carreta (3 eixos)
      3️⃣ Bitrem (4 eixos)
      4️⃣ Rodotrem (5+ eixos)"

Cliente: "carreta"

Lia: "Qual o valor aproximado da mercadoria? (para cálculo de seguro)"

Cliente: "80 mil reais"

[Se fracionado]
Lia: "Qual o peso total da carga? (em kg)"
Cliente: "500 kg"
Lia: "Qual o valor da mercadoria?"

[Após coletar dados → chama API → responde]

Lia: "📦 *Cotação de Frete*
      ━━━━━━━━━━━━━━━━━━━
      🗺️ São Paulo/SP → Belo Horizonte/MG
      📏 Distância: 586 km
      🚛 Frete Dedicado — Carreta

      💰 *Estimativa: R$ 5.200,00*
      📊 Piso ANTT: R$ 3.800,00
      🛣️ Pedágio estimado: R$ 240,00

      ℹ️ Valores de referência. Para proposta
      formal entre em contato com o comercial.

      Quer que eu registre essa cotação? 📋"
```

---

## Dados coletados pela Lia

| Campo | Obrigatório | Como coletar |
|---|---|---|
| Origem (cidade) | ✅ | Pergunta + busca de código via API |
| Destino (cidade) | ✅ | Pergunta + busca de código via API |
| Modalidade (FCL/LCL) | ✅ | Pergunta múltipla escolha |
| Tipo de veículo | ✅ (só FCL) | Menu com opções do catálogo TMS |
| Valor da mercadoria | ✅ | Pergunta numérica |
| Peso da carga | ✅ (só LCL) | Pergunta numérica |

---

## Resposta formatada

```
📦 *Cotação de Frete*
━━━━━━━━━━━━━━━━━━━
🗺️ {origem} → {destino}
📏 Distância: {distanceKm} km
🚛 {modalidade} — {veículo ou peso}

💰 *Estimativa: {valor}*
📊 Piso ANTT: {minimumFloor}
🛣️ Pedágio estimado: {toll}

ℹ️ {disclaimer}
```

---

## Regras de negócio

- **Timeout de coleta:** se o cliente não responder em 10 minutos, a sessão expira.
- **Tentativas:** até 3 tentativas por campo antes de desistir e oferecer atendimento humano.
- **Limite de cotações:** configurável por plano (ex: Starter = 50/mês via WhatsApp).
- **Registro:** toda cotação gera um `QuoteState` no Nexa para histórico e follow-up.
- **Follow-up proativo:** se cotação não converteu em 24h, Lia envia mensagem de follow-up.
