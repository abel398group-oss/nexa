/**
 * InternalNumbersService — inbound gate for internal phone numbers.
 *
 * Context (2026-07-20 brainstorm, ADR 034/035 prerequisite): the single WAHA
 * number is shared by three outbound flows — Lia (leads), Monitor alerts and
 * seller handoff notifications. Inbound processing used to treat EVERY sender
 * as a potential lead, so a seller replying "ok" to a handoff notification (or
 * an alert contact replying to a digest) became a Contact, opened a
 * conversation and got a sales pitch from Lia.
 *
 * This service classifies a sender phone as "internal" when it belongs to:
 *   1. a Seller (any tenant — the WhatsApp number is shared), or
 *   2. a Monitor alert recipient: TenantNotificationConfig.contacts[].whatsapp,
 *      legacy sectorConfig[sector].phone / .recipients[].contact (whatsapp), or
 *      the root notificationPhone.
 *
 * WhatsappService.process() calls classify() BEFORE creating contact or
 * conversation and discards the message (with an explicit logger.warn — repo
 * rule: no silent drops) when the sender is internal.
 *
 * Scale note: sellers + notification configs are small tables; both lookups
 * are in-memory scans over a findMany. Revisit with a cache if tenant count
 * ever makes this hot.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

export interface InternalMatch {
  internal: boolean;
  /** Human-readable reason for logs, e.g. `vendedor João (t1)` */
  reason?: string;
}

/** Strips everything but digits. */
const digits = (v: unknown): string => (typeof v === 'string' ? v.replace(/\D/g, '') : '');

/**
 * Tolerant BR phone comparison: exact digit match, or suffix match when both
 * have >= 10 digits (tolerates a stored contact missing the "55" country code
 * or an extra formatting prefix). 10 = DDD + 8-digit line (worst case).
 */
export function phonesMatch(a: string, b: string): boolean {
  const da = digits(a);
  const db = digits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 10 && db.length >= 10) {
    return da.endsWith(db) || db.endsWith(da);
  }
  return false;
}

@Injectable()
export class InternalNumbersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Classifies a sender phone. `phone` is the normalized inbound number (digits, 55DDD…). */
  async classify(phone: string): Promise<InternalMatch> {
    const target = digits(phone);
    if (!target) return { internal: false };

    // TEST WHITELIST (Abel, 2026-07-20): comma-separated phones in
    // GATE_TEST_PHONES bypass the gate ON PURPOSE — the team's own numbers are
    // registered as Monitor recipients/sellers, which would make testing Lia
    // from their phones impossible. Deliberate, controlled hole in the gate:
    // keep the list SHORT and remove numbers when testing ends.
    const whitelist = (process.env.GATE_TEST_PHONES ?? '')
      .split(',')
      .map((p) => digits(p))
      .filter(Boolean);
    if (whitelist.some((w) => phonesMatch(target, w))) {
      return { internal: false };
    }

    // Support-desk WhatsApp (SUPPORT_WHATSAPP — escalation notifications):
    // replying to those notifications must never become a lead.
    const supportWa = digits(process.env.SUPPORT_WHATSAPP ?? '');
    if (supportWa && phonesMatch(target, supportWa)) {
      return { internal: true, reason: 'WhatsApp do suporte (SUPPORT_WHATSAPP)' };
    }

    // 1) Sellers — any tenant (single shared WhatsApp number).
    const sellers = await this.prisma.seller.findMany({
      select: { name: true, phone: true, tenantId: true },
    });
    for (const s of sellers) {
      if (phonesMatch(target, s.phone ?? '')) {
        return { internal: true, reason: `vendedor ${s.name} (${s.tenantId})` };
      }
    }

    // 2) Monitor alert recipients — every tenant's notification config.
    const configs = await this.prisma.tenantNotificationConfig.findMany({
      select: { tenantId: true, notificationPhone: true, sectorConfig: true, contacts: true },
    });
    for (const cfg of configs) {
      if (phonesMatch(target, cfg.notificationPhone ?? '')) {
        return { internal: true, reason: `contato de alerta (notificationPhone, ${cfg.tenantId})` };
      }

      const contacts = (cfg.contacts as Array<{ name?: string; whatsapp?: string }> | null) ?? [];
      for (const c of contacts) {
        if (phonesMatch(target, c?.whatsapp ?? '')) {
          return {
            internal: true,
            reason: `contato de alerta ${c?.name ?? 'sem nome'} (${cfg.tenantId})`,
          };
        }
      }

      const sectorCfg = (cfg.sectorConfig as Record<string, any> | null) ?? {};
      for (const [sector, sc] of Object.entries(sectorCfg)) {
        if (phonesMatch(target, sc?.phone ?? '')) {
          return { internal: true, reason: `contato de alerta setor ${sector} (${cfg.tenantId})` };
        }
        const recipients: Array<{ contact?: string; channel?: string }> = sc?.recipients ?? [];
        for (const r of recipients) {
          if (r?.channel === 'whatsapp' && phonesMatch(target, r?.contact ?? '')) {
            return { internal: true, reason: `contato de alerta setor ${sector} (${cfg.tenantId})` };
          }
        }
      }
    }

    return { internal: false };
  }
}
