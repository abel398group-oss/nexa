# Princípio de Design — Sistema Proativo

> **Regra central:** o sistema deve avisar o usuário *antes* do problema acontecer,
> com tempo suficiente para agir. Nunca apenas registrar o que já foi tarde demais.

---

## A diferença entre reativo e proativo

| Reativo (errado) | Proativo (correto) |
|---|---|
| CNH venceu → sistema registra | CNH vence em 30 dias → sistema avisa |
| Caminhão quebrou → ordem de serviço aberta | Km de troca de óleo chegando → sistema avisa com 500 km de antecedência |
| Conta venceu → cobrar juros | Conta vence em 3 dias → sistema avisa |
| CT-e rejeitado → retrabalho manual | CT-e pendente há X horas → sistema avisa antes do prazo SEFAZ |

Um sistema reativo documenta falhas. Um sistema proativo as evita.

---

## As 5 regras do sistema proativo

### 1. Avise com antecedência suficiente para agir

Cada alerta deve respeitar uma janela mínima de ação:

| Categoria | Antecedência mínima |
|---|---|
| CNH / documentos de validade | 30 dias |
| Manutenção por data | 7 dias |
| Manutenção por km | 500 km |
| Contas a pagar/receber | 3 dias |
| Cotações vencendo | janela configurável |
| CT-e sem autorização SEFAZ | horas (não dias) |

Se o alerta chega depois que o prazo passou, falhou — mesmo que tecnicamente correto.

### 2. Consolide — não dispare um alerta por evento

O usuário não pode receber 15 mensagens de WhatsApp por dia.
O sistema consolida todos os alertas do dia em **uma única mensagem por tenant**,
enviada no horário configurado. Dentro da mensagem, a ordem é sempre:
CRITICAL → OVERDUE → DUE_SOON → INFO.

### 3. Diga o que fazer, não só o que está errado

Todo alerta inclui um `actionPath` — o link direto para a tela onde o problema é resolvido.
Não basta dizer "CRLV vencendo". O sistema diz "CRLV vencendo → acesse /fleet/vehicles/xxx".

### 4. Desapareça quando o problema for resolvido

Alertas têm ciclo de vida: DETECTED → NOTIFIED → RESOLVED.
Quando o usuário resolve o problema (renova a CNH, faz a manutenção, paga a conta),
o alerta some automaticamente na próxima avaliação. Não precisa fechar manualmente.

### 5. Escale a severidade corretamente

```
CRITICAL  → risco imediato / já está causando problema (caminhão não pode rodar)
OVERDUE   → prazo passou, urgência alta
DUE_SOON  → prazo chegando, ainda dá tempo
INFO      → informativo, sem urgência
```

Não infle a severidade. Um documento que vence em 25 dias é DUE_SOON, não CRITICAL.
CRITICAL é reservado para o que paralisa a operação agora.

---

## Como aplicar em novos módulos

Sempre que um novo módulo for planejado, responda estas 5 perguntas antes de escrever código:

1. **O que pode dar errado neste domínio?** — listagem de eventos possíveis
2. **Quando o sistema deve avisar?** — janela de antecedência por tipo de evento
3. **Quem recebe o aviso?** — destinatário por tenant
4. **O aviso consolida com outros?** — sempre sim, salvo emergências CRITICAL
5. **O que o usuário faz depois de ler?** — actionPath obrigatório

Se não conseguir responder as 5 perguntas, o módulo não está pronto para ser implementado.

---

## Referências

- ADR-022 — Motor de Proatividade do TMS
- ADR-028 — Monitor Proativo TMS
- ADR-030 — Monitor de Frota via WhatsApp
- `docs/monitor/` — implementações por squad
