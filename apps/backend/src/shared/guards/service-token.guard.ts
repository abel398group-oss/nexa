import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { safeEqual } from '@/shared/utils/safe-compare';

/**
 * ServiceTokenGuard — autenticação Bearer server-to-server (TMS → Nexa).
 *
 * Protege endpoints chamados pelo TMS via `Authorization: Bearer <token>`.
 * Valida contra a env `TMS_SERVICE_TOKEN`.
 *
 * Fail-closed: se a env não estiver configurada, NEGA o acesso.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  private readonly logger = new Logger('ServiceTokenGuard');

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const expected = process.env.TMS_SERVICE_TOKEN;
    // A3/G5: alias DEPRECADO — o TMS historicamente usa NEXA_SERVICE_TOKEN em
    // algumas chamadas (alert-config). Aceito temporariamente para permitir a
    // rotação de segredo sem quebra. Remover após o TMS migrar (plano AT2).
    const legacyAlias = process.env.NEXA_SERVICE_TOKEN;

    if (!expected && !legacyAlias) {
      this.logger.error('TMS_SERVICE_TOKEN não configurado — endpoint de serviço bloqueado');
      throw new ServiceUnavailableException('Integração de serviço não configurada');
    }

    const authHeader: string | undefined = req.headers?.['authorization'];
    const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!provided) {
      throw new UnauthorizedException('Bearer token inválido');
    }

    // Comparação em TEMPO CONSTANTE (auditoria 2026-07-26): `===` faz
    // short-circuit no 1º byte diferente e vaza, pelo tempo de resposta,
    // quantos caracteres do token o atacante acertou. Mesmo padrão já usado
    // em integrations.controller (B1, auditoria 2026-07-08).
    if (expected && safeEqual(provided, expected)) {
      req.serviceClient = { name: 'tms', at: new Date() };
      return true;
    }

    if (legacyAlias && safeEqual(provided, legacyAlias)) {
      this.logger.warn('Autenticado via NEXA_SERVICE_TOKEN (DEPRECADO) — padronize em TMS_SERVICE_TOKEN');
      req.serviceClient = { name: 'tms', at: new Date() };
      return true;
    }

    throw new UnauthorizedException('Bearer token inválido');
  }
}
