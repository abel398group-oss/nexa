import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api'); // todas as rotas sob /api
  app.enableCors({ origin: true, credentials: true }); // cookie HttpOnly (auth)

  const port = process.env.PORT ?? 3001; // 3001 p/ não conflitar com TMS (3000)
  await app.listen(port);
}
bootstrap();
