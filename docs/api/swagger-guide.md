# Guia Swagger / OpenAPI — Nexa

> O pacote `@nestjs/swagger` já está instalado no backend.
> **⚠️ A ativação no código é pendente de implementação pela equipe.**

---

## 1. O que precisa ser implementado

### 1.1 Ativar Swagger no `main.ts`

```typescript
// apps/backend/src/main.ts — adicionar ANTES de app.listen()
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('Nexa API')
  .setDescription('API da plataforma Nexa — IA de vendas e suporte para frotas')
  .setVersion('1.0')
  .addCookieAuth('access_token') // autenticação via cookie HttpOnly
  .addTag('auth', 'Autenticação e sessões')
  .addTag('contacts', 'Gestão de contatos')
  .addTag('conversations', 'Conversas e mensagens')
  .addTag('campaigns', 'Campanhas de disparo')
  .addTag('knowledge', 'Base de conhecimento')
  .addTag('metrics', 'Métricas e relatórios')
  .addTag('admin', 'Administração da plataforma')
  .addTag('whatsapp', 'Integração WhatsApp / WAHA')
  .addTag('email', 'Canal de e-mail')
  .build();

const document = SwaggerModule.createDocument(app, config);

// Em produção: proteger a rota /api/docs com autenticação básica
if (process.env.NODE_ENV !== 'production') {
  SwaggerModule.setup('api/docs', app, document);
} else {
  // Expor só para IPs internos ou com auth básica
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
```

### 1.2 Adicionar decorators nos DTOs e controllers

```typescript
// Exemplo num controller (presentation/http/contacts/contacts.controller.ts)
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

@ApiTags('contacts')
@Controller('contacts')
export class ContactsController {
  @Get()
  @ApiOperation({ summary: 'Listar contatos do tenant' })
  @ApiQuery({ name: 'search', required: false, description: 'Busca por nome, telefone ou e-mail' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'opted_out'] })
  @ApiResponse({ status: 200, description: 'Lista paginada de contatos' })
  findAll() { ... }
}

// Exemplo num DTO
import { ApiProperty } from '@nestjs/swagger';

export class CreateContactDto {
  @ApiProperty({ example: '5511994327713', description: 'Número WhatsApp com DDI' })
  phone: string;

  @ApiProperty({ example: 'João Silva', required: false })
  name?: string;
}
```

---

## 2. Onde acessar após implementação

| Ambiente | URL |
|----------|-----|
| Local (dev) | http://localhost:3001/api/docs |
| Produção | https://app.nexa.com.br/api/docs *(proteger com auth básica)* |

---

## 3. Endpoints principais já existentes

A tabela abaixo documenta os endpoints reais do sistema para referência enquanto o Swagger não é ativado.

### Autenticação

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/login` | Login — retorna access + refresh token (cookie) |
| POST | `/api/auth/refresh` | Renovar access token via refresh token |
| POST | `/api/auth/logout` | Revogar sessão |
| GET | `/api/auth/me` | Dados do usuário autenticado |

### Contatos

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/contacts` | Listar (paginado, filtros: search, tag, status) |
| POST | `/api/contacts` | Criar contato |
| PATCH | `/api/contacts/:id` | Atualizar contato |
| DELETE | `/api/contacts/:id` | Excluir contato |
| POST | `/api/contacts/import` | Importar lista (array) |
| PATCH | `/api/contacts/:id/opt-out` | Marcar como opt-out |
| GET | `/api/contacts/tags` | Tags distintas com contagem |
| POST | `/api/contacts/bulk-tag` | Adicionar/remover tag em lote |
| POST | `/api/contacts/bulk-delete` | Excluir em lote |

### Conversas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/conversations` | Listar conversas abertas |
| GET | `/api/conversations/:id/messages` | Mensagens de uma conversa |
| POST | `/api/conversations/:id/assign` | Atribuir vendedor |
| POST | `/api/conversations/:id/close` | Fechar conversa |
| POST | `/api/conversations/:id/reply` | Resposta manual do operador |

### Campanhas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/campaigns` | Listar campanhas |
| POST | `/api/campaigns` | Criar campanha |
| POST | `/api/campaigns/:id/start` | Iniciar disparo |
| POST | `/api/campaigns/:id/pause` | Pausar |
| GET | `/api/campaigns/:id/targets` | Destinatários e status |

### Métricas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/metrics/overview` | KPIs gerais (contacts, conversations, AI, campaigns) |
| GET | `/api/metrics/timeseries` | Série temporal diária |
| GET | `/api/metrics/support` | KPIs de suporte |
| GET | `/api/metrics/sellers` | Performance por vendedor |

### Administração

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/admin/autonomy` | Estado do kill switch da IA |
| POST | `/api/admin/autonomy` | Ligar/desligar IA (master/whatsapp/email) |
| GET | `/api/admin/tenants` | Listar tenants (platform admin) |
| POST | `/api/admin/tenants/:id/enter` | Entrar como tenant |

### Outros

| Módulo | Prefixo |
|--------|---------|
| Knowledge (KB) | `/api/knowledge` |
| WhatsApp | `/api/whatsapp` |
| Canal E-mail | `/api/email` |
| Vendedores | `/api/sellers` |
| Handoff | `/api/handoff` |
| Portal (clientes TMS) | `/api/portal` |
| Health | `/api/health` |

---

## 4. Autenticação nas chamadas de API

O Nexa usa **cookie HttpOnly** para autenticação, não Bearer token.

```bash
# Login
curl -c cookies.txt -X POST https://app.nexa.com.br/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.com","password":"senha"}'

# Usar cookie em chamadas subsequentes
curl -b cookies.txt https://app.nexa.com.br/api/metrics/overview
```
