// Sentry must be initialized before any other import
import * as Sentry from '@sentry/node';
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});

import { NestFactory } from '@nestjs/core';
import { BadRequestException, Logger as NestLogger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { Logger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { validateEnv } from './shared/config/validate-env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  // Segurança: barra o boot em produção se algum segredo crítico estiver fraco/ausente/placeholder.
  validateEnv();
  // arquivos de campanha (anexos) servidos em /uploads (fora do prefixo /api)
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  app.useLogger(app.get(Logger));
  // headers de segurança (E1). CSP off p/ não quebrar o Swagger UI (/api/docs) — mantém HSTS/X-Frame/nosniff
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  // whitelist+forbidNonWhitelisted = proteção contra mass-assignment
  //
  // REGRA 3 (REGRAS-SQUAD.md): a rejeição SEMPRE loga o motivo.
  //
  // Duas vezes um campo novo do TMS derrubou uma integração inteira com 400
  // (`isManager` em 09/07/2026, `companyName`+`cnpj` em 07/08/2026). Nas duas, o
  // 400 saiu mudo daqui: o TMS converte falha downstream em erro genérico, e do
  // lado do Nexa o log só dizia `statusCode: 400`. A causa levava dias para ser
  // encontrada por falta de UMA linha de log.
  //
  // Loga apenas as mensagens de constraint (nomes de propriedade e regra violada),
  // NUNCA os valores enviados — payload de integração carrega dado pessoal (LGPD).
  const validationLogger = new NestLogger('ValidationPipe');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        // Mesmo shape do factory padrão do Nest: { message: string[], error, statusCode }.
        // Mudar isso quebraria o parsing de erro do TMS e do frontend.
        const detalhes = errors.flatMap((e) =>
          Object.values(e.constraints ?? {}).length ? Object.values(e.constraints ?? {}) : [e.property],
        );
        validationLogger.warn(`payload rejeitado: ${detalhes.join(' | ')}`);
        return new BadRequestException(detalhes);
      },
    }),
  );
  app.setGlobalPrefix('api'); // todas as rotas sob /api
  // CORS restrito: permite apenas origens explícitas definidas em CORS_ORIGINS (dev + produção)
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',');
  app.enableCors({ origin: allowedOrigins, credentials: true }); // cookie HttpOnly (auth)

  // Swagger / OpenAPI (E7 — padrão TMS). Desabilita em produção.
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Nexa API')
      .setDescription('Plataforma comercial de IA (Lia) — leads, inbox, disparo, vendedores.')
      .setVersion('1.0')
      .addCookieAuth('access_token')
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, doc); // → http://localhost:3001/api/docs
  }

  const port = process.env.PORT ?? 3001; // 3001 p/ não conflitar com TMS (3000)
  await app.listen(port);
}
bootstrap();
