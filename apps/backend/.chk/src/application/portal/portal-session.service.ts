import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface PortalCustomer {
  externalId: string;
  tenantId: string;
  name: string | null;
}

// Sessao do CLIENTE no portal — isolada da auth interna (segredo + audience proprios).
@Injectable()
export class PortalSessionService {
  constructor(private readonly jwt: JwtService) {}

  async sign(c: PortalCustomer): Promise<string> {
    return this.jwt.signAsync({ sub: c.externalId, tenantId: c.tenantId, name: c.name });
  }

  async verify(token: string): Promise<PortalCustomer | null> {
    try {
      const p: any = await this.jwt.verifyAsync(token, { audience: 'portal' });
      if (!p?.sub || !p?.tenantId) return null;
      return { externalId: p.sub, tenantId: p.tenantId, name: p.name ?? null };
    } catch {
      return null;
    }
  }
}
