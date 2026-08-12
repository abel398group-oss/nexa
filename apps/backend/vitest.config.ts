import { configDefaults, defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // `*.int.spec.ts` precisa de Postgres de pé (vitest.integration.config.ts). Fora
    // daqui porque esta suíte roda no CI e na máquina de quem não subiu o container —
    // teste que falha por falta de infra ensina o time a ignorar teste vermelho.
    exclude: [...configDefaults.exclude, 'src/**/*.int.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.module.ts', 'src/main.ts'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
