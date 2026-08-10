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
import { EmailSentIngestService } from './email-sent-ingest.service';

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

/**
 * Nomes usuais da pasta de enviados, na ordem em que valem a tentativa.
 *
 * É o último recurso: primeiro vale o que estiver configurado, depois o atributo
 * `\Sent` que o próprio servidor anuncia (RFC 6154). Esta lista existe para o
 * servidor antigo que não anuncia nada — o Dovecot do cPanel usa `INBOX.Sent`.
 */
const NOMES_DE_ENVIADOS = ['INBOX.Sent', 'Sent', 'INBOX.Sent Items', 'Sent Items', 'Sent Messages'];

interface ImapConfig {
  /**
   * Id da linha em `email_channels`.
   *
   * A marca d'água é gravada POR CAIXA. Enquanto havia uma caixa por tenant dava
   * para escrever por tenantId; com o tenant tendo a caixa da Lia e a do vendedor
   * (perfis de remetente, 10/08/2026), isso passaria o UID de uma para a outra e
   * cada poll esconderia as mensagens novas da outra caixa.
   */
  id: string | null;
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
  /** Pasta de enviados; vazio = descobre pelo servidor. Ver resolverPastaEnviados. */
  sentMailbox: string | null;
  /** Marca d'água própria da pasta de enviados — UID é numerado por pasta. */
  sentLastSeenUid: number | null;
  sentUidValidity: number | null;
}

@Injectable()
export class EmailImapService implements OnModuleInit {
  private readonly logger = new Logger('EmailImap');
  private timer: ReturnType<typeof setInterval> | null = null;
  /**
   * Um poll de cada vez.
   *
   * O `setInterval` de 60s disparava o próximo poll mesmo com o anterior em curso — e
   * um poll DEMORA: cada e-mail é processado dentro do laço, o que inclui a chamada da
   * IA e o envio da resposta. Passar de 60s é o normal, não a exceção.
   *
   * Em 08/08/2026 dois polls concorrentes leram a mesma mensagem e a Lia respondeu ao
   * mesmo lead duas vezes, com textos diferentes, separados por 33 milissegundos. O
   * dedup por Message-ID (EmailService.process) barra a segunda; esta trava evita
   * chegar lá — e evita duas conexões IMAP simultâneas na mesma caixa.
   */
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly crypto: EmailCryptoService,
    private readonly bounce: EmailBounceService,
    private readonly sentIngest: EmailSentIngestService,
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
        id: c.id,
        host: c.imapHost,
        port: c.imapPort,
        user: c.imapUser,
        pass: this.crypto.decrypt(c.imapPass), // decripta AES-256-GCM
        mailbox: c.imapMailbox,
        tenantId: c.tenantId,
        lastSeenUid: c.lastSeenUid ?? null,
        uidValidity: c.uidValidity ?? null,
        sentMailbox: c.imapSentMailbox ?? null,
        sentLastSeenUid: c.sentLastSeenUid ?? null,
        sentUidValidity: c.sentUidValidity ?? null,
      }));

    if (fromDb.length > 0) return fromDb;

    // Fallback .env (tenant "default")
    const host = process.env.EMAIL_IMAP_HOST;
    const user = process.env.EMAIL_IMAP_USER;
    const pass = process.env.EMAIL_IMAP_PASS;
    if (!host || !user || !pass) return [];

    return [{
      // Sem linha no banco não há marca d'água para gravar — este caminho é
      // fallback de dev e segue por UNSEEN.
      id: null,
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
      sentMailbox: process.env.EMAIL_IMAP_SENT_MAILBOX ?? null,
      sentLastSeenUid: null,
      sentUidValidity: null,
    }];
  }

  /** Poll todas as caixas configuradas. */
  async pollAll() {
    // Ver `polling`: o poll anterior ainda está rodando. Pular é o certo — ele vai
    // pegar tudo que chegou; insistir em paralelo é que causa mensagem dobrada.
    if (this.polling) {
      this.logger.warn('Poll anterior ainda em andamento — esta rodada foi pulada.');
      return;
    }
    this.polling = true;
    try {
      const configs = await this.getConfigs();
      if (configs.length === 0) return; // nenhuma caixa configurada — silencioso

      for (const cfg of configs) {
        await this.pollOne(cfg).catch((e) =>
          this.logger.error(`Erro ao fazer poll de ${cfg.user}: ${e?.message}`),
        );
      }
    } finally {
      this.polling = false;
    }
  }

  /**
   * Grava a marca d'água + lastPollAt. Nunca lança: falhar aqui só faz o próximo
   * poll reprocessar a partir da marca anterior, o que é o lado seguro do erro.
   */
  private async salvarMarca(cfg: ImapConfig, uid: number | null, uidValidity: number | null) {
    if (!cfg.id) return; // fallback .env: não há linha onde gravar
    await this.prisma.emailChannel
      .updateMany({
        // Por CAIXA, não por tenant — ver o campo `id` em ImapConfig.
        where: { id: cfg.id },
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
      await this.varrerEntrada(connection, cfg);
      // A pasta de enviados vem DEPOIS e na MESMA conexão: é a metade humana do
      // histórico, e falhar nela não pode impedir a entrada de ser lida. Ver
      // EmailSentIngestService.
      await this.varrerEnviados(connection, cfg).catch((e: any) =>
        this.logger.warn(`IMAP ${cfg.user}: falha ao ler a pasta de enviados — ${e?.message}`),
      );
    } finally {
      connection.end();
    }
  }

  /**
   * Qual é a pasta de enviados desta caixa.
   *
   * Ordem: o que estiver configurado → o que o servidor anuncia como `\Sent`
   * (RFC 6154) → os nomes usuais. Errar o nome é uma falha silenciosa das ruins:
   * o poller não acha nada, não reclama, e o histórico segue pela metade sem
   * ninguém perceber. Por isso a descoberta é automática e o resultado é logado.
   */
  private async resolverPastaEnviados(connection: any, cfg: ImapConfig): Promise<string | null> {
    if (cfg.sentMailbox?.trim()) return cfg.sentMailbox.trim();

    const caixas = await connection.getBoxes().catch(() => null);
    if (!caixas) return null;

    // A árvore vem aninhada, com o delimitador do servidor entre os níveis.
    const achatar = (nivel: any, prefixo = ''): Array<{ nome: string; attribs: string[] }> =>
      Object.entries(nivel ?? {}).flatMap(([nome, info]: [string, any]) => {
        const completo = `${prefixo}${nome}`;
        return [
          { nome: completo, attribs: (info?.attribs ?? []) as string[] },
          ...achatar(info?.children, `${completo}${info?.delimiter ?? '.'}`),
        ];
      });

    const todas = achatar(caixas);
    const especial = todas.find((b) => b.attribs.some((a) => String(a).toLowerCase() === '\\sent'));
    if (especial) return especial.nome;

    const porNome = NOMES_DE_ENVIADOS.find((n) =>
      todas.some((b) => b.nome.toLowerCase() === n.toLowerCase()),
    );
    return porNome ?? null;
  }

  /**
   * Lê a pasta de enviados e devolve ao histórico o que foi escrito FORA do Nexa.
   *
   * O que o Nexa mesmo mandou já está gravado na conversa desde o envio e é
   * barrado pelo Message-ID (ver EmailReplyService.send). O que sobra aqui é
   * exatamente a resposta que a pessoa do comercial escreveu no webmail ou no
   * celular — a metade que faltava.
   *
   * Sem marca d'água (primeira execução) NÃO varre o passado: a caixa pode ter
   * anos de mensagem, e ingerir tudo de uma vez encheria o Inbox de conversa
   * antiga. Planta a marca no topo e passa a valer daqui para a frente.
   */
  private async varrerEnviados(connection: any, cfg: ImapConfig) {
    const pasta = await this.resolverPastaEnviados(connection, cfg);
    if (!pasta) {
      this.logger.warn(
        `IMAP ${cfg.user}: pasta de enviados não encontrada — as respostas escritas fora do Nexa ` +
        'NÃO entram no histórico. Configure imapSentMailbox no canal de e-mail.',
      );
      return;
    }

    const box: any = await connection.openBox(pasta);
    const uidValidity = Number(box?.uidvalidity ?? box?.uidValidity ?? 0) || null;
    const marcaValida =
      cfg.sentLastSeenUid !== null &&
      (cfg.sentUidValidity === null || uidValidity === null || cfg.sentUidValidity === uidValidity);

    if (!marcaValida) {
      const topo = maiorUidExistente(box);
      this.logger.log(`IMAP ${cfg.user}: pasta de enviados "${pasta}" — marca inicial no UID ${topo ?? 0}`);
      await this.salvarMarcaEnviados(cfg, topo, uidValidity);
      return;
    }

    const messages = await connection.search([['UID', `${cfg.sentLastSeenUid! + 1}:*`]], {
      bodies: [''],
      markSeen: false,
    });

    // `UID n:*` devolve sempre a última mensagem mesmo quando o UID dela é menor
    // que n — o servidor normaliza a faixa. Sem este filtro, a última mensagem
    // seria reprocessada a cada poll (o dedup por Message-ID barraria, mas ao
    // custo de baixar a mensagem inteira de 60 em 60 segundos).
    const novas = (messages ?? [])
      .filter((m: any) => Number(m.attributes?.uid ?? 0) > cfg.sentLastSeenUid!)
      .sort((a: any, b: any) => Number(a.attributes?.uid ?? 0) - Number(b.attributes?.uid ?? 0));

    if (novas.length === 0) {
      await this.salvarMarcaEnviados(cfg, cfg.sentLastSeenUid, uidValidity);
      return;
    }

    let maiorUid = cfg.sentLastSeenUid!;
    let registradas = 0;

    for (const msg of novas) {
      const uid = Number(msg.attributes?.uid ?? 0);
      try {
        const raw = msg.parts.find((p: any) => p.which === '')?.body ?? '';
        const parsed = await simpleParser(raw);

        // `to` vem como objeto ou ARRAY de objetos conforme o cabeçalho — o
        // mailparser não normaliza. Ler `.text` direto do array devolve undefined
        // e o destinatário se perde em silêncio.
        const paraTexto = Array.isArray(parsed.to)
          ? parsed.to.map((a: any) => a?.text).filter(Boolean).join(', ')
          : parsed.to?.text ?? '';

        const r = await this.sentIngest.ingest(cfg.tenantId, {
          to: paraTexto,
          subject: parsed.subject ?? '(sem assunto)',
          bodyText: (parsed.text ?? '').trim(),
          messageId: parsed.messageId,
          sentAt: parsed.date ?? undefined,
        });
        if ('ok' in r) registradas++;
      } catch (err: any) {
        // Uma mensagem problemática não pode travar a pasta — mesma regra da INBOX.
        this.logger.warn(`IMAP ${cfg.user}: falha ao ler enviado uid=${uid} — ${err?.message}`);
      }
      if (uid > maiorUid) maiorUid = uid;
    }

    if (registradas > 0) {
      this.logger.log(
        `IMAP ${cfg.user}: ${registradas} resposta(s) escrita(s) fora do Nexa entraram no histórico ` +
        `(de ${novas.length} mensagem(ns) na pasta de enviados)`,
      );
    }
    await this.salvarMarcaEnviados(cfg, maiorUid, uidValidity);
  }

  /** Marca d'água da pasta de enviados. Nunca lança — igual à da entrada. */
  private async salvarMarcaEnviados(cfg: ImapConfig, uid: number | null, uidValidity: number | null) {
    if (uid === null || uid <= 0 || !cfg.id) return;
    await this.prisma.emailChannel
      .updateMany({
        where: { id: cfg.id }, // por CAIXA — ver o campo `id` em ImapConfig
        data: { sentLastSeenUid: uid, sentUidValidity: uidValidity } as any,
      })
      .catch((e: any) =>
        this.logger.warn(`IMAP ${cfg.user}: falha ao gravar a marca dos enviados — ${e?.message}`),
      );
  }

  private async varrerEntrada(connection: any, cfg: ImapConfig) {
    {
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
              // Identidade da mensagem — é o que permite ao process() recusar a
              // segunda passada. Sem isto o dedup lá não tem por onde pegar.
              ...(parsed.messageId ? { 'Message-ID': parsed.messageId } : {}),
              // Thread da RFC 5322 §3.6.4 — é o que liga a resposta ao disparo mesmo
              // quando ela vem de um endereço diferente do que recebeu a campanha.
              // Ver CampaignReplyLinker. `references` pode vir como array no mailparser.
              ...(parsed.inReplyTo ? { 'In-Reply-To': parsed.inReplyTo } : {}),
              ...(parsed.references
                ? {
                    References: Array.isArray(parsed.references)
                      ? parsed.references.join(' ')
                      : String(parsed.references),
                  }
                : {}),
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
    }
  }
}
