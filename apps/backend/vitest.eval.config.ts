/**
 * Config separada do golden set (evals/).
 *
 * Existe apartada porque estes casos chamam a API da Anthropic: custam dinheiro por
 * execução e o modelo é probabilístico. Misturá-los ao `pnpm test` faria toda a
 * equipe pagar por um caso oscilando — e ninguém rodaria os testes.
 *
 *   pnpm --filter backend eval
 */
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { readFileSync } from 'fs';

// Carrega o .env do backend sem depender de dotenv: o golden set precisa da
// ANTHROPIC_API_KEY, que em runtime normal quem lê é o @nestjs/config.
try {
  for (const linha of readFileSync(resolve(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, chave, bruto] = m;
    if (process.env[chave] === undefined) {
      process.env[chave] = bruto.trim().replace(/^["']|["']$/g, '');
    }
  }
} catch {
  // Sem .env: o próprio teste falha com mensagem clara sobre a chave ausente.
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['evals/**/*.eval.ts'],
    // Sequencial: chamadas reais ao modelo em paralelo estouram rate limit e
    // transformam falha de infra em "regressão de comportamento" no relatório.
    fileParallelism: false,
    maxConcurrency: 1,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
