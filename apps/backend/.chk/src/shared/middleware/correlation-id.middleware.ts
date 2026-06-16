import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// CorrelationId: garante que toda requisição tem um id único para rastrear a jornada
// ponta a ponta (ADR 004/007 + AUDITORIA). Reusa o header se vier; senão gera.
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = (req.headers['x-correlation-id'] as string) || uuidv4();
    (req as any).correlationId = incoming;
    res.setHeader('x-correlation-id', incoming);
    next();
  }
}
