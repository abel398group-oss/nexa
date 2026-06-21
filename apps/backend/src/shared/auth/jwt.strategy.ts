import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';

// Lê o JWT do cookie HttpOnly 'access_token' (padrão do TMS).
function cookieExtractor(req: Request): string | null {
  return req?.cookies?.['access_token'] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // O retorno vira req.user
  async validate(payload: { sub: string; tenantId: string | null; role: string; sellerId?: string | null; permissions?: string[] }) {
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      sellerId: payload.sellerId ?? null,
      permissions: payload.permissions ?? [],
    };
  }
}
