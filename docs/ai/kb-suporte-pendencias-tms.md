# KB da Lia — o que ficou de FORA e por quê (pendências do TMS)

> Decisão do Abel (2026-07-22): a KB de suporte cobre **só o que está estável**
> no TMS (estratégia 1). Feature em construção NÃO entra — KB de feature pela
> metade envelhece em dias e faz a Lia informar errado.
>
> Este doc é o **lembrete de cobrança**: quando o Uelder terminar cada item, a
> KB correspondente deve ser escrita. Fonte: leitura do código-fonte do
> `hipertms_v12` (não dos manuais, que estão defasados desde 07/07).

## Como usar

1. Uelder avisa que terminou um item / você vê o item saindo do "em construção".
2. Marcar o item aqui como pronto e pedir a KB daquele domínio.
3. A Lia só passa a falar do assunto depois que a KB entra e o backend reinicia
   (o boot reimporta e reindexa sozinho).

## Pendências (bloqueiam KB)

### 🔴 CIOT — geração automática (fiscal-ciot)

- **Estado no código:** `ciot-obrigatoriedade.util.ts` marcado
  `✅ ESQUELETO (2026-06)`; os provedores **NDD e-Frete** e **nstech hub**
  lançam `CiotProviderNotImplementedError` em gerar/consultar/cancelar/encerrar.
- **O que JÁ funciona (pode virar KB):** registro **manual** do CIOT gerado na
  IPEF (`registrarManual`, número obrigatório), listagem, cancelar (com motivo)
  e encerrar. Regra de obrigatoriedade: TAC e TAC-equiparado exigem; frota
  própria não; ETC/CTC não (até confirmarem a Resolução ANTT 6.078/2026).
- **Falta pra KB completa:** integração real com IPEF (geração automática).
- **Perguntar ao Uelder:** qual IPEF será credenciada e se o fluxo do usuário
  muda (hoje ele gera fora e cola o número no TMS).

### 🟡 NFS-e — provedor secundário (fiscal-nfse)

- **Estado:** `FocusNfeAdapter` é o **primário e funcional**; `NfeIoAdapter` é
  **stub** (lança `NfseProviderNotImplementedError`).
- **Impacto na KB:** baixo — dá pra escrever a KB de NFS-e normalmente pelo
  fluxo do Focus NFe. Só não mencionar nfe.io como opção disponível.
- **Perguntar ao Uelder:** o nfe.io vai ser ativado? Se não, some da doc.

### ⚪ ANTT / piso tarifário (antt-floor)

- **Estado:** módulo existe; não auditado a fundo ainda (fase 2 do plano).
- **KB hoje:** praticamente zero (3 menções, nada nos manuais).
- **A fazer:** auditar na fase de Precificação e confirmar com o Uelder se a
  regra do piso já está valendo pros clientes.

### ⚪ Caixa: acumulado da semana + contagem de CT-e (T11, 2026-07-29)

- **Estado:** o endpoint `GET /nexa/proactivity/cash-view` devolve só o snapshot
  do dia (`invoicedToday`/`paidToday`). Não tem acumulado da semana corrente.
- **Nexa já está pronto:** `invoicedWeek`/`paidWeek` declarados como opcionais;
  no dia que o TMS mandar, as linhas `seg→qua` aparecem sozinhas. Ver
  `docs/monitor/t11-caixa-acumulado-semana-2026-07.md`.
- **Perguntar ao Uelder:** (1) dá pra devolver `invoicedWeek`/`paidWeek`
  (segunda 00:00 → agora)? (2) existe contagem de **CT-e emitidos** por dia/
  semana? Hoje o `count` é de faturas (`SALES_INVOICE`), e uma fatura agrupa
  vários CT-e — o usuário pensa em CT-e.

## Itens auditados e OK (sem pendência)

Fiscal CT-e/MDF-e/SEFAZ/GNRE, certificados, e os demais domínios do
`kb-suporte-cobertura-2026-07.md` — a KB pode ser escrita a partir do código
atual.

## Registro de conclusão

| Item | Avisado pelo Uelder em | KB escrita em |
|---|---|---|
| CIOT geração automática | — | — |
| NFS-e nfe.io | — | — |
| ANTT piso tarifário | — | — |
| Caixa semana + contagem CT-e (T11) | — | — |
