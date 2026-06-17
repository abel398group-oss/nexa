import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';

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
  // do CORS_ORIGINS (mesma do HTTP). Sem Origin (same-origin/server) é aceito.
  if (process.env.NODE_ENV !== 'production') return callback(null, true);
  const allowed = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!origin || allowed.includes(origin)) return callback(null, true);
  return callback(new Error(`Origin não permitida pelo WebSocket: ${origin}`), false);
}

// Gateway de tempo real: o frontend (inbox) entra na "sala" da conversa e recebe
// mensagens novas instantaneamente. Desacoplado via EventEmitter (message.created).
@WebSocketGateway({ cors: { origin: wsCorsOrigin, credentials: true }, path: '/ws' })
export class ConversationsGateway implements OnGatewayInit {
  private readonly logger = new Logger('ConversationsGateway');

  @WebSocketServer()
  server!: Server;

  afterInit() {
    this.logger.log('WebSocket /ws inicializado');
  }

  // Cliente entra na sala de uma conversa
  @SubscribeMessage('join')
  onJoin(@MessageBody() data: { conversationId: string }, @ConnectedSocket() client: Socket) {
    if (data?.conversationId) {
      client.join(`conv:${data.conversationId}`);
      return { joined: data.conversationId };
    }
    return { error: 'conversationId obrigatório' };
  }

  // Quando o service emite 'message.created', empurra para a sala da conversa
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
