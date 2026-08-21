import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv } from './validate-env';

// Chaves que os testes mexem — salvas e restauradas para não vazar entre casos.
const KEYS = [
  'NODE_ENV',
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'PORTAL_JWT_SECRET',
  'ANTHROPIC_API_KEY',
  'WAHA_WEBHOOK_TOKEN',
  'CORS_ORIGINS',
  'TMS_SERVICE_TOKEN',
  'NEXA_DEFAULT_TENANT_ID',
  'REDIS_URL',
  'APP_BASE_URL',
  'TMS_SYNC_SECRET',
  'EMAIL_ENCRYPTION_KEY',
];

const STRONG_A = 'A1b2C3d4'.repeat(5); // 40 chars
const STRONG_B = 'Z9y8X7w6'.repeat(5); // 40 chars, diferente

function setValidProd() {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgresql://nexa:S3nh4Forte@db:5432/nexa';
  process.env.JWT_SECRET = STRONG_A;
  process.env.JWT_REFRESH_SECRET = STRONG_B;
  process.env.PORTAL_JWT_SECRET = 'P0rtalSecret9'.repeat(4); // 52 chars
  process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-realvalue1234567890abcdef';
  process.env.WAHA_WEBHOOK_TOKEN = 'whk_realtoken1234567890abcdef';
  process.env.CORS_ORIGINS = 'https://app.hipertms.com.br';
  process.env.TMS_SERVICE_TOKEN = 'tms_svc_token_prod_1234567890abcdef';
  process.env.NEXA_DEFAULT_TENANT_ID = 'tenant-prod-uuid-1234';
  process.env.REDIS_URL = 'redis://redis:6379';
  process.env.APP_BASE_URL = 'https://nexa.hipertms.com.br';
  process.env.TMS_SYNC_SECRET = 'tms_sync_secret_prod_1234567890abcdef';
  process.env.EMAIL_ENCRYPTION_KEY = 'a'.repeat(64); // hex de 64 chars
}

describe('validateEnv', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of KEYS) saved[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('produção com tudo válido → não lança', () => {
    setValidProd();
    expect(() => validateEnv()).not.toThrow();
  });

  it('produção sem um segredo obrigatório → aborta o boot', () => {
    setValidProd();
    delete process.env.JWT_SECRET;
    expect(() => validateEnv()).toThrow();
  });

  it('produção com valor placeholder (trocar-por...) → aborta', () => {
    setValidProd();
    process.env.JWT_SECRET = 'trocar-por-chave-forte-aleatoria-de-verdade';
    expect(() => validateEnv()).toThrow();
  });

  it('produção com segredo curto (< 32) → aborta', () => {
    setValidProd();
    process.env.JWT_SECRET = 'curtademais';
    expect(() => validateEnv()).toThrow();
  });

  it('produção com JWT_SECRET == JWT_REFRESH_SECRET → aborta', () => {
    setValidProd();
    process.env.JWT_REFRESH_SECRET = STRONG_A;
    expect(() => validateEnv()).toThrow();
  });

  // Sem a chave, o EmailCryptoService grava senha SMTP em texto puro — e chave
  // em formato errado é tratada como "sem chave", que é o mesmo furo em silêncio.
  it('produção sem EMAIL_ENCRYPTION_KEY → aborta', () => {
    setValidProd();
    delete process.env.EMAIL_ENCRYPTION_KEY;
    expect(() => validateEnv()).toThrow();
  });

  it('produção com EMAIL_ENCRYPTION_KEY fora do formato (não hex-64) → aborta', () => {
    setValidProd();
    process.env.EMAIL_ENCRYPTION_KEY = 'chave-curta-e-invalida';
    expect(() => validateEnv()).toThrow();
  });

  it('produção com CORS apontando para localhost → aborta', () => {
    setValidProd();
    process.env.CORS_ORIGINS = 'http://localhost:5173';
    expect(() => validateEnv()).toThrow();
  });

  it('desenvolvimento com config faltando → apenas avisa (não lança)', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => validateEnv()).not.toThrow();
  });
});
