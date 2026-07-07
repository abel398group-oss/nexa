---
type: manual
tags: [manual, contatos, crm, leads]
updated: 2026-07-07
summary: Manual do usuário — gerenciando contatos e leads no Nexa.
---

# Manual 05 — Contatos e Leads

O módulo de **Contatos** é o CRM leve do Nexa. Armazena leads, clientes e
prospects com histórico completo de conversas e interações.

---

## Criar um contato manualmente

1. Acesse **Contatos → Novo contato**
2. Preencha:
   - **Nome** (obrigatório)
   - **WhatsApp** (obrigatório — formato: `5511999999999`)
   - **Empresa** (opcional)
   - **E-mail** (opcional)
   - **Tags** (opcional)
3. Clique em **Salvar**

> Contatos com WhatsApp válido podem receber mensagens imediatamente.

---

## Importar contatos em lote

1. Acesse **Contatos → Importar**
2. Faça download do template CSV
3. Preencha o CSV:
   - Coluna `nome` (obrigatório)
   - Coluna `whatsapp` (obrigatório)
   - Colunas opcionais: `empresa`, `email`, `tags`
4. Faça upload do arquivo preenchido
5. Revise o preview e confirme

**Regras:**
- WhatsApp deve ter código de país (55 para Brasil)
- Tags separadas por vírgula: `cliente,ativo,tms`
- Duplicatas são ignoradas (mesmo número = atualiza dados)

---

## Tags e segmentação

Tags permitem filtrar e segmentar contatos para campanhas.

**Adicionar tag:**
- No cadastro do contato → campo **Tags**
- Em lote: selecione contatos → **Ações → Adicionar tag**

**Filtrar por tag:**
1. Acesse **Contatos**
2. Use o filtro **"Tag"** na barra de busca

**Tags recomendadas:**
- `lead`, `cliente`, `prospect`, `inativo`
- `tms-ativo`, `tms-trial`, `tms-churn`
- `vip`, `urgente`, `sem-whatsapp`

---

## Histórico de conversas

Cada contato tem um histórico completo:

1. Abra o contato
2. Aba **"Conversas"** — todas as threads do WhatsApp
3. Aba **"Tickets"** — chamados de suporte abertos
4. Aba **"Campanhas"** — disparos recebidos

> O histórico é preservado mesmo se o número mudar de canal.

---

## Vincular contato ao TMS

Contatos do TMS são sincronizados automaticamente quando o conector está ativo.

**Sincronização automática:**
- Clientes do TMS aparecem no Nexa com tag `tms-cliente`
- Dados de empresa e e-mail são importados do TMS
- Atualização em tempo real (webhook)

**Vincular manualmente:**
1. Abra o contato no Nexa
2. Aba **"Integrações"**
3. Clique em **"Vincular ao TMS"**
4. Busque pelo nome ou CNPJ

---

## Exportar contatos

1. Acesse **Contatos**
2. Aplique filtros desejados (tag, status, data)
3. Clique em **"Exportar"** → CSV ou Excel
4. Download automático

> A exportação respeita os filtros ativos. Para exportar tudo, remova os filtros.
