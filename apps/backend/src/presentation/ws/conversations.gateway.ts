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

// Gateway de tempo real: o frontend (inbox) entra na "sala" da conversa e recebe
// mensagens novas instantaneamente. Desacoplado via EventEmitter (message.created).
@WebSocketGateway({ cors: { origin: true, credentials: true }, path: '/ws' })
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
