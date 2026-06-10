/**
 * EmailImapService — ADR 021
 *
 * Polling IMAP para receber e-mails da caixa lia@hipertms.com.br.
 * Roda a cada 60s (configurável via EMAIL_POLL_INTERVAL_SEC).
 *
 * Configuração via EmailChannel no banco (por tenant) ou .env:
 *   EMAIL_IMAP_HOST   mail.hipertms.com.br
 *   EMAIL_IMAP_PORT   993
 *   EMAIL_IMAP_USER   lia@hipertms.com.br
 *   EMAIL_IMAP_PASS   <senha>
 *
 * Fluxo por e-mail novo:
 *   1. Busca não-lidos na INBOX
 *   2. Normaliza remetente/assunto/body
 *   3. Passa para EmailService.process() (mesmo pipeline do webhook)
 *   4. Marca como lido (SEEN)
 *   5. Atualiza lastPollAt no banco
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as imapSimple from 'imap-simple';
import { simpleParser } from 'mailparser';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EmailService } from './email.service';

const POLL_INTERVAL_SEC = Number(process.env.EMAIL_POLL_INTERVAL_SEC ?? 60);

interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  mailbox: string;
  tenantId: string;
}

@Injectable()
export class EmailImapService implements OnModuleInit {
  private readonly logger = new Logger('EmailImap');
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit() {
    // Aguarda 10s após boot para não conflitar com migrations/seed
    setTimeout(() => this.startPolling(), 10_000);
  }

  private startPolling() {
    this.logger.log(`IMAP polling iniciado (intervalo: ${POLL_INTERVAL_SEC}s)`);
    // Primeira verificação imediata
    this.pollAll().catch((e) => this.logger.error(`Poll inicial: ${e?.message}`));
    // Intervalo recorrente
    this.timer = setInterval(() => {
      this.pollAll().catch((e) => this.logger.error(`Poll: ${e?.message}`));
    }, POLL_INTERVAL_SEC * 1000);
  }

  /** Busca todos os EmailChannels ativos com IMAP configurado. */
  private async getConfigs(): Promise<ImapConfig[]> {
    // Primeiro tenta o banco
    const channels = await this.prisma.emailChannel
      .findMany({ where: { isActive: true } })
      .catch(() => []);

    const fromDb: ImapConfig[] = channels
      .filter((c) => c.imapUser && c.imapPass)
      .map((c) => ({
        host: c.imapHost,
        port: c.imapPort,
        user: c.imapUser,
        pass: c.imapPass,
        mailbox: c.imapMailbox,
        tenantId: c.tenantId,
      }));

    if (fromDb.length > 0) return fromDb;

    // Fallback .env (tenant "default")
    const host = process.env.EMAIL_IMAP_HOST;
    const user = process.env.EMAIL_IMAP_USER;
    const pass = process.env.EMAIL_IMAP_PASS;
    if (!host || !user || !pass) return [];

    return [{
      host,
      port: Number(process.env.EMAIL_IMAP_PORT ?? 993),
      user,
      pass,
      mailbox: process.env.EMAIL_IMAP_MAILBOX ?? 'INBOX',
      tenantId: 'default',
    }];
  }

  /** Poll todas as caixas configuradas. */
  async pollAll() {
    const configs = await this.getConfigs();
    if (configs.length === 0) return; // nenhuma caixa configurada — silencioso

    for (const cfg of configs) {
      await this.pollOne(cfg).catch((e) =>
        this.logger.error(`Erro ao fazer poll de ${cfg.user}: ${e?.message}`),
      );
    }
  }

  private async pollOne(cfg: ImapConfig) {
    const connection = await imapSimple.connect({
      imap: {
        user: cfg.user,
        password: cfg.pass,
        host: cfg.host,
        port: cfg.port,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }, // Hostgator cPanel cert
        authTimeout: 8000,
      },
    });

    try {
      await connection.openBox(cfg.mailbox);

      // Busca e-mails não-lidos
      const messages = await connection.search(['UNSEEN'], {
        bodies: [''],   // corpo completo (raw)
        markSeen: false, // não marca ainda — só após processar
      });

      if (messages.length === 0) {
        this.logger.debug(`IMAP ${cfg.user}: nenhum e-mail novo`);
        return;
      }

      this.logger.log(`IMAP ${cfg.user}: ${messages.length} e-mail(s) novo(s)`);

      for (const msg of messages) {
        const raw = msg.parts.find((p: any) => p.which === '')?.body ?? '';
        const parsed = await simpleParser(raw);

        const fromAddress = parsed.from?.value?.[0]?.address ?? '';
        const subject = parsed.subject ?? '(sem assunto)';
        const bodyText = (parsed.text ?? '').trim();

        if (!fromAddress || !bodyText) {
          this.logger.debug(`IMAP: e-mail sem remetente/corpo — ignorado`);
          continue;
        }

        // Constrói payload no mesmo formato que o webhook Mailgun esperava
        const payload: Record<string, string> = {
          from: parsed.from?.text ?? fromAddress,
          subject,
          'stripped-text': bodyText,
          // IMAP não tem SPF/DKIM automático — não forçamos fail (deixamos passar)
        };

        await this.emailService.process(payload, cfg.tenantId);

        // Marca como lido após processar com sucesso
        await connection.addFlags(msg.attributes.uid, ['\\Seen']);
      }

      // Atualiza lastPollAt no banco
      await this.prisma.emailChannel
        .updateMany({ where: { tenantId: cfg.tenantId }, data: { lastPollAt: new Date() } })
        .catch(() => null);
    } finally {
      connection.end();
    }
  }
}
