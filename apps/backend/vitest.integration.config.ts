import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Testes de integração — batem num Postgres DE VERDADE.
 *
 * Banco: o container `nexa_postgres` do docker-compose (porta 5433), que já existia no
 * projeto sem uso. NUNCA o banco de produção: estes testes criam e apagam linhas, e o
 * `.env` do backend aponta para o banco real da DigitalOcean.
 *
 * Antes de rodar:
 *   docker compose up -d postgres
 *   DATABASE_URL=<url de teste> npx prisma migrate deploy
 *
 * O `DATABASE_URL` abaixo é fixo de propósito. Se viesse do ambiente, um `.env`
 * carregado por engano apontaria a suíte para produção — e o primeiro `deleteMany`
 * apagaria dado de cliente. Aqui, na pior das hipóteses, o teste falha por não achar
 * banco local.
 */
export const TEST_DATABASE_URL =
  'postgresql://nexa:nexa_local_dev@localhost:5433/nexa?schema=public';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.int.spec.ts'],
    // Um banco só, compartilhado: arquivos em paralelo brigariam pelas mesmas linhas.
    fileParallelism: false,
    testTimeout: 30_000,
    env: { DATABASE_URL: TEST_DATABASE_URL },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
