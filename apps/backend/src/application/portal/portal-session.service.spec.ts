import { describe, it, expect } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { PortalSessionService } from './portal-session.service';

const portalJwt = new JwtService({ secret: 'test-portal-secret', signOptions: { audience: 'portal', expiresIn: '45m' } });
const wrongAud = new JwtService({ secret: 'test-portal-secret', signOptions: { audience: 'outro', expiresIn: '45m' } });

describe('PortalSessionService', () => {
  const svc = new PortalSessionService(portalJwt);

  it('assina e verifica (roundtrip)', async () => {
    const token = await svc.sign({ externalId: 'ext1', tenantId: 't1', name: 'Ana', isManager: false });
    expect(await svc.verify(token)).toEqual({ externalId: 'ext1', tenantId: 't1', name: 'Ana', isManager: false });
  });

  it('preserva isManager=true no roundtrip (gestor vê chamados da empresa)', async () => {
    const token = await svc.sign({ externalId: 'ext2', tenantId: 't1', name: 'Bia', isManager: true });
    expect(await svc.verify(token)).toEqual({ externalId: 'ext2', tenantId: 't1', name: 'Bia', isManager: true });
  });

  it('token invalido -> null', async () => {
    expect(await svc.verify('lixo.invalido')).toBeNull();
  });

  it('audience errada -> null (nao cruza com a auth interna)', async () => {
    const t = await wrongAud.signAsync({ sub: 'ext1', tenantId: 't1' });
    expect(await svc.verify(t)).toBeNull();
  });
});
