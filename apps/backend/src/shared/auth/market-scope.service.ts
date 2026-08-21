import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

/**
 * market-scope — "cada operador no mercado dele" (16/08/2026).
 *
 * Irmão de `seller-scope.ts`, um andar acima: aquele limita ao DONO do lead
 * (`assignedSellerId`), este limita ao MERCADO que a pessoa trabalha. Os dois se
 * compõem — o SDR do Agabê vê os leads de Agabê que são dele.
 *
 * O vínculo já existia no banco e não era usado para autorização nenhuma:
 * `User.sellerId → Seller.id → SellerMarket.productCode`.
 *
 * ## O modo de falhar aqui é silencioso, nos DOIS sentidos
 *
 * Escopo de menos e o SDR lê a carteira do colega — foi o que aconteceu até hoje, porque
 * `escopoDeVendedor` só limita `role='vendedor'` e a tela de Usuários cria todo mundo
 * como `operacional`. Escopo demais e a fila abre vazia, o operador acha que acabou o
 * trabalho e vai embora. Por isso a válvula do parágrafo seguinte.
 *
 * ## A válvula de alívio
 *
 * `seller_markets` é esparsa: a maior parte da operação nunca vinculou ninguém. Aplicar
 * fail-closed direto zeraria a fila de todo mundo no dia do deploy. Então: **tenant sem
 * NENHUM vínculo não tem escopo** — exatamente a escada que `markets.service` já usa na
 * trava de liberação ("enquanto não houver vínculo, conte todos os ativos"). Assim que o
 * primeiro vínculo existe no tenant, a regra passa a valer de verdade e sozinha.
 *
 * Isso não é gentileza, é sequência: sem a válvula, ligar a regra e preencher os vínculos
 * teriam que acontecer no mesmo segundo.
 */

export interface UsuarioComMercados {
  role?: string | null;
  sellerId?: string | null;
  permissions?: string[] | null;
}

/** Quem opera lead e, por isso, é limitado por mercado. */
function operaLead(user: UsuarioComMercados | undefined): boolean {
  if (!user) return false;
  if (user.role === 'vendedor') return true;
  const p = user.permissions ?? [];
  return p.includes('sdr') || p.includes('closer');
}

@Injectable()
export class MarketScopeService {
  private readonly logger = new Logger('MarketScope');
  /**
   * Vínculo muda por ação de admin, raríssima. 60s evita uma query por request.
   * Guarda o resultado INTEIRO, `undefined` incluso — senão o caso "sem escopo" seria o
   * único a bater no banco toda vez, que é justamente o mais comum hoje.
   */
  private readonly cache = new Map<string, { valor: string[] | undefined; exp: number }>();
  private static readonly TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mercados que este usuário pode ver. `undefined` = todos (sem escopo).
   *
   * - admin, gestor, operacional sem mesa → `undefined`
   * - tenant sem nenhum vínculo → `undefined` (válvula)
   * - opera lead mas sem `sellerId` → `[]` (fail-closed: não casa com nada)
   * - opera lead e tem vínculo → os `productCode` dele
   */
  async mercadosDoUsuario(
    tenantId: string,
    user: UsuarioComMercados | undefined,
  ): Promise<string[] | undefined> {
    if (user?.role === 'admin') return undefined;
    if (!operaLead(user)) return undefined;

    const chave = `${tenantId}:${user!.sellerId ?? '__sem_vinculo__'}`;
    const hit = this.cache.get(chave);
    if (hit && hit.exp > Date.now()) return hit.valor;

    const [doUsuario, totalNoTenant] = await Promise.all([
      user!.sellerId
        ? this.prisma.sellerMarket.findMany({
            where: { tenantId, sellerId: user!.sellerId },
            select: { productCode: true },
          })
        : Promise.resolve([] as { productCode: string }[]),
      this.prisma.sellerMarket.count({ where: { tenantId } }),
    ]);

    // VÁLVULA: ninguém vinculado no tenant → a regra ainda não está montada, não limita.
    const valor = totalNoTenant === 0 ? undefined : doUsuario.map((v) => v.productCode);

    if (valor?.length === 0) {
      // Não é erro, é configuração faltando — e sem este aviso o operador abre a fila
      // vazia e ninguém sabe dizer por quê.
      this.logger.warn(
        `Usuário sem mercado vinculado (seller=${user!.sellerId ?? 'nenhum'}, tenant=${tenantId}) — fila vazia até vincular`,
      );
    }
    this.cache.set(chave, { valor, exp: Date.now() + MarketScopeService.TTL_MS });
    return valor;
  }

  /** Limpa o cache de um vendedor — chamado quando o vínculo muda. */
  invalidar(tenantId: string, sellerId?: string | null): void {
    this.cache.delete(`${tenantId}:${sellerId ?? '__sem_vinculo__'}`);
  }
}

/**
 * Pedaço de `where` do Prisma. Sem escopo devolve `{}` — o chamador espalha e nada muda.
 *
 * `productCode: { in: [] }` não é acidente: é o fail-closed. Um `{}` no lugar devolveria
 * a base inteira para quem não tem vínculo, que é o oposto do pedido.
 *
 * Lead SEM mercado (`productCode: null`) entra no escopo de quem TEM vínculo
 * (21/08/2026): `IN (...)` exclui NULL em SQL, então a oportunidade que nascia sem
 * mercado — todo lead criado pelo agente antes da propagação do productCode — era
 * invisível para o SDR e para o closer ao mesmo tempo, e não aparecia em lugar
 * nenhum da operação. Ela é de alguém até prova em contrário; esconder de todos é
 * o único resultado certamente errado. O fail-closed de quem não tem vínculo
 * nenhum continua intacto.
 */
export function filtroDeMercado(mercados: string[] | undefined): Record<string, unknown> {
  if (!mercados) return {};
  if (!mercados.length) return { productCode: { in: [] } };
  return { OR: [{ productCode: { in: mercados } }, { productCode: null }] };
}

/** Recusa a ação quando o mercado não é do operador. Usado onde o code vem por parâmetro. */
export function assertMercado(mercados: string[] | undefined, code: string | null | undefined): void {
  if (!mercados) return; // sem escopo, tudo liberado
  if (!code || !mercados.includes(code)) {
    throw new ForbiddenException('Você não trabalha este mercado.');
  }
}
