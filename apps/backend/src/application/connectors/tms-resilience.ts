/**
 * tms-resilience.ts — cache de leitura + disjuntor para as chamadas ao HiperTMS.
 *
 * ## Por que existe
 *
 * O connector tinha timeouts (5–15s) mas nenhuma proteção acima disso, e o log de
 * boot prometia um comportamento inexistente: *"Lia usará dados em cache enquanto
 * TMS estiver fora"*. Não havia cache nenhum. Log que mente é pior que log nenhum —
 * durante um incidente ele manda o plantão olhar para o lugar errado.
 *
 * O cenário caro não é o TMS **cair**, é o TMS ficar **lento**. Caiu: a chamada falha
 * na hora e a Lia segue. Lento: cada mensagem espera o timeout inteiro antes de
 * desistir — e isso soma aos ~6s das 3 chamadas ao modelo. Todo lead, toda mensagem,
 * enquanto durar a degradação.
 *
 * ## O que este arquivo NÃO é
 *
 * Não é réplica de dado do TMS (ADR 011 — o TMS é a fonte da verdade). Ele guarda
 * **resposta**, não **regra**:
 *
 *   - ❌ "o plano Essencial inclui 3 números"        → regra, mora no TMS
 *   - ✅ "há 2 min o TMS respondeu isto para X"      → lembrança, pode ficar aqui
 *
 * O TTL é curto e só leitura passa por aqui. Escrita nunca é cacheada nem servida
 * de cache.
 *
 * ## Disjuntor
 *
 * Igual ao do quadro de luz: N falhas seguidas dentro de uma janela e ele desarma.
 * Enquanto desarmado ninguém nem tenta a chamada — responde do cache na hora. Passado
 * o tempo de espera, deixa UMA tentativa passar (meio-aberto): se ela funciona,
 * rearma; se falha, fica desarmado outro ciclo.
 *
 * Sem disjuntor, TMS ruim = todo cliente paga o timeout. Com disjuntor, só os
 * primeiros pagam.
 */

export interface TmsResilienceOptions {
  /** Falhas consecutivas para desarmar. */
  failureThreshold?: number;
  /** Quanto tempo fica desarmado antes de tentar de novo (ms). */
  openMs?: number;
  /** Relógio injetável — os testes controlam o tempo em vez de dormir. */
  now?: () => number;
}

interface Entry {
  value: unknown;
  at: number;
}

export class TmsResilience {
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly now: () => number;

  private readonly cache = new Map<string, Entry>();
  private consecutiveFailures = 0;
  /** Momento em que o disjuntor desarmou. null = armado (operação normal). */
  private openedAt: number | null = null;
  /** true quando já liberamos a tentativa de sondagem do ciclo atual. */
  private probeInFlight = false;

  constructor(opts: TmsResilienceOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.openMs = opts.openMs ?? 30_000;
    this.now = opts.now ?? (() => Date.now());
  }

  /**
   * O disjuntor está bloqueando chamadas agora?
   *
   * Tem efeito colateral de propósito: quando o tempo de espera vence, esta chamada
   * libera UMA sondagem e volta a bloquear as demais até haver veredito. Sem isso,
   * ao fim da espera todas as requisições em curso partiriam para cima de um TMS que
   * ainda pode estar de joelhos.
   */
  isBlocked(): boolean {
    if (this.openedAt === null) return false;
    if (this.now() - this.openedAt < this.openMs) return true;
    if (this.probeInFlight) return true; // sondagem já liberada, aguardando resultado
    this.probeInFlight = true;
    return false;
  }

  /** Chamada deu certo → rearma o disjuntor. */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.probeInFlight = false;
  }

  /** Chamada falhou → conta e, no limite, desarma. */
  recordFailure(): void {
    this.consecutiveFailures++;
    if (this.probeInFlight) {
      // a sondagem falhou: reinicia a espera inteira em vez de liberar outra em seguida
      this.openedAt = this.now();
      this.probeInFlight = false;
      return;
    }
    if (this.consecutiveFailures >= this.failureThreshold && this.openedAt === null) {
      this.openedAt = this.now();
    }
  }

  /** Valor dentro do TTL, ou undefined. */
  getFresh<T>(key: string, ttlMs: number): T | undefined {
    const e = this.cache.get(key);
    if (!e) return undefined;
    if (this.now() - e.at > ttlMs) return undefined;
    return e.value as T;
  }

  /**
   * Último valor conhecido, por mais velho que seja.
   * Só é servido quando a chamada real falhou — dado vencido é melhor que erro,
   * mas nunca melhor que dado atual.
   */
  getStale<T>(key: string): T | undefined {
    return this.cache.get(key)?.value as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.cache.set(key, { value, at: this.now() });
  }

  /** Para health check e log — nunca expõe conteúdo cacheado. */
  stats() {
    return {
      circuitOpen: this.openedAt !== null,
      consecutiveFailures: this.consecutiveFailures,
      cachedKeys: this.cache.size,
    };
  }

  /** Só para testes e para o boot. */
  reset(): void {
    this.cache.clear();
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.probeInFlight = false;
  }
}
