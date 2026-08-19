import { Injectable, Logger } from '@nestjs/common';
import type { CidadeDoTms } from './quote-city';
import type { CorpoDaCotacao } from './quote-flow';

/**
 * As três chamadas ao TMS que a cotação por WhatsApp precisa.
 *
 * Separado do `HiperTmsConnector` de propósito: aquele fala com o TMS pelo contrato de
 * suporte (chamados, handoff), e esta é a superfície de COTAÇÃO, com outro contrato e
 * outro dono. Misturar faria uma mudança no contrato de cotação obrigar a reler o de
 * suporte, e vice-versa.
 *
 * Nenhum método lança. Toda falha vira um resultado que quem chama sabe tratar — dentro
 * de uma conversa de WhatsApp, exceção não tratada vira silêncio, e silêncio é o pior
 * desfecho: o vendedor fica esperando um preço que nunca vem.
 */

export interface ImpostoDaCotacao {
  acronym: string;
  name: string;
  rate: number;
  value: number;
}

export type ResultadoTms =
  | {
      ok: true;
      price: number;
      minimumFloor: number | null;
      distanceKm: number | null;
      draftId: string | null;
      /// ISO-8601 vindo do TMS, calculado pela regra do tenant. Guardado CRU de propósito
      /// — ver o comentário de `validadeEmDiaMes` em quote-messages.
      validUntil: string | null;
      /// Campos aditivos (2026-08-19): margem, receita líquida e impostos vêm da "análise
      /// crítica" que o TMS já calculava internamente — não existiam na resposta antes.
      /// `null` de propósito quando o motor não devolveu análise: ZERO seria lido pelo
      /// vendedor como "cotação sem margem", que é uma mensagem bem diferente de "não sei".
      netMargin: number | null;
      netRevenue: number | null;
      taxes: { total: number; items: ImpostoDaCotacao[] } | null;
      /// Path relativo, SEMPRE presente segundo o contrato do TMS. `draftUrl` é o
      /// absoluto — só vem preenchido quando o TMS conhece a base do próprio web-app
      /// (branding do tenant ou `WEB_APP_URL` deles). Quando vem `null`, NÃO montamos um
      /// link aqui: `app.hipertms.com.br` já se mostrou incorreto para outro fluxo (ver
      /// comentário em `digest-tabular.ts`), e não há confirmação de que a raiz sem
      /// subdomínio sirva a SPA em `draftPath`. Nesse caso a mensagem interna some com o
      /// link e mantém só a instrução em texto que já existia.
      draftPath: string | null;
      draftUrl: string | null;
    }
  | { ok: false; motivo: 'sem_permissao' | 'cota_estourada' | 'indisponivel' };

@Injectable()
export class QuoteTmsClient {
  private readonly logger = new Logger('QuoteTms');

  private get baseUrl(): string {
    return (process.env.TMS_BASE_URL ?? process.env.TMS_API_BASE_URL ?? '').replace(/\/$/, '');
  }

  /// O TMS valida contra a env `NEXA_SERVICE_TOKEN` do lado deles; aqui o mesmo valor
  /// mora em `TMS_SERVICE_TOKEN`. Nomes diferentes para o mesmo segredo — cada lado usa o
  /// nome do outro, e isso já confundiu gente. Ver docs/architecture/nexa-contract.md.
  private get token(): string {
    return process.env.TMS_INTERNAL_TOKEN ?? process.env.TMS_SERVICE_TOKEN ?? '';
  }

  get configurado(): boolean {
    return !!this.baseUrl && !!this.token;
  }

  private async chamar(caminho: string, init: RequestInit): Promise<Response | null> {
    try {
      return await fetch(`${this.baseUrl}${caminho}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
          ...(init.headers ?? {}),
        },
        // Teto curto: isto acontece DENTRO de uma conversa. Trinta segundos esperando
        // é o vendedor achando que o robô morreu e mandando "?" três vezes.
        signal: AbortSignal.timeout(12_000),
      });
    } catch (e: any) {
      this.logger.warn(`${caminho} falhou: ${e?.message}`);
      return null;
    }
  }

  /**
   * Busca de cidade. É `@Public()` no TMS — não manda token, não precisa.
   *
   * Devolve `null` (e não lista vazia) quando a chamada FALHA, porque as duas coisas
   * levam a mensagens diferentes: "não achei essa cidade" e "não consegui consultar
   * agora". Trocar uma pela outra manda o usuário corrigir um nome que estava certo.
   */
  async buscarCidades(termo: string): Promise<CidadeDoTms[] | null> {
    if (!this.baseUrl) return null;
    const res = await this.chamar(
      `/public/geography/cities/search?q=${encodeURIComponent(termo)}`,
      { method: 'GET' },
    );
    if (!res?.ok) return null;
    const dados: any = await res.json().catch(() => null);
    // Formato REAL do TMS, conferido em produção em 19/08/2026:
    //   { success: true, data: [ { city_code, city, state, ibge_code, ... } ] }
    // Eu tinha suposto `{ cities: [ { code, name, state } ] }` — a lista vinha num
    // objeto, `Array.isArray` dava falso, e toda busca virava "não consegui consultar".
    // Os apelidos alternativos ficam porque custam nada e o WAHA/TMS já mudaram formato
    // antes; o que não fica é supor sem conferir.
    const lista = dados?.data ?? dados?.cities ?? dados;
    if (!Array.isArray(lista)) return null;
    return lista
      .map((c: any) => ({
        // `city_code` é o que o motor de cotação espera; `ibge_code` é o mesmo número
        // neste retorno, mas o campo canônico é o primeiro.
        code: String(c?.city_code ?? c?.ibge_code ?? c?.code ?? c?.id ?? ''),
        name: String(c?.city ?? c?.name ?? ''),
        state: String(c?.state ?? c?.uf ?? ''),
      }))
      .filter((c) => c.code && c.name);
  }

  /// Tipos de carga daquele veículo, com os rótulos exatos da tabela do tenant.
  /// `null` = falhou. Lista vazia é resposta VÁLIDA: o tenant não tem tabela pra esse
  /// veículo, e quem chama tem uma frase própria pra isso.
  async tiposDeCarga(userId: string, vehicleType: string): Promise<string[] | null> {
    if (!this.configurado) return null;
    const res = await this.chamar(
      `/nexa/quote/cargo-types?userId=${encodeURIComponent(userId)}&vehicleType=${encodeURIComponent(vehicleType)}`,
      { method: 'GET' },
    );
    if (!res) return null;
    if (res.status === 404) return []; // veículo sem catálogo = sem tabela
    if (!res.ok) return null;
    const dados: any = await res.json().catch(() => null);
    // Aceita com e sem o embrulho `{ success, data }`: as rotas antigas do TMS embrulham,
    // e o contrato que o squad passou para as novas nao embrulha. Custa nada aceitar os
    // dois e evita a busca inteira virar "nao consegui" por causa de uma casca.
    const lista = dados?.cargoTypes ?? dados?.data?.cargoTypes ?? dados?.data;
    return Array.isArray(lista) ? lista.map(String).filter(Boolean) : null;
  }

  /**
   * A cotação. Calcula, cria o rascunho e devolve o valor.
   *
   * `403` e `429` viram motivos DIFERENTES porque geram frases diferentes: mandar a
   * mesma faria quem estourou a cota ir pedir permissão que já tem. Foi por isso que o
   * TMS criou uma exceção própria em vez de reusar a de permissão.
   */
  async cotar(userId: string, corpo: CorpoDaCotacao, phone: string): Promise<ResultadoTms> {
    if (!this.configurado) return { ok: false, motivo: 'indisponivel' };

    const res = await this.chamar('/nexa/quote', {
      method: 'POST',
      // `phone` vai junto para o rascunho guardar DE ONDE veio. Quem for formalizar
      // precisa saber que aquilo nasceu no WhatsApp, e não digitado por alguém.
      body: JSON.stringify({ userId, phone, ...corpo }),
    });
    if (!res) return { ok: false, motivo: 'indisponivel' };
    if (res.status === 403) return { ok: false, motivo: 'sem_permissao' };
    if (res.status === 429) return { ok: false, motivo: 'cota_estourada' };
    if (!res.ok) {
      this.logger.warn(`cotação recusada pelo TMS: HTTP ${res.status}`);
      return { ok: false, motivo: 'indisponivel' };
    }

    const bruto: any = await res.json().catch(() => null);
    // Mesmo motivo da lista de cidades: com ou sem `{ success, data }`.
    const d: any = bruto?.price != null ? bruto : (bruto?.data ?? bruto);
    const price = Number(d?.price);
    // Sem preço não há cotação. Devolver "ok" com valor zero mandaria "R$ 0,00" para o
    // cliente — pior que dizer que não deu.
    if (!Number.isFinite(price) || price <= 0) {
      this.logger.warn('cotação sem preço utilizável na resposta do TMS');
      return { ok: false, motivo: 'indisponivel' };
    }
    return {
      ok: true,
      price,
      minimumFloor: Number.isFinite(Number(d?.minimumFloor)) ? Number(d.minimumFloor) : null,
      distanceKm: Number.isFinite(Number(d?.distanceKm)) ? Number(d.distanceKm) : null,
      draftId: d?.draftId != null ? String(d.draftId) : null,
      validUntil: typeof d?.validUntil === 'string' ? d.validUntil : null,
      netMargin: Number.isFinite(Number(d?.netMargin)) ? Number(d.netMargin) : null,
      netRevenue: Number.isFinite(Number(d?.netRevenue)) ? Number(d.netRevenue) : null,
      taxes: this.extrairImpostos(d?.taxes),
      draftPath: typeof d?.draftPath === 'string' && d.draftPath ? d.draftPath : null,
      draftUrl: typeof d?.draftUrl === 'string' && d.draftUrl ? d.draftUrl : null,
    };
  }

  /// `taxes` é opcional e tem formato composto (`total` + `items[]`) — mais chance de vir
  /// torto que os campos escalares. `total` sem número utilizável já invalida o bloco
  /// inteiro: impostos parciais na tela confundem mais que não mostrar nenhum.
  private extrairImpostos(bruto: any): { total: number; items: ImpostoDaCotacao[] } | null {
    const total = Number(bruto?.total);
    if (!Number.isFinite(total)) return null;
    const itens = Array.isArray(bruto?.items) ? bruto.items : [];
    const items: ImpostoDaCotacao[] = itens
      .map((i: any) => ({
        acronym: String(i?.acronym ?? ''),
        name: String(i?.name ?? ''),
        rate: Number.isFinite(Number(i?.rate)) ? Number(i.rate) : 0,
        value: Number.isFinite(Number(i?.value)) ? Number(i.value) : 0,
      }))
      .filter((i: ImpostoDaCotacao) => i.acronym);
    return { total, items };
  }
}
