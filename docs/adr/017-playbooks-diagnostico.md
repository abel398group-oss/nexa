# ADR 017 — Playbooks de Diagnóstico Guiado

**Status:** Proposto · **Data:** 2026-06

## Contexto

É o **coração** do suporte. Em problemas operacionais a IA NÃO responde de imediato:
ela segue um fluxo de perguntas/checagens até a causa-raiz. Aproveita o módulo `playbook`
já existente no backend. Deriva do ADR 015/016.

## Decisão

### D1 — O que é um playbook

Um fluxo determinístico, por categoria/problema, que combina:
perguntas ao cliente + checagens de dado real (via Connector) → causa → ação/orientação.

A IA conduz a conversa; a **árvore de decisão é fixa** (auditável), não improvisada.

### D2 — Estrutura (modelo)

```yaml
playbook: cte-nao-transmite
categoria: cte
gatilho: ["não consigo emitir", "ct-e não vai", "rejeição"]
passos:
  - perguntar: "Qual o número/código da rejeição?"
  - perguntar: "Qual o ambiente — homologação ou produção?"
  - checar: lookupCustomer + status do CT-e (via Connector)
  - decisao:
      - se rejeicao in [REJEICAO_CADASTRO] -> orientar: corrigir cadastro (KB art. X)
      - se ambiente == homologacao          -> orientar: mudar p/ produção
      - se causa_desconhecida              -> escalar (ADR 016 prioridade)
resolucao:
  acao: "ACTION=orientar|reconsultar_status"   # backend executa (ADR 012)
```

### D3 — Exemplo completo: "Não consigo emitir CT-e"

```
Cliente: "Não consigo emitir CT-e"
  → NÃO responde de cara. Pergunta:
     1. Qual a rejeição? (código/mensagem)
     2. Qual ambiente? (homologação/produção)
     3. Qual transportadora/CNPJ?
     4. Qual o número do CT-e?
  → Diagnostic lê status real no TMS (read-only)
  → Cruza rejeição × playbook → causa
  → Resolution: orienta correção (KB) OU emite ACTION OU escala
```

### D4 — Regras

- Todo playbook é versionado e tem dono (curadoria, igual KB).
- Playbook sem causa após a árvore → escala (não inventa resposta).
- Tema Fiscal/Financeiro segue a regra de escalonamento do ADR 015 D6.
- Cada execução grava trilha (qual passo, qual dado lido) para auditoria.

## Consequências

**Positivas:** resolução consistente e auditável; reduz alucinação; reaproveita módulo playbook existente.

**Custos:** escrever os playbooks por categoria (esforço de conteúdo, não só código);
manter sincronizado com mudanças do TMS.

## Relacionados

ADR 015, 016 · usa ADR 018 (KB) como fonte · gera dado p/ ADR 019.
