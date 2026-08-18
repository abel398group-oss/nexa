import {
  BadRequestException, Body, Controller, Delete, Get, Param, Post, Query,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MarketAssetsService } from '@/application/markets/market-assets.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';

/**
 * O arquivo chega como TEXTO em JSON, não como `multipart`.
 *
 * O navegador já leu o `.md` com `FileReader` para mostrar a prévia antes de enviar;
 * mandar os mesmos bytes de novo como upload binário só para o servidor decodificar
 * outra vez seria trabalho a troco de nada. `multipart` passa a valer quando entrar
 * PDF, que o navegador não tem como ler.
 */
class SubirAssetDto {
  @IsString()
  @IsNotEmpty({ message: 'O arquivo precisa de um nome.' })
  @MaxLength(200)
  name!: string;

  /// O limite de tamanho de verdade está no service, medido em BYTES — `MaxLength`
  /// conta caracteres, e acento ocupa dois. Aqui é só o teto grosseiro que impede um
  /// corpo absurdo de chegar a ser validado.
  @IsString()
  @IsNotEmpty({ message: 'O arquivo está vazio.' })
  @MaxLength(1_000_000)
  content!: string;
}

/// Mesmo destino do anexo de campanha (sender.controller): `uploads/` na raiz do
/// processo, servido em `/uploads/` por `useStaticAssets` no main.ts.
const UPLOAD_DIR = join(process.cwd(), 'uploads');

/// Portfólio é o que o lead VÊ: folder, catálogo, foto. Nada executável, e nada que
/// o navegador não saiba abrir sozinho — um .zip aqui vira download cego.
const TIPOS_PORTFOLIO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('markets/:code/assets')
export class MarketAssetsController {
  constructor(private readonly assets: MarketAssetsService) {}

  // Tudo atrás de `settings`, igual a criar e liberar mercado: é quem monta a
  // operação. Aprovar material é decisão de quem responde por ele.
  @Get()
  @RequirePerm('settings')
  listar(
    @CurrentTenant() tenantId: string,
    @Param('code') code: string,
    @Query('kind') kind?: 'plan' | 'portfolio',
  ) {
    return this.assets.listar(tenantId, code, kind === 'portfolio' || kind === 'plan' ? kind : undefined);
  }

  @Get(':id')
  @RequirePerm('settings')
  ler(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.assets.ler(tenantId, id);
  }

  @Post()
  @RequirePerm('settings')
  subir(
    @CurrentTenant() tenantId: string,
    @Param('code') code: string,
    @Body() dto: SubirAssetDto,
  ) {
    return this.assets.subir(tenantId, code, dto);
  }

  /**
   * Portfólio: PDF ou imagem, gravado em disco.
   *
   * `multipart` aqui e JSON no roteiro não é inconsistência — é o que cada um é. O
   * navegador leu o `.md` como texto para mostrar antes de enviar; o PDF ele não tem
   * como ler, então os bytes sobem crus.
   *
   * 16 MB é o mesmo teto do anexo de campanha, e a razão é a mesma: acima disso o
   * WhatsApp recusa, e um folder que não pode ser enviado não serve para nada.
   */
  @Post('portfolio')
  @RequirePerm('settings')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
          cb(null, UPLOAD_DIR);
        },
        // Prefixo de tempo + nome higienizado: dois mercados podem subir
        // "portfolio.pdf" e um não pode sobrescrever o arquivo do outro em disco.
        filename: (_req, file, cb) => {
          const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
          cb(null, `${Date.now()}_${safe}`);
        },
      }),
      limits: { fileSize: 16 * 1024 * 1024 },
    }),
  )
  subirPortfolio(
    @CurrentTenant() tenantId: string,
    @Param('code') code: string,
    @UploadedFile() file: any,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo chegou.');
    if (!TIPOS_PORTFOLIO.includes(file.mimetype)) {
      throw new BadRequestException(
        `"${file.originalname}" é ${file.mimetype}. Aqui entra PDF, JPG, PNG ou WEBP.`,
      );
    }
    return this.assets.subirPortfolio(tenantId, code, {
      name: file.originalname,
      fileUrl: `/uploads/${file.filename}`,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });
  }

  @Post(':id/approve')
  @RequirePerm('settings')
  aprovar(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.assets.aprovar(tenantId, id, user?.id);
  }

  @Post(':id/reject')
  @RequirePerm('settings')
  reprovar(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.assets.reprovar(tenantId, id);
  }

  @Delete(':id')
  @RequirePerm('settings')
  remover(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.assets.remover(tenantId, id);
  }
}
