import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv } from './validate-env';

// Chaves que os testes mexem — salvas e restauradas para não vazar entre casos.
const KEYS = [
  'NODE_ENV',
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ANTHROPIC_API_KEY',
  'WAHA_WEBHOOK_TOKEN',
  'CORS_ORIGINS',
];

const STRONG_A = 'A1b2C3d4'.repeat(5); // 40 chars
const STRONG_B = 'Z9y8X7w6'.repeat(5); // 40 chars, diferente

function setValidProd() {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgresql://nexa:S3nh4Forte@db:5432/nexa';
  process.env.JWT_SECRET = STRONG_A;
  process.env.JWT_REFRESH_SECRET = STRONG_B;
  process.env.PORTAL_JWT_SECRET = 'P0rtalSecret9'.repeat(4); // 52 chars, forte e diferente
  process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-realvalue1234567890abcdef';
  process.env.WAHA_WEBHOOK_TOKEN = 'whk_realtoken1234567890abcdef';
  process.env.CORS_ORIGINS = 'https://app.hipertms.com.br';
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
