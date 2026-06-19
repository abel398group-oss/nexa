# Manual 01 — Primeiros Passos no Nexa

> Para o operador / gestor que está acessando o Nexa pela primeira vez.
> Versão: 2026-06-19

## O que é o Nexa

O Nexa é a plataforma que abriga a **Lia** — a assistente de IA que vende e dá
suporte ao HiperTMS via WhatsApp. Pelo painel do Nexa você acompanha as conversas,
configura a base de conhecimento da Lia, dispara campanhas e gerencia sua equipe.

## 1. Acessar o painel

1. Abra o navegador e acesse a URL do Nexa (ex.: `https://leads.hipervias.com`).
2. Na tela de login, insira seu **e-mail** e **senha**.
3. Clique em **Entrar**. Se for seu primeiro acesso, use as credenciais enviadas pelo administrador.

> Se a tela exibir "Sessão expirada", clique em **Entrar novamente** — o token de
> acesso dura 15 minutos e ainda não há refresh automático (melhoria planejada).

## 2. Tela inicial — Dashboard

Ao entrar você verá o **Dashboard** com os KPIs gerais:

| Indicador | O que mede |
|---|---|
| Contatos | Total de leads/clientes cadastrados |
| Conversas | Total de conversas ativas e finalizadas |
| % IA Autônoma | Percentual de mensagens enviadas sem intervenção humana |
| Custo IA (US$) | Custo acumulado de tokens da Lia (Claude Haiku) |
| DLQ | Eventos com falha que precisam de atenção |

## 3. Navegar pelo menu lateral

| Ícone / Seção | Para que serve |
|---|---|
| **Inbox** | Conversas em tempo real via WhatsApp |
| **Suporte** | Chamados de clientes TMS (Portal de Suporte) |
| **Contatos** | CRM de leads — cadastro, importação CSV |
| **Campanhas** | Disparos em lote via WhatsApp |
| **Conhecimento** | Base de conhecimento da Lia (KB) |
| **Vendedores** | Cadastro e KPIs da equipe comercial |
| **Usuários** | Gerenciar acessos e permissões (só admin) |

## 4. Conectar o WhatsApp (admin)

> Necessário apenas na primeira configuração. Feito pelo administrador.

1. Acesse **Saúde dos Números** no menu lateral.
2. Cada linha representa um número de WhatsApp cadastrado no WAHA.
3. Verifique se o status está **Conectado** (verde). Se estiver vermelho, o QR Code
   precisa ser lido novamente pelo celular.
4. Para adicionar um número novo: fale com o admin da plataforma.

## 5. Verificar a base de conhecimento da Lia

A Lia só responde com base em conteúdos **aprovados** na KB. Antes de ativar o
atendimento automático, certifique-se de que a KB está populada:

1. Acesse **Conhecimento** no menu lateral.
2. Veja os registros existentes — cada um tem um título, conteúdo e status
   (`rascunho` / `aprovado`).
3. Somente registros com status **Aprovado** são usados pela Lia para responder.
4. Para adicionar: clique em **Novo** → preencha título e conteúdo → clique em
   **Salvar** → depois em **Aprovar**.

## 6. Ativar a autonomia da Lia

Por padrão a Lia entra em modo **rascunho** (sugere, mas não envia automaticamente).
Para ativar o envio automático:

1. No canto superior do painel, clique no ícone de **Kill Switch** (ícone ⚡).
2. Ative o toggle **Autonomia WhatsApp**.
3. Confirme. A Lia passará a responder automaticamente no WhatsApp.

> Para desativar a qualquer momento: mesmo caminho → toggle OFF. A desativação é
> instantânea e sem perda de dados.

## 7. Próximos passos

- [Manual 02 — Inbox e Atendimento](02-inbox-atendimento.md) — como acompanhar e
  assumir conversas
- [Manual 03 — Campanhas](03-campanhas.md) — disparos em lote
- [Manual 04 — Base de Conhecimento](04-base-conhecimento.md) — gerenciar o KB da Lia

## Suporte

Em caso de dúvidas, entre em contato com o time da Hipervias via WhatsApp ou pelo
Portal de Suporte (link na rodapé do painel).
