import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MarketsService } from '@/application/markets/markets.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

class LinkSellerDto {
  @IsOptional()
  @IsIn(['seller', 'lead'])
  role?: 'seller' | 'lead';
}

/// Criação de mercado. `slug` vira o `code` do produto — a chave que separa
/// conhecimento, campanha e conector em todo o sistema (ADR 037). Por isso o formato
/// é validado aqui e não só normalizado no service: um code com espaço ou acento
/// entraria em rota, filtro e chave de Redis e só quebraria muito depois.
class CreateMarketDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do market é obrigatório.' })
  @MaxLength(80)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'O identificador (slug) é obrigatório.' })
  @MaxLength(40)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'O identificador deve ter apenas letras minúsculas, números e hífen (ex.: agabe, oleo-lubrificante).',
  })
  slug!: string;

  // A identidade também entra na criação. Ela não é enfeite: sem `displayName` e
  // `senderName` o mercado nasce reprovado pela própria trava de liberação, e o
  // operador só descobre depois, na lista, como uma pendência vermelha. As regras
  // são as mesmas do PATCH de propósito — divergir aqui deixaria passar na criação
  // um valor que a edição recusa.

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  senderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  brandTagline?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, { message: 'A cor deve ser um hex como #FF5A1F.' })
  brandColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\/.+/, { message: 'O link de cadastro deve começar com http:// ou https://.' })
  @MaxLength(300)
  signupUrl?: string;

  /// De quem é o mercado. Vazio = mercado da casa (HiperTMS). O service valida
  /// que o parceiro é do tenant e está ativo.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  partnerId?: string;
}

/**
 * Identidade do mercado — a "cara" dele no e-mail.
 *
 * Todo campo é opcional porque a rota é PATCH: ausente = não mexe. `null` é
 * aceito de propósito, e significa limpar (voltar à marca padrão do HiperTMS).
 *
 * `@IsOptional()` do class-validator pula tanto `undefined` quanto `null`, que é
 * exatamente a semântica desejada aqui.
 */
class UpdateMarketDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'O nome do mercado não pode ficar vazio.' })
  @MaxLength(80)
  name?: string;

  /// Como a Lia se apresenta. É o campo que o gate de liberação exige, e o que
  /// `email-market-identity.ts` checa antes de montar a marca do e-mail.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string | null;

  /// Nome do remetente ("Lia"). Segundo campo exigido pelo gate.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  senderName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  brandTagline?: string | null;

  /// Hex de 3 ou 6 dígitos. Validado aqui porque vai direto para o `style` do
  /// e-mail: valor torto não quebra o envio, só sai sem cor — e ninguém percebe.
  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'A cor deve ser um hex como #FF5A1F.',
  })
  brandColor?: string | null;

  /// Destino do CTA e origem do domínio que aparece na assinatura (`dominioDe`).
  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\/.+/, { message: 'O link de cadastro deve começar com http:// ou https://.' })
  @MaxLength(300)
  signupUrl?: string | null;

  /// `null`/vazio = volta a ser mercado da casa. Não-nulo passa pela mesma
  /// validação da criação no service.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  partnerId?: string | null;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('markets')
export class MarketsController {
  constructor(private readonly markets: MarketsService) {}

  /**
   * `?liberados=true` é o que a tela de Disparo consome: devolve só mercados ativos e
   * sem o relatório de pendências. Mercado em rascunho não pode aparecer no seletor do
   * vendedor, senão a trava de liberação não serve para nada (ADR 037).
   */
  // `campaigns` OU `settings`: a lista serve a dois públicos — quem dispara escolhe o
  // mercado no formulário, e quem configura a operação abre a tela de Markets. Com
  // `campaigns` sozinho, o segundo recebia 403 e a tela dizia "nenhum mercado
  // cadastrado", que é falso e manda procurar defeito no lugar errado.
  @Get()
  @RequirePerm('campaigns', 'settings')
  list(@CurrentTenant() tenantId: string, @Query('liberados') liberados?: string) {
    return this.markets.list(tenantId, { somenteLiberados: liberados === 'true' });
  }

  /// Criar mercado fica atrás de 'settings', igual a liberar/suspender: é quem monta a
  /// operação, não quem dispara.
  @Post()
  @RequirePerm('settings')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateMarketDto) {
    return this.markets.create(tenantId, dto);
  }

  /**
   * Edita a identidade do mercado. Atrás de 'settings' como liberar/suspender:
   * é quem monta a operação, não quem dispara.
   *
   * Declarada ANTES de `:code/readiness` e das outras `:code/...` por clareza —
   * `PATCH /markets/hipertms` não colide com elas (métodos diferentes), mas
   * deixar as rotas do mesmo recurso juntas evita que alguém introduza um
   * curinga depois e quebre isto sem perceber.
   */
  @Patch(':code')
  @RequirePerm('settings')
  update(
    @CurrentTenant() tenantId: string,
    @Param('code') code: string,
    @Body() dto: UpdateMarketDto,
  ) {
    return this.markets.updateIdentidade(tenantId, code, dto);
  }

  /**
   * Exclui mercado criado por engano. `settings`, como criar.
   *
   * A trava de verdade está no service (só rascunho e só sem conteúdo) — aqui é
   * só o caminho HTTP.
   */
  @Delete(':code')
  @RequirePerm('settings')
  remove(@CurrentTenant() tenantId: string, @Param('code') code: string) {
    return this.markets.remove(tenantId, code);
  }

  @Get(':code/readiness')
  @RequirePerm('settings')
  readiness(@CurrentTenant() tenantId: string, @Param('code') code: string) {
    return this.markets.readiness(tenantId, code);
  }

  // Liberar e suspender mudam o que o vendedor enxerga — ficam atrás de 'settings',
  // não de 'campaigns'.
  @Post(':code/release')
  @RequirePerm('settings')
  release(@CurrentTenant() tenantId: string, @Param('code') code: string) {
    return this.markets.release(tenantId, code);
  }

  @Post(':code/pause')
  @RequirePerm('settings')
  pause(@CurrentTenant() tenantId: string, @Param('code') code: string) {
    return this.markets.pause(tenantId, code);
  }

  /**
   * Vendedores do mercado (`SellerMarket`) — vinculados e disponíveis.
   *
   * É o que decide quem pode receber lead deste mercado: a transferência do SDR só
   * aceita closer vinculado. Sem esta lista, montar a operação exigia INSERT na mão.
   */
  @Get(':code/sellers')
  @RequirePerm('settings')
  sellers(@CurrentTenant() tenantId: string, @Param('code') code: string) {
    return this.markets.vendedoresDoMercado(tenantId, code);
  }

  @Post(':code/sellers/:sellerId')
  @RequirePerm('settings')
  linkSeller(
    @CurrentTenant() tenantId: string,
    @Param('code') code: string,
    @Param('sellerId') sellerId: string,
    @Body() body: LinkSellerDto,
  ) {
    return this.markets.vincularVendedor(tenantId, code, sellerId, body.role);
  }

  @Delete(':code/sellers/:sellerId')
  @RequirePerm('settings')
  unlinkSeller(
    @CurrentTenant() tenantId: string,
    @Param('code') code: string,
    @Param('sellerId') sellerId: string,
  ) {
    return this.markets.desvincularVendedor(tenantId, code, sellerId);
  }
}
