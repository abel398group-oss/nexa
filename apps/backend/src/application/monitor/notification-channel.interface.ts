/**
 * Canal de notificação agnóstico de provedor (A2).
 *
 * O canal SÓ ENVIA — a resolução de destinatários (recipients, legado, env)
 * é responsabilidade de quem chama (MonitorNotificationService/Dispatcher).
 * Implementações: WahaNotificationChannel (default) e WhatsAppCloudChannel
 * (API oficial Meta, atrás de MONITOR_WA_PROVIDER=cloud — A5).
 */
export interface NotificationChannel {
  /** Envia `message` para o destinatário `to` (telefone normalizado com DDI). */
  sendTo(tenantId: string, to: string, message: string): Promise<{ sent: boolean; reason?: string }>;
}

export const NOTIFICATION_CHANNEL = 'NOTIFICATION_CHANNEL';
