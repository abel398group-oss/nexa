# PRD — Knowledge Base (Base de Conhecimento RAG)

## Visão geral

A Knowledge Base é a fonte de verdade da Lia. Ela consulta os artigos mais relevantes antes de gerar qualquer resposta — nunca inventa informações.

## Personas

- Admin do tenant: gerencia artigos (criar, editar, aprovar versões).
- Sistema/Conector: importa conhecimento automaticamente do produto conectado (HiperTMS).
- Lia (IA): consulta em tempo real durante o atendimento (retrieve).

## Escopo

- CRUD de artigos com: topic, category, title, content, tags
- Versionamento: cada edição cria uma nova versão (não aprovada por padrão)
- Aprovação de versão: promove versão para "fonte de verdade"
- Retrieve (RAG): scoring textual por termos — título (3pts) > tags (2pts) > topic (2pts) > conteúdo (1pt)
- Importação do conector: `POST /knowledge/import/:productCode` → chama `connector.getKnowledge()`
- Idempotente: não duplica artigos com mesmo título

## Knowledge do HiperTMS

O conector HiperTMS exporta ~20 artigos cobrindo:
- Visão geral do produto e para quem é
- Glossário de termos (Embarque, CT-e, MDF-e, etc.)
- Módulos: cotações, embarques, viagens, precificação, frota, financeiro, fiscal, compras
- Planos e preços (Básico/Essencial/Profissional)
- Onboarding e implantação
- Suporte e integrações
- Diferenciais vs planilhas e sistemas legados

## Como importar o conhecimento TMS

```
POST /api/knowledge/import/hipertms
Authorization: Bearer {token}
```

Executa `HiperTmsConnector.getKnowledge()` → insere/atualiza artigos no banco do tenant.

## Referências

- Service: `apps/backend/src/application/knowledge/knowledge.service.ts`
- Connector: `apps/backend/src/application/connectors/hipertms.connector.ts` → `getKnowledge()`
