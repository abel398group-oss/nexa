import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';

// Lê o JWT do cookie HttpOnly 'access_token' (padrão do TMS).
function cookieExtractor(req: Request): string | null {
  return req?.cookies?.['access_token'] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret-trocar',
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
