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

/**
 * Rejeição de promise sem `catch` NÃO pode derrubar o servidor.
 *
 * O default do Node (>=15) para `unhandledRejection` é `throw`, ou seja, o
 * processo morre. Um backend multi-tenant caindo inteiro por causa de uma
 * promise solta em código de infraestrutura é troca ruim: derruba WhatsApp,
 * e-mail, widget e crons de todos os tenants de uma vez.
 *
 * Foi exatamente o que aconteceu com o Redis fora do ar (07/08/2026): o ioredis
 * rejeita os comandos pendentes com MaxRetriesPerRequestError, e uma dessas
 * rejeições — vinda de dentro do adapter do socket.io, não do nosso código —
 * matava o processo a cada tentativa de reconexão, num laço.
 *
 * Aqui a rejeição vira log + Sentry, com a stack completa. Não é varrer para
 * baixo do tapete: fica registrada com o motivo (REGRA 3) e some do caminho
 * crítico. `uncaughtException` continua com o comportamento padrão — esse SIM
 * indica estado corrompido e deve derrubar o processo.
 */
process.on('unhandledRejection', (reason: unknown) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  Sentry.captureException(err);
  // console direto: isto pode disparar antes de o logger do Nest existir.
  console.error(`[unhandledRejection] ${err.message}\n${err.stack ?? '(sem stack)'}`);
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  // Segurança: barra o boot em produção se algum segredo crítico estiver fraco/ausente/placeholder.
  validateEnv();
  // arquivos de campanha (anexos) servidos em /uploads (fora do prefixo /api)
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  app.useLogger(app.get(Logger));

  // ── IP real do cliente atrás do reverse proxy ───────────────────────────────
  //
  // Em produção o backend escuta em 127.0.0.1 e é alcançado pelo reverse proxy do
  // host (ver docker-compose.production.yml). Sem `trust proxy`, `req.ip` é sempre o
  // IP do proxy — o mesmo para todo mundo. Consequências reais disso:
  //
  //   • o rate limit global "100 req/min por IP" contava TODAS as requisições juntas,
  //     ou seja, a proteção era muito mais fraca do que aparentava;
  //   • no analytics do site, `visitorHash` = sha256(salt + ip + userAgent) colapsaria
  //     todos os visitantes de um mesmo navegador num único "visitante".
  //
  // `TRUST_PROXY` controla quantos hops confiar (default 1 = o proxy imediato).
  // Confiar em X-Forwarded-For SÓ é seguro se o proxy sobrescrever/adicionar o header;
  // se ele repassar o que o cliente mandou, o IP passa a ser falsificável e o limite
  // vira decorativo. Por isso é configurável: `TRUST_PROXY=0` desliga em ambiente sem
  // proxy na frente.
  const trustProxy = Number(process.env.TRUST_PROXY ?? 1);
  if (trustProxy > 0) app.set('trust proxy', trustProxy);
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
