/**
 * ConversationsGateway — WebSocket /ws
 *
 * Dois modos de conexão:
 *
 *   1. Nexa inbox (sem token no handshake)
 *      Frontend do Nexa entra via evento 'join' para receber mensagens ao vivo.
 *      Nenhuma lógica especial no handleConnection — a sala é criada pelo 'join'.
 *
 *   2. Web chat TMS (ADR 027 — com token no handshake)
 *      Widget embutido no HiperTMS conecta com socket.handshake.auth.token.
 *      handleConnection valida o token (HandoffService), vincula identidade ao socket,
 *      cria/reutiliza a AiConversation, entra na sala automaticamente e envia histórico.
 *      Mensagens enviadas via 'web_chat:send' são roteadas ao ConversationAgent via
 *      EventEmitter ('web_chat.inbound') → resposta volta por 'message.created' → sala.
 */
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { createRedisClient } from '@/shared/redis/redis.factory';
import { HandoffService } from '@/application/handoff/handoff.service';
import { ConversationsService } from '@/application/conversations/conversations.service';

// CORS do WebSocket: mesma allowlist do HTTP (CORS_ORIGINS, ver main.ts) — fonte única.
// Função lazy: lê o env no handshake (evita problema de ordem de carregamento do .env).
// Requisições sem Origin (same-origin / server-to-server) são aceitas; origem fora da
// lista é recusada. Trocar origin:true (qualquer origem) por allowlist explícita.
function wsCorsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  // Em desenvolvimento libera qualquer origem (evita fricção com portas locais,
  // ex.: frontend em :5174 atrás do proxy do Vite). Em produção, exige a allowlist
  // de WEBCHAT_ALLOWED_ORIGINS (TMS) + CORS_ORIGINS (Nexa frontend).
  if (process.env.NODE_ENV !== 'production') return callback(null, true);
  const allowed = [
    ...(process.env.CORS_ORIGINS ?? '').split(','),
    ...(process.env.WEBCHAT_ALLOWED_ORIGINS ?? '').split(','),
  ]
    .map((o) => o.trim())
    .filter(Boolean);
  if (!origin || allowed.includes(origin)) return callback(null, true);
  return callback(new Error(`Origin não permitida pelo WebSocket: ${origin}`), false);
}

/** Dados vinculados ao socket de um cliente web_chat após autenticação. */
interface WebChatSocketData {
  tenantId: string;
  externalId: string;
  name: string | null;
  conversationId: string;
  // F10 (contexto do widget, 2026-08-06): tela de origem do handoff — já vinha
  // no token (`HandoffContext.page`) mas morria aqui, no socket. A Lia nunca
  // sabia de qual tela o cliente veio, mesmo o dado já estando disponível.
  page: string | null;
}

@WebSocketGateway({ cors: { origin: wsCorsOrigin, credentials: true }, path: '/ws' })
export class ConversationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger('ConversationsGateway');
  // BUG-008 fix: salvar referências para fechar no destroy (evita leak de conexões Redis)
  private redisPub: Redis | null = null;
  private redisSub: Redis | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly handoff: HandoffService,
    private readonly conversations: ConversationsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly jwt: JwtService,
  ) {}

  async onModuleDestroy() {
    await this.redisPub?.quit().catch(() => null);
    await this.redisSub?.quit().catch(() => null);
  }

  afterInit(server: Server) {
    // Redis adapter: garante que eventos de socket.io sejam compartilhados entre
    // réplicas do backend. Sem isso, room.emit() só alcança sockets no mesmo processo.
    // Fail-open: sem REDIS_URL (ou com o Redis fora), roda single-instance.
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.log('WebSocket /ws inicializado (single-instance — REDIS_URL ausente)');
      return;
    }
    // Conecta ANTES de entregar os clientes ao adapter.
    //
    // `createAdapter()` dispara SUBSCRIBE no ato, e a promise desse comando é
    // interna à biblioteca — ninguém a captura. Com o Redis fora, os dois clientes
    // rejeitavam com MaxRetriesPerRequestError e o par virava duas
    // unhandledRejection a cada tentativa de reconexão. Era essa a origem do laço
    // que derrubava o backend no boot sem Redis (07/08/2026).
    //
    // Conectando antes, a falha vira um erro capturável aqui e o adapter
    // simplesmente não é instalado — degradação explícita em vez de crash.
    void (async () => {
      const pub = createRedisClient(redisUrl, 'ws-pub');
      const sub = createRedisClient(redisUrl, 'ws-sub');
      try {
        await Promise.all([pub.connect(), sub.connect()]);
        this.redisPub = pub;
        this.redisSub = sub;
        server.adapter(createAdapter(pub, sub));
        this.logger.log('WebSocket /ws: Redis adapter configurado');
      } catch (e: any) {
        this.logger.warn(
          `WebSocket /ws: Redis inacessível — rodando single-instance, eventos NÃO são ` +
          `compartilhados entre réplicas (${e?.message})`,
        );
        // Desconecta o par para não deixar dois clientes tentando reconectar à toa.
        pub.disconnect();
        sub.disconnect();
      }
    })();
  }

  // ── Conexão: valida token web_chat ou extrai tenantId do cookie para inbox Nexa ──
  async handleConnection(socket: Socket) {
    const token = socket.handshake.auth?.token as string | undefined;

    // Sem token → Nexa inbox (browser do operador).
    // Extrai tenantId do cookie access_token para validar ownership no 'join' (SEC-005).
    if (!token) {
      const cookies = socket.handshake.headers.cookie ?? '';
      const match = /(?:^|;\s*)access_token=([^;]+)/.exec(cookies);
      if (match) {
        try {
          const payload = this.jwt.verify(match[1]) as { sub: string; tenantId: string | null };
          (socket.data as any).tenantId = payload.tenantId;
          // Cookie válido = socket do time (Inbox), não do widget do cliente.
          // Flag separada de propósito: o platform admin tem tenantId NULL, e
          // usar `tenantId` como prova de "é do time" excluía justamente ele da
          // sala de staff — nota interna nunca chegava na tela dele em tempo
          // real. Autenticação e escopo de tenant são perguntas diferentes.
          (socket.data as any).isStaff = true;
        } catch {
          // Token inválido/expirado: socket conecta sem tenantId; join será rejeitado
          this.logger.warn(`inbox: cookie JWT inválido — socket ${socket.id} sem tenantId`);
        }
      }
      return;
    }

    // Com token → widget TMS (ADR 027). Valida e consome (uso único — anti-replay).
    const ctx = await this.handoff.consume(token).catch(() => null);
    if (!ctx) {
      this.logger.warn(`web_chat: token inválido/expirado — desconectando socket ${socket.id}`);
      socket.emit('web_chat:error', {
        code: 'TOKEN_INVALID',
        message: 'Sessão expirada. Recarregue a página para reconectar.',
      });
      socket.disconnect(true);
      return;
    }

    // Vincula identidade ao socket (persiste durante toda a sessão WS)
    const { conversationId } = await this.conversations.findOrCreateWebChat(
      ctx.tenantId,
      ctx.externalId,
      ctx.name ?? null,
    );
    (socket.data as WebChatSocketData) = {
      tenantId: ctx.tenantId,
      externalId: ctx.externalId,
      name: ctx.name ?? null,
      page: ctx.page ?? null,
      conversationId,
    };

    // Auto-join na sala da conversa (mensagens novas chegam automaticamente)
    socket.join(`conv:${conversationId}`);

    // Envia histórico + estado inicial para o widget
    const messages = await this.conversations.getMessages(ctx.tenantId, conversationId).catch(() => []);
    socket.emit('web_chat:ready', { conversationId, name: ctx.name, messages });

    this.logger.log(
      `web_chat connect: ext=${ctx.externalId} tenant=${ctx.tenantId} conv=${conversationId.slice(0, 8)} msgs=${messages.length}`,
    );
  }

  handleDisconnect(socket: Socket) {
    const d = socket.data as Partial<WebChatSocketData>;
    if (d?.externalId) {
      this.logger.log(
        `web_chat disconnect: ext=${d.externalId} conv=${d.conversationId?.slice(0, 8)}`,
      );
    }
  }

  // ── Nexa inbox: entra na sala de uma conversa ────────────────────────────────
  // SEC-005: valida que a conversa pertence ao tenant do operador autenticado.
  @SubscribeMessage('join')
  async onJoin(@MessageBody() data: { conversationId: string }, @ConnectedSocket() client: Socket) {
    if (!data?.conversationId) return { error: 'conversationId obrigatório' };

    const tenantId = (client.data as any)?.tenantId as string | undefined;
    if (tenantId) {
      // Garante que o operador só entra em salas do próprio tenant
      const conv = await this.conversations.findOne(tenantId, data.conversationId).catch(() => null);
      if (!conv) {
        this.logger.warn(
          `join rejeitado: conv=${data.conversationId.slice(0, 8)} tenant=${tenantId} socket=${client.id}`,
        );
        return { error: 'Conversa não encontrada ou sem permissão' };
      }
    }

    client.join(`conv:${data.conversationId}`);
    // F12: só quem entra por AQUI (inbox do operador, autenticado por cookie)
    // também entra na sala "staff" — o widget do cliente (handleConnection,
    // canal web_chat/portal) nunca chama 'join' e nunca ganha esta sala. É o
    // que garante que handleMessageCreated() consiga separar nota interna de
    // mensagem pro cliente: a sala staff nunca tem um socket de cliente dentro.
    //
    // Usa `isStaff`, não `tenantId`: o platform admin tem tenantId null e ficava
    // de fora da própria sala de staff — nota interna, e depois os eventos de
    // editar/excluir, nunca chegavam em tempo real na tela dele.
    if ((client.data as any)?.isStaff) client.join(`staff:conv:${data.conversationId}`);
    return { joined: data.conversationId };
  }

  // ── ADR 027 D2: cliente TMS envia mensagem via widget ───────────────────────
  // Salva a mensagem inbound e delega ao ConversationAgent via EventEmitter
  // (WebChatService escuta 'web_chat.inbound' em AgentsModule — sem circular dep).
  @SubscribeMessage('web_chat:send')
  async onWebChatSend(
    // Contrato ADR 027: o widget TMS envia { body }; aceita { message } por compat.
    @MessageBody() data: { message?: string; body?: string; category?: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const d = socket.data as Partial<WebChatSocketData>;
    if (!d?.tenantId || !d.conversationId) {
      return { error: 'Sessão inválida. Recarregue a página.' };
    }
    const text = (data?.message ?? data?.body)?.trim();
    if (!text) return { error: 'Mensagem vazia.' };

    // Persiste mensagem inbound (o evento message.created chegará de volta via @OnEvent)
    await this.conversations
      .addMessage(d.tenantId, d.conversationId, {
        direction: 'inbound',
        content: text,
        intent: 'support_query',
      })
      .catch((err: any) => this.logger.warn(`addMessage inbound falhou: ${err?.message}`));

    // Dispara processamento assíncrono — resposta volta pelo 'message.created' → sala
    this.eventEmitter.emit('web_chat.inbound', {
      tenantId: d.tenantId,
      conversationId: d.conversationId,
      externalId: d.externalId,
      name: d.name,
      page: d.page,
      message: text,
      // O widget do TMS OBRIGA o cliente a escolher um setor antes de enviar
      // (Fiscal/Frota/Financeiro/Logística/Sistema/Outro). O campo era declarado
      // aqui e descartado logo em seguida — impunha fricção ao cliente por um dado
      // que ia para o lixo. Agora chega ao classificador como indício.
      sector: typeof data?.category === 'string' ? data.category : undefined,
    });

    return { ok: true };
  }

  // ── ADR 027: histórico sob demanda (ex.: ao abrir o widget sem reconectar) ──
  @SubscribeMessage('web_chat:history')
  async onWebChatHistory(@ConnectedSocket() socket: Socket) {
    const d = socket.data as Partial<WebChatSocketData>;
    if (!d?.tenantId || !d.conversationId) return { error: 'Sessão inválida.' };
    const messages = await this.conversations
      .getMessages(d.tenantId, d.conversationId)
      .catch(() => []);
    return { messages };
  }

  // ── Nexa inbox: subscribe a atualizações da lista (novas conversas / atividade) ─
  // O frontend emite join_inbox após conectar; o backend coloca o socket na sala tenant:<id>.
  // Quando qualquer conversa desse tenant receber uma mensagem, 'inbox:update' é emitido.
  @SubscribeMessage('join_inbox')
  onJoinInbox(@MessageBody() data: { tenantId?: string }, @ConnectedSocket() client: Socket) {
    const socketTenantId = (client.data as any)?.tenantId as string | null | undefined;
    // Operadores normais: tenantId vem do JWT. Platform admin: envia o acting tenant.
    const effectiveTenantId = socketTenantId ?? data?.tenantId;
    if (!effectiveTenantId) return { error: 'tenantId obrigatório' };
    client.join(`tenant:${effectiveTenantId}`);
    (client.data as any).inboxTenantId = effectiveTenantId;
    return { joined: `tenant:${effectiveTenantId}` };
  }

  // ── Etapa 2A: nota interna editada/removida → só a sala de staff ────────────
  // Ambos os eventos nascem exclusivamente de updateInternalNote/deleteInternalNote,
  // que só operam sobre isInternal=true — por isso vão direto pra staff:conv:<id>,
  // nunca pra conv:<id> (onde o widget do cliente está conectado).
  //
  // Sem isto, um segundo analista com a mesma conversa aberta continuaria vendo
  // a nota antiga na tela — e no caso da exclusão (motivada por dado sensível
  // colado por engano) o dado seguiria à vista dele até recarregar, que é
  // justamente o cenário que a exclusão existe pra resolver.
  // Nome próprio de propósito: `message.updated` JÁ EXISTE neste gateway e é o
  // recibo (ack) do WhatsApp — reusá-lo faria o handler de ack disparar com
  // payload incompatível e emitir um `message:ack` lixo para conv:<id>, que é
  // a sala onde o widget do CLIENTE está conectado.
  @OnEvent('internal_note.updated')
  handleInternalNoteUpdated(payload: { conversationId: string; message: unknown }) {
    this.server.to(`staff:conv:${payload.conversationId}`).emit('message:updated', payload.message);
  }

  @OnEvent('internal_note.deleted')
  handleInternalNoteDeleted(payload: { conversationId: string; messageId: string }) {
    this.server
      .to(`staff:conv:${payload.conversationId}`)
      .emit('message:deleted', { id: payload.messageId });
  }

  // ── Evento interno: nova mensagem criada → empurra para a sala ───────────────
  @OnEvent('message.created')
  handleMessageCreated(payload: { conversationId: string; message: unknown }) {
    const m = payload.message as {
      id?: string;
      content?: string;
      direction?: string;
      createdAt?: Date | string;
      isInternal?: boolean;
    } | null;

    // F12: nota interna nunca entra na sala compartilhada com o cliente
    // (conv:<id> tem tanto o operador quanto o widget do cliente conectados —
    // ver onJoin/handleConnection). Vai só pra staff:conv:<id>, sala que o
    // widget do cliente nunca ganha. Retorna cedo: não gera web_chat:message.
    if (m?.isInternal) {
      this.server.to(`staff:conv:${payload.conversationId}`).emit('message', payload.message);
      return;
    }

    const room = `conv:${payload.conversationId}`;
    this.server.to(room).emit('message', payload.message);
    // Contrato ADR 027 do widget TMS: evento 'web_chat:message' { id, body, isAgent, createdAt }.
    // Só outbound (resposta da Lia/operador): o widget já ecoa a própria mensagem localmente.
    if (m?.id && m.content != null && m.direction === 'outbound') {
      this.server.to(room).emit('web_chat:message', {
        id: m.id,
        body: m.content,
        isAgent: true,
        createdAt: m.createdAt ?? new Date().toISOString(),
      });
    }
  }

  // ── Evento interno: conversa teve atividade → atualiza lista do inbox ─────────
  @OnEvent('conversation.updated')
  handleConversationUpdated(payload: { tenantId: string; conversationId: string }) {
    this.server
      .to(`tenant:${payload.tenantId}`)
      .emit('inbox:update', { conversationId: payload.conversationId });
  }

  // Recibo (✓✓) atualizado → avisa a sala da conversa pra atualizar o check ao vivo
  @OnEvent('message.updated')
  handleMessageUpdated(payload: { conversationId: string; id: string; ack: number }) {
    this.server.to(`conv:${payload.conversationId}`).emit('message:ack', { id: payload.id, ack: payload.ack });
  }
}
