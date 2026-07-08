import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface PortalCustomer {
  externalId: string;
  tenantId: string;
  name: string | null;
  isManager: boolean;
}

// Sessao do CLIENTE no portal — isolada da auth interna (segredo + audience proprios).
@Injectable()
export class PortalSessionService {
  constructor(private readonly jwt: JwtService) {}

  async sign(c: PortalCustomer): Promise<string> {
    return this.jwt.signAsync(
      { sub: c.externalId, tenantId: c.tenantId, name: c.name, isManager: c.isManager },
      { audience: 'portal', expiresIn: '24h' },
    );
  }

  async verify(token: string): Promise<PortalCustomer | null> {
    try {
      const p: any = await this.jwt.verifyAsync(token, { audience: 'portal' });
      if (!p?.sub || !p?.tenantId) return null;
      return { externalId: p.sub, tenantId: p.tenantId, name: p.name ?? null, isManager: p.isManager ?? false };
    } catch {
      return null;
    }
  }
}
