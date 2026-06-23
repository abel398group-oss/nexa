# ADR 029 — Canal WhatsApp Status (Broadcast Passivo)

- **Status:** Aceito (implementado)
- **Data:** 2026-06-20
- **Autores:** Time Nexa

---

## Contexto

O Nexa já suporta campanhas de mensagem direta (1:1 para cada contato da lista).
A necessidade era ter um canal de comunicação em lote sem custo por destinatário e sem gerar notificação na caixa de entrada do contato — menos intrusivo, mais adequado para avisos gerais, promoções de baixo urgência e conteúdo de marca.

O WhatsApp Status (equivalente ao Stories) atende exatamente esse caso: uma única publicação visível para todos os contatos que salvaram o número, sem push notification individual, com duração de 24h.

---

## Decisão

Implementar o canal **WhatsApp Status** como um subtipo da entidade `Campaign` com `type: 'status'`.

A campanha de Status é tratada como **broadcast passivo**:
- Não possui `campaign_targets` — não há lista de destinatários
- O `SenderService` detecta campanhas `type: 'status'` no tick e chama diretamente `waha.sendStatusText()` ou `waha.sendStatusImage()`
- Marca `statusPostedAt` e `status: done` após a publicação

---

## Por que não usar `campaign_targets`

Três razões:

1. **Semântica errada:** o Status não é enviado *para* ninguém — é publicado *em* um canal. Ter `campaign_targets` implicaria rastreamento individual de entrega/leitura, que o WhatsApp não expõe para Status via API.

2. **Custo computacional desnecessário:** criar N registros de targets para uma ação que resulta em 1 chamada de API seria desperdício de banco e processamento.

3. **Simplicidade:** a ausência de targets é intencional e documenta o comportamento — quem ler o schema entende imediatamente que Status é diferente de mensagem.

---

## Alternativas consideradas

### Alternativa 1 — Novo tipo de entidade separado de Campaign
Criar uma tabela `status_posts` independente.

**Rejeitada porque:** aumentaria a superfície de código sem ganho real. O comportamento de agendamento, janela de horário e ciclo de vida (pending → running → done) é idêntico ao de campanhas. Reusar `Campaign` com um `type` discriminante mantém o código DRY.

### Alternativa 2 — Usar `campaign_targets` com um target fictício ("all")
Criar um target especial representando "todos os contatos".

**Rejeitada porque:** seria um hack semântico que confundiria futuras manutenções. A ausência de targets é a representação correta do modelo.

---

## Consequências

**Positivas:**
- Nenhuma tabela nova — reutiliza `Campaign` com discriminante `type`
- Agendamento e janela de horário funcionam sem código adicional
- Frontend distingue o tipo pelo campo `type: 'status'` na listagem

**Negativas / limitações aceitas:**
- Sem métricas de visualização (limitação da plataforma, não do sistema)
- Suporte a vídeo depende da versão do WAHA — documentado como limitação
- Status expira em 24h no WhatsApp — comportamento da plataforma, fora do controle

---

## ADRs relacionados

- **ADR-023** — Orquestrador de Envio Único: o SenderService que processa campanhas de status é o mesmo orquestrador central definido neste ADR
- **ADR-026** — Suporte pós-venda: Status é um canal adequado para comunicados a clientes ativos sem gerar ticket de suporte

---

## Implementação

| Arquivo | Responsabilidade |
|---------|-----------------|
| `shared/waha/waha-client.service.ts` | `sendStatusText()` e `sendStatusImage()` |
| `application/sender/sender.service.ts` | Handler `type: 'status'` no tick |
| `presentation/http/sender/sender.controller.ts` | `CreateCampaignDto` aceita `type: 'status'` |
| `sender.service.spec.ts` | Testes: texto, imagem, agendamento, WAHA offline |

PRD completo: `docs/features/campaigns/whatsapp-status.md`
