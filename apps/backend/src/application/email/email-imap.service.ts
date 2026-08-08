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
import { EmailCryptoService } from '@/shared/email-crypto/email-crypto.service';
import { EmailBounceService } from './email-bounce.service';

const POLL_INTERVAL_SEC = Number(process.env.EMAIL_POLL_INTERVAL_SEC ?? 60);

/**
 * Maior UID que já existe na caixa, derivado do UIDNEXT que o servidor informa ao
 * abrir a pasta (UIDNEXT é o UID que a PRÓXIMA mensagem vai receber).
 *
 * Serve para plantar a marca d'água inicial numa caixa sem mensagens novas: sem
 * isso, um canal que abriu vazio continuaria dependendo da flag UNSEEN para
 * sempre — justamente a dependência que estamos removendo.
 */
function maiorUidExistente(box: any): number | null {
  const uidNext = Number(box?.uidnext ?? box?.uidNext ?? 0);
  return uidNext > 1 ? uidNext - 1 : null;
}

interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  mailbox: string;
  tenantId: string;
  /** Maior UID já processado nesta caixa (null = ainda sem marca d'água). */
  lastSeenUid: number | null;
  /** UIDVALIDITY registrado junto com a marca — invalida a marca se mudar. */
  uidValidity: number | null;
}

@Injectable()
export class EmailImapService implements OnModuleInit {
  private readonly logger = new Logger('EmailImap');
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly crypto: EmailCryptoService,
    private readonly bounce: EmailBounceService,
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
      .filter((c: any) => c.imapUser && c.imapPass)
      .map((c: any) => ({
        host: c.imapHost,
        port: c.imapPort,
        user: c.imapUser,
        pass: this.crypto.decrypt(c.imapPass), // decripta AES-256-GCM
        mailbox: c.imapMailbox,
        tenantId: c.tenantId,
        lastSeenUid: c.lastSeenUid ?? null,
        uidValidity: c.uidValidity ?? null,
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
      // Sem canal no banco não há onde guardar a marca d'água — este caminho segue
      // por UNSEEN. É fallback de dev; em produção o canal vem do banco.
      lastSeenUid: null,
      uidValidity: null,
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

  /**
   * Grava a marca d'água + lastPollAt. Nunca lança: falhar aqui só faz o próximo
   * poll reprocessar a partir da marca anterior, o que é o lado seguro do erro.
   */
  private async salvarMarca(cfg: ImapConfig, uid: number | null, uidValidity: number | null) {
    await this.prisma.emailChannel
      .updateMany({
        where: { tenantId: cfg.tenantId },
        data: {
          lastPollAt: new Date(),
          ...(uid !== null && uid > 0 ? { lastSeenUid: uid, uidValidity } : {}),
        } as any,
      })
      .catch((e: any) => this.logger.warn(`IMAP ${cfg.user}: falha ao gravar marca d'água — ${e?.message}`));
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
      const box: any = await connection.openBox(cfg.mailbox);
      const uidValidity = Number(box?.uidvalidity ?? box?.uidValidity ?? 0) || null;

      // A marca d'água só vale para a mesma encarnação da caixa. UIDVALIDITY
      // diferente = o servidor reciclou os UIDs (RFC 3501 §2.3.1.1) e comparar
      // números antigos faria o poller pular mensagens novas.
      const marcaValida =
        cfg.lastSeenUid !== null &&
        (cfg.uidValidity === null || uidValidity === null || cfg.uidValidity === uidValidity);

      if (cfg.lastSeenUid !== null && !marcaValida) {
        this.logger.warn(
          `IMAP ${cfg.user}: UIDVALIDITY mudou (${cfg.uidValidity} → ${uidValidity}) — ` +
          'marca d\'água descartada, voltando a buscar por não-lidos nesta rodada',
        );
      }

      // Com marca: tudo acima dela, lido ou não — é o que impede que abrir a caixa
      // no webmail esconda a mensagem do Nexa.
      // Sem marca (primeira execução): mantém o comportamento antigo por não-lidos,
      // para não reprocessar o histórico inteiro da caixa de uma vez.
      const criterio: any[] = marcaValida ? [['UID', `${cfg.lastSeenUid! + 1}:*`]] : ['UNSEEN'];

      const messages = await connection.search(criterio, {
        bodies: [''],    // corpo completo (raw)
        markSeen: false, // marcamos só após processar
      });

      // `UID n:*` devolve SEMPRE a última mensagem da caixa, mesmo que o UID dela
      // seja menor que n — o servidor normaliza a faixa. Sem este filtro, a última
      // mensagem seria reprocessada a cada 60 segundos, para sempre.
      const novas = (messages ?? [])
        .filter((m: any) => !marcaValida || Number(m.attributes?.uid ?? 0) > cfg.lastSeenUid!)
        .sort((a: any, b: any) => Number(a.attributes?.uid ?? 0) - Number(b.attributes?.uid ?? 0));

      if (novas.length === 0) {
        this.logger.debug(`IMAP ${cfg.user}: nenhum e-mail novo`);
        // Ainda assim registra a marca inicial: sem isso um canal que nunca recebeu
        // nada continuaria dependendo da flag UNSEEN indefinidamente.
        await this.salvarMarca(cfg, marcaValida ? cfg.lastSeenUid : maiorUidExistente(box), uidValidity);
        return;
      }

      this.logger.log(`IMAP ${cfg.user}: ${novas.length} e-mail(s) novo(s)`);

      let maiorUidProcessado = cfg.lastSeenUid ?? 0;

      for (const msg of novas) {
        const uid = Number(msg.attributes?.uid ?? 0);
        try {
          const raw = msg.parts.find((p: any) => p.which === '')?.body ?? '';
          const parsed = await simpleParser(raw);

          const fromAddress = parsed.from?.value?.[0]?.address ?? '';
          const subject = parsed.subject ?? '(sem assunto)';
          const bodyText = (parsed.text ?? '').trim();

          // Devolução (DSN) e resposta automática NUNCA entram no pipeline da Lia.
          // Antes desta trava, um `mailer-daemon` virava conversa no Inbox e a Lia
          // respondia a ele — chamada de IA gasta, funil poluído e rate-limit do
          // remetente consumido. Ver EmailBounceService.
          const tipo = this.bounce.classify({
            from: parsed.from?.text ?? fromAddress,
            subject,
            raw: String(raw),
          });

          if (tipo === 'bounce') {
            const info = this.bounce.parse(String(raw));
            this.logger.warn(
              `IMAP ${cfg.user}: uid=${uid} é DEVOLUÇÃO (status=${info.status ?? '?'} ` +
              `destinatário=${info.recipient ?? '?'}) — não vai para a Lia`,
            );
            await this.bounce.record(cfg.tenantId, info);
            await connection.addFlags(uid, ['\\Seen']).catch(() => null);
            if (uid > maiorUidProcessado) maiorUidProcessado = uid;
            continue;
          }

          if (tipo === 'auto_reply') {
            this.logger.log(`IMAP ${cfg.user}: uid=${uid} de ${fromAddress} é resposta automática — não vai para a Lia`);
            await connection.addFlags(uid, ['\\Seen']).catch(() => null);
            if (uid > maiorUidProcessado) maiorUidProcessado = uid;
            continue;
          }

          if (!fromAddress || !bodyText) {
            this.logger.warn(`IMAP ${cfg.user}: uid=${uid} sem remetente ou sem corpo — ignorado`);
          } else {
            // Constrói payload no mesmo formato que o webhook Mailgun esperava
            const payload: Record<string, string> = {
              from: parsed.from?.text ?? fromAddress,
              subject,
              'stripped-text': bodyText,
              // IMAP não tem SPF/DKIM automático — não forçamos fail (deixamos passar)
            };

            const r: any = await this.emailService.process(payload, cfg.tenantId);
            // O process() descarta em silêncio em vários casos (rate-limit, opt-out,
            // corpo vazio). Sem este log, "o lead respondeu e não apareceu no Inbox"
            // fica indistinguível de "o e-mail nem chegou". REGRA 3.
            if (r?.ignored) {
              this.logger.warn(`IMAP ${cfg.user}: uid=${uid} de ${fromAddress} DESCARTADO — motivo: ${r.reason}`);
            }
          }

          await connection.addFlags(uid, ['\\Seen']).catch(() => null);
        } catch (err: any) {
          // Uma mensagem problemática não pode travar a caixa. Antes, o throw
          // abortava o `for` e as mensagens seguintes do lote ficavam paradas até
          // o próximo poll — que tentava o mesmo lote e abortava no mesmo ponto.
          this.logger.error(
            `IMAP ${cfg.user}: falha ao processar uid=${uid} — ${err?.message}. ` +
            'A mensagem foi pulada; reprocessar manualmente se necessário.',
          );
        }
        // Avança a marca mesmo em falha: o erro já está logado com o UID, e não
        // avançar faria o poller repetir a mesma mensagem quebrada para sempre.
        if (uid > maiorUidProcessado) maiorUidProcessado = uid;
      }

      await this.salvarMarca(cfg, maiorUidProcessado, uidValidity);
    } finally {
      connection.end();
    }
  }
}
