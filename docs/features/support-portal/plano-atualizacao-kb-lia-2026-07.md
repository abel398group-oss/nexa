# Plano de atualização — KB de suporte da Lia (SQUAD NEXA)

> **Para o agente/dev:** leia `REGRAS-SQUAD.md` antes de qualquer mudança.
> Execute na ordem (K1 → K3), um commit por tarefa, checklist do REGRAS-SQUAD.md
> ao concluir. Squad TMS tem plano espelho para a Central de Ajuda
> (`hipertms_v12/docs/features/help/plano-atualizacao-central-ajuda-2026-07.md`).

## Diagnóstico (auditoria 2026-07-10, verificado no código)

Arquivos: `apps/backend/src/application/connectors/hipertms-suporte-kb.data.ts`
(3011 linhas), `hipertms-manuais.data.ts` (1213), `hipertms-help-urls.data.ts` (46).

- **Plano Corporativo AUSENTE da KB**: a KB lista só Básico R$89 / Essencial
  R$199 / Profissional R$299 (linhas ~972–974), mas o seed do TMS tem 4 planos,
  incluindo Corporativo. Lia responde errado sobre planos hoje.
- **Preços hardcoded**: os valores batem com o seed HOJE, mas planos são
  gerenciados por banco no TMS (`plans.service.ts`) e existe sync
  (`nexa-plan-sync.service.ts` no TMS + endpoint de planos). Preço em texto
  fixo na KB vai divergir na primeira alteração comercial.
- **Features novas do TMS sem cobertura na KB**: duplicação de registros
  (embarques, cotações, manutenções, abastecimentos, pedidos), paleta de
  comandos/busca global, navegação fixada, criação rápida de empresa.
- `hipertms-help-urls.data.ts`: as 38 URLs estão válidas (verificado contra
  `help-data.ts` do TMS em 2026-07-10). Faltam artigos para
  `cte-carta-correcao` e `certificado-digital` (caem no fallback genérico).
- Já existe o workflow `regenerate-manuais-kb.yml` + script de chunks — usar
  esse pipeline, não editar chunk gerado à mão.

## K1 — Planos e preços: parar de responder por texto fixo (prioridade)

1. Remover os preços/planos hardcoded da KB (`hipertms-suporte-kb.data.ts`
   ~linhas 972–974 e qualquer outra ocorrência de preço de plano).
2. Lia responde pergunta de plano/preço consultando os dados dinâmicos do
   conector HiperTMS (endpoint de planos já existe no TMS; verificar
   `hipertms.connector.ts` e o sync). Se o conector estiver indisponível,
   resposta honesta ("vou confirmar os valores") + escalação — nunca preço
   possivelmente desatualizado.
3. Incluir o plano Corporativo no fluxo (dados dinâmicos já o trazem).
4. Teste: pergunta de preço com conector ok e com conector fora.

## K2 — Cobrir as features novas do TMS

Adicionar entradas na KB (via pipeline de regeneração) para:

1. Duplicação de registros (embarque, cotação, manutenção, abastecimento,
   pedido de compra) — caminho de menu + o que é pré-preenchido.
2. Paleta de comandos / busca global (atalho, o que encontra).
3. Navegação fixada e recentes.
4. Criação rápida de empresa no seletor.
5. Responder chamado encerrado no widget (reabre ou vira chamado novo).

Fonte da verdade: o CÓDIGO do TMS e os artigos novos da Central de Ajuda
(squad TMS está escrevendo — tarefa H1 do plano deles). Confirmar cada passo
contra o repo `hipertms_v12` antes de escrever; não inventar caminho de menu.

## K3 — Sincronizar help-urls e fechar lacunas

1. Quando o squad TMS entregar os artigos novos (H1), atualizar
   `hipertms-help-urls.data.ts` com os topics novos (lista virá via Abel).
2. Adicionar URLs para `cte-carta-correcao` e `certificado-digital` assim que
   os artigos existirem no TMS (hoje caem no fallback).
3. Registrar no arquivo a data/fonte da sincronização (como já feito em
   2026-07-07).

## Regra permanente

Sempre que o TMS lançar feature visível ao cliente, o squad Nexa recebe os
topics novos e roda K2/K3 na sequência. A KB nunca deve afirmar preço, limite
de plano ou caminho de menu sem fonte no código ou nos dados dinâmicos.

## Aceite geral

- Testes do backend passando; type-check zero erros.
- Nenhuma resposta de preço vinda de texto fixo (grep por "R$" na KB não pode
  retornar preço de plano).
- KB regenerada pelo pipeline oficial (`regenerate-manuais-kb.yml`), não à mão.
- Commits: `feat(knowledge): ...`. Sem push.
