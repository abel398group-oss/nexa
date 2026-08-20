import { Injectable, Logger } from '@nestjs/common';
import { QuoteSessionService } from './quote-session.service';
import { QuoteTmsClient } from './quote-tms.client';
import * as msg from './quote-messages';
import {
  cargaUtilDoGatilho,
  comCargasEncontradas,
  comCidadesEncontradas,
  dadosDaCotacao,
  ehGatilho,
  novaCotacao,
  responder,
  type EstadoCotacao,
  type Passo,
} from './quote-flow';

/**
 * A cotação por WhatsApp, ponta a ponta.
 *
 * Recebe (telefone, texto) e devolve o que responder — ou `null`, que significa "esta
 * mensagem não é minha, siga o fluxo normal". Esse `null` é o que mantém o resto do
 * WhatsApp intocado: só quem digitou o gatilho ou já está no meio de uma cotação entra
 * aqui.
 *
 * Quem responde de fato é quem chama. Este serviço não manda mensagem — assim ele é
 * testável sem WAHA, e o envio continua num lugar só.
 */
@Injectable()
export class QuoteConversationService {
  private readonly logger = new Logger('QuoteConversation');

  constructor(
    private readonly sessoes: QuoteSessionService,
    private readonly tms: QuoteTmsClient,
  ) {}

  /**
   * Ligada por env, DESLIGADA por padrão.
   *
   * O gancho fica no caminho do WhatsApp — por onde passa o alerta que funciona hoje.
   * Uma chave permite acender e apagar sem deploy, e apagar é o que importa: se algo der
   * errado no primeiro teste real, o caminho volta ao de sempre em segundos.
   */
  get habilitado(): boolean {
    return process.env.QUOTE_WHATSAPP_ENABLED === 'true';
  }

  /**
   * A mensagem TALVEZ seja de cotação? Checagem barata, antes de consultar o TMS.
   *
   * Existe para quem chama não fazer uma consulta ao banco do TMS a cada mensagem que
   * chega no WhatsApp. Só o gatilho (comparação de texto) e a sessão (um GET no Redis)
   * — e ambos são falsos na esmagadora maioria das mensagens.
   */
  async pareceCotacao(phone: string, texto: string): Promise<boolean> {
    if (!this.habilitado || !texto) return false;
    if (ehGatilho(texto)) return true;
    if ((await this.sessoes.ler(phone)) !== null) return true;
    // Sessão que morreu por TTL há pouco também conta: a resposta atrasada precisa
    // chegar em `responderMensagem` pra receber o aviso de expirada em vez de silêncio.
    return this.sessoes.expirouHaPouco(phone);
  }

  /// Freio da mensagem de orientação: uma por número por dia. Ver `orientarNumeroInterno`.
  avisouRecentemente(phone: string): Promise<boolean> {
    return this.sessoes.avisou(phone);
  }

  marcarAvisado(phone: string): Promise<void> {
    return this.sessoes.marcarAvisado(phone);
  }

  /**
   * @param userId Id do usuário no TMS (`tenant_core_user.id`), resolvido pelo telefone.
   * @returns texto(s) a responder, em ORDEM, ou `null` se a mensagem não é de cotação. Só o
   *   passo final (`fechar`) devolve mais de um texto — a interna primeiro, a encaminhável
   *   depois. Quem chama manda cada item como uma mensagem separada, na ordem do array.
   */
  async responderMensagem(
    phone: string,
    texto: string,
    userId: string,
  ): Promise<string | string[] | null> {
    if (!this.habilitado) return null;

    const sessao = await this.sessoes.ler(phone);

    // Fora de sessão, só o gatilho abre. Sem esta guarda, qualquer "ok" mandado para um
    // alerta viraria início de cotação.
    if (!sessao) {
      if (!ehGatilho(texto)) {
        // Resposta atrasada de uma sessão que o TTL matou: dizer o que houve, uma vez.
        if (await this.sessoes.consumirExpirada(phone)) return msg.expirada();
        return null;
      }
      if (!this.sessoes.disponivel || !this.tms.configurado) {
        this.logger.warn('cotação pedida mas Redis ou TMS não estão configurados');
        return 'A cotação por WhatsApp está indisponível agora. Tente mais tarde. 🔧';
      }
      return this.abrir(phone, texto, userId);
    }

    // Em sessão, "cotar" de novo RECOMEÇA em vez de ser tratado como resposta. Quem
    // repete o gatilho está dizendo que se perdeu.
    if (ehGatilho(texto)) return this.abrir(phone, texto, userId);

    return this.avancar(phone, sessao, texto, userId);
  }

  /**
   * Abre a sessão — e aproveita o que veio junto com o gatilho.
   *
   * "cotar Jacareí pra Taubaté" era aberto ignorando as cidades, e a primeira pergunta
   * pedia o que a pessoa acabou de escrever. Agora a carga útil vira a resposta da
   * origem na hora; se ela não resolver (cidade não achada, consulta fora), cai na
   * abertura de sempre — nunca pior do que era.
   */
  private async abrir(phone: string, texto: string, userId: string): Promise<string | string[]> {
    const estado = novaCotacao();
    await this.sessoes.gravar(phone, estado);

    const cargaUtil = cargaUtilDoGatilho(texto);
    if (cargaUtil) {
      const resposta = await this.avancar(phone, estado, cargaUtil, userId);
      // Andou? O critério é o ESTADO, não o texto da resposta: se a sessão saiu da
      // origem (avançou ou virou menu de escolha), a carga útil valeu e a resposta dela
      // é a certa. Se continua parada na origem — cidade não achada, consulta fora —,
      // a pessoa recebe a abertura de sempre, com tentativas zeradas: "não achei essa
      // cidade" sem nunca ter visto a pergunta confunde mais do que explica.
      const depois = await this.sessoes.ler(phone);
      if (!depois || depois.etapa !== 'origem') return resposta;
      const denovo = novaCotacao();
      await this.sessoes.gravar(phone, denovo);
    }
    return msg.abertura();
  }

  private async avancar(
    phone: string,
    sessao: EstadoCotacao,
    texto: string,
    userId: string,
  ): Promise<string | string[]> {
    let passo: Passo = responder(sessao, texto);

    // As buscas rodam num laço porque uma pode emendar na outra: o par "origem pra
    // destino" resolve a origem e já pede a busca do destino no mesmo turno. O teto de
    // 3 é o pior caso legítimo (origem → destino → cargas); passar disso é bug de fluxo,
    // e aí é melhor recomeçar do que rodar pra sempre.
    for (let i = 0; i < 3; i++) {
      if (passo.tipo === 'buscar_cidade') {
        const base = passo.estado ?? sessao;
        const achadas = await this.tms.buscarCidades(passo.termo);
        if (achadas === null) {
          // Falha de consulta NÃO é "cidade não existe". Dizer "não achei" mandaria a
          // pessoa corrigir um nome que estava certo.
          return 'Não consegui consultar as cidades agora. Manda de novo em instantes. 🔧';
        }
        passo = comCidadesEncontradas(base, achadas, passo.uf, passo.para);
        continue;
      }
      if (passo.tipo === 'buscar_cargas') {
        const cargas = await this.tms.tiposDeCarga(userId, passo.vehicleType);
        if (cargas === null) {
          return 'Não consegui consultar os tipos de carga agora. Manda de novo em instantes. 🔧';
        }
        passo = comCargasEncontradas(sessao, passo.vehicleType, cargas);
        continue;
      }
      break;
    }

    if (passo.tipo === 'sem_tabela') {
      await this.sessoes.apagar(phone);
      return msg.semTabelaDeFrete(passo.estado);
    }

    if (passo.tipo === 'buscar_cidade' || passo.tipo === 'buscar_cargas') {
      this.logger.warn(`fluxo pediu ${passo.tipo} além do teto de buscas — não deveria acontecer`);
      await this.sessoes.apagar(phone);
      return 'Alguma coisa se perdeu no meio. Manda *cotar* pra recomeçar. 😕';
    }

    if (passo.tipo === 'repetir') {
      const desistiu = passo.motivo === 'desistiu';
      // Ao desistir a sessão MORRE. Deixá-la viva faria a próxima mensagem qualquer cair
      // no mesmo campo e repetir o erro para sempre.
      if (desistiu) await this.sessoes.apagar(phone);
      else await this.sessoes.gravar(phone, passo.estado);
      return msg.naoEntendi(passo.estado, desistiu);
    }

    const estado = passo.estado;

    if (estado.etapa === 'cancelado') {
      await this.sessoes.apagar(phone);
      return msg.cancelado();
    }

    if (estado.etapa !== 'pronto') {
      await this.sessoes.gravar(phone, estado);
      return msg.pergunta(estado);
    }

    return this.fechar(phone, estado, userId);
  }

  /// Última etapa: chama o TMS e encerra a sessão de qualquer jeito. Manter a sessão viva
  /// depois de cotar faria a próxima mensagem ser lida como resposta de um formulário que
  /// já acabou.
  private async fechar(
    phone: string,
    estado: EstadoCotacao,
    userId: string,
  ): Promise<string | string[]> {
    const corpo = dadosDaCotacao(estado);
    await this.sessoes.apagar(phone);

    if (!corpo) {
      this.logger.warn('estado pronto mas incompleto — não deveria acontecer');
      return 'Alguma coisa se perdeu no meio. Manda *cotar* pra recomeçar. 😕';
    }

    const r = await this.tms.cotar(userId, corpo, phone);
    if (!r.ok) {
      if (r.motivo === 'indisponivel') {
        return 'Não consegui calcular agora. Tente de novo em instantes. 🔧';
      }
      return msg.recusado(r.motivo === 'sem_permissao' ? 'sem_permissao' : 'cota_estourada');
    }

    this.logger.log(`cotação criada para ${phone} — rascunho ${r.draftId ?? '(sem id)'}`);
    const dados: msg.ResultadoDaCotacao = {
      valor: r.price,
      pisoAntt: r.minimumFloor,
      distanciaKm: r.distanceKm,
      rascunhoId: r.draftId,
      validoAte: r.validUntil,
      netMargin: r.netMargin,
      netRevenue: r.netRevenue,
      taxes: r.taxes,
      draftUrl: r.draftUrl,
    };
    // Duas mensagens, NESTA ordem: a interna (com piso ANTT) primeiro, pro vendedor
    // conferir; a encaminhável — a que já existia — logo depois, pronta pra repassar.
    return [msg.resultadoInterno(estado, dados), msg.resultadoParaCliente(estado, dados)];
  }
}
