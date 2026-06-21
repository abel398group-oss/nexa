/** Interface agnóstica de canal — Fase 1: WAHA. Fase 2: Z-API / Twilio. */
export interface NotificationChannel {
  send(tenantId: string, message: string): Promise<void>;
}

export const NOTIFICATION_CHANNEL = 'NOTIFICATION_CHANNEL';
