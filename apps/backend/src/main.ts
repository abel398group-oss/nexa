import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { Logger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  // arquivos de campanha (anexos) servidos em /uploads (fora do prefixo /api)
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  app.useLogger(app.get(Logger));
  // headers de segurança (E1). CSP off p/ não quebrar o Swagger UI (/api/docs) — mantém HSTS/X-Frame/nosniff
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  // whitelist+forbidNonWhitelisted = proteção contra mass-assignment
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));
  app.setGlobalPrefix('api'); // todas as rotas sob /api
  app.enableCors({ origin: true, credentials: true }); // cookie HttpOnly (auth)

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
