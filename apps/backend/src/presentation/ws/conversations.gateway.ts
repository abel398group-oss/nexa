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
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
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
}

@WebSocketGateway({ cors: { origin: wsCorsOrigin, credentials: true }, path: '/ws' })
export class ConversationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger('ConversationsGateway');

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly handoff: HandoffService,
    private readonly conversations: ConversationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  afterInit(server: Server) {
    // Redis adapter: garante que eventos de socket.io sejam compartilhados entre
    // réplicas do backend. Sem isso, room.emit() só alcança sockets no mesmo processo.
    // Fail-open: se REDIS_URL não estiver configurado, roda sem adapter (single-instance).
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        const pubClient = new Redis(redisUrl, { lazyConnect: true });
        const subClient = pubClient.duplicate();
        server.adapter(createAdapter(pubClient, subClient));
        this.logger.log('WebSocket /ws: Redis adapter configurado');
      } catch (e: any) {
        this.logger.warn(`WebSocket /ws: Redis adapter falhou — rodando single-instance (${e?.message})`);
      }
    } else {
      this.logger.log('WebSocket /ws inicializado (single-instance — REDIS_URL ausente)');
    }
  }

  // ── Conexão: valida token web_chat ou deixa inbox do Nexa passar livremente ──
  async handleConnection(socket: Socket) {
    const token = socket.handshake.auth?.token as string | undefined;

    // Sem token → Nexa inbox (browser do operador). Nenhuma lógica extra.
    if (!token) return;

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
  @SubscribeMessage('join')
  onJoin(@MessageBody() data: { conversationId: string }, @ConnectedSocket() client: Socket) {
    if (data?.conversationId) {
      client.join(`conv:${data.conversationId}`);
      return { joined: data.conversationId };
    }
    return { error: 'conversationId obrigatório' };
  }

  // ── ADR 027 D2: cliente TMS envia mensagem via widget ───────────────────────
  // Salva a mensagem inbound e delega ao ConversationAgent via EventEmitter
  // (WebChatService escuta 'web_chat.inbound' em AgentsModule — sem circular dep).
  @SubscribeMessage('web_chat:send')
  async onWebChatSend(
    @MessageBody() data: { message: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const d = socket.data as Partial<WebChatSocketData>;
    if (!d?.tenantId || !d.conversationId) {
      return { error: 'Sessão inválida. Recarregue a página.' };
    }
    const text = data?.message?.trim();
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
      message: text,
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

  // ── Evento interno: nova mensagem criada → empurra para a sala ───────────────
  @OnEvent('message.created')
  handleMessageCreated(payload: { conversationId: string; message: unknown }) {
    this.server.to(`conv:${payload.conversationId}`).emit('message', payload.message);
  }

  // Recibo (✓✓) atualizado → avisa a sala da conversa pra atualizar o check ao vivo
  @OnEvent('message.updated')
  handleMessageUpdated(payload: { conversationId: string; id: string; ack: number }) {
    this.server.to(`conv:${payload.conversationId}`).emit('message:ack', { id: payload.id, ack: payload.ack });
  }
}
