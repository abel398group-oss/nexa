import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import type { EstadoCotacao } from './quote-flow';

/**
 * Onde mora a conversa de cotação entre uma mensagem e outra.
 *
 * Redis e não banco: é estado de trabalho, não histórico. Uma cotação abandonada no meio
 * não é dado que alguém queira consultar depois — é lixo que expira sozinho. Gravar isso
 * em tabela obrigaria a criar rotina de limpeza para nada.
 *
 * O TTL é a regra de negócio do PRD (10 minutos). Ele se renova a cada resposta, então
 * quem está respondendo nunca perde a sessão; quem sumiu perde, e o "cotar" seguinte
 * começa do zero em vez de continuar de onde parou uma hora atrás.
 *
 * Sem Redis a cotação simplesmente não abre, e diz isso. A alternativa — guardar em
 * memória do processo — quebraria de forma pior: com duas instâncias, metade das
 * respostas cairia no processo que não tem a sessão, e o usuário veria o fluxo
 * "esquecer" o que ele acabou de responder.
 */
@Injectable()
export class QuoteSessionService {
  private readonly logger = new Logger('QuoteSession');
  private redis: Redis | null = null;

  /// 10 minutos sem responder e a sessão morre (PRD §Regras de negócio).
  static readonly TTL_SEGUNDOS = 600;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL ausente — cotação por WhatsApp indisponível');
      return;
    }
    this.redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
    this.redis.on('error', (e) => this.logger.warn(`Redis: ${e.message}`));
  }

  get disponivel(): boolean {
    return this.redis !== null;
  }

  /// A chave leva o telefone porque a sessão é da PESSOA, não do tenant: o mesmo número
  /// nunca cota por dois tenants ao mesmo tempo.
  private chave(phone: string): string {
    return `nexa:cotacao:${phone}`;
  }

  async ler(phone: string): Promise<EstadoCotacao | null> {
    if (!this.redis) return null;
    try {
      const cru = await this.redis.get(this.chave(phone));
      if (!cru) return null;
      const estado = JSON.parse(cru) as EstadoCotacao;
      // Estado gravado por uma versão anterior do fluxo pode não ter a etapa atual. Tratar
      // como sessão inexistente é melhor que seguir com um estado que o código não entende.
      return estado?.etapa ? estado : null;
    } catch (e: any) {
      this.logger.warn(`falha lendo sessão de ${phone}: ${e?.message}`);
      return null;
    }
  }

  async gravar(phone: string, estado: EstadoCotacao): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(
        this.chave(phone),
        JSON.stringify(estado),
        'EX',
        QuoteSessionService.TTL_SEGUNDOS,
      );
    } catch (e: any) {
      this.logger.warn(`falha gravando sessão de ${phone}: ${e?.message}`);
    }
  }

  async apagar(phone: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(this.chave(phone));
    } catch {
      /* sessão órfã expira sozinha pelo TTL */
    }
  }

  /**
   * Marca de "já orientei este número hoje".
   *
   * Chave separada da sessão de propósito: a sessão morre quando a cotação termina, e
   * esta precisa sobreviver a isso — senão bastaria cotar para o aviso poder repetir.
   *
   * Sem Redis, `avisou` devolve TRUE: sem onde guardar a marca, o freio não existe, e um
   * alerta com cinco respostas geraria cinco avisos. Calar é a falha segura aqui.
   */
  private chaveAviso(phone: string): string {
    return `nexa:cotacao:avisado:${phone}`;
  }

  static readonly TTL_AVISO_SEGUNDOS = 24 * 60 * 60;

  async avisou(phone: string): Promise<boolean> {
    if (!this.redis) return true;
    try {
      return (await this.redis.get(this.chaveAviso(phone))) !== null;
    } catch {
      return true;
    }
  }

  async marcarAvisado(phone: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(this.chaveAviso(phone), '1', 'EX', QuoteSessionService.TTL_AVISO_SEGUNDOS);
    } catch {
      /* sem a marca, o pior caso é um aviso a mais */
    }
  }
}
