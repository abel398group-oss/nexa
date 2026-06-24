import { Logger } from '@nestjs/common';

/**
 * Validação de variáveis de ambiente no boot (segurança pré-deploy).
 *
 * Em PRODUÇÃO (NODE_ENV=production): se algum segredo crítico estiver ausente,
 * fraco ou ainda com valor placeholder do .env.example → ABORTA o boot.
 * Isso evita subir no DigitalOcean com JWT/token/chave inseguros.
 *
 * Em desenvolvimento: apenas avisa (não atrapalha o trabalho local).
 */

const logger = new Logger('EnvValidation');

// Obrigatórios em produção
const REQUIRED_IN_PROD = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ANTHROPIC_API_KEY',
  'WAHA_WEBHOOK_TOKEN',
  'PORTAL_JWT_SECRET',
  // Integração TMS + handoff
  'TMS_SERVICE_TOKEN',
  'NEXA_DEFAULT_TENANT_ID',
  // Infra
  'REDIS_URL',
];

// Marcas de valor "placeholder" herdado do .env.example — proibido em produção
const PLACEHOLDER_RE =
  /(GERE_|trocar-por|SEGREDO_FORTE|SEU_TOKEN|SUA_API_KEY|SENHA_REDIS|xxxxx|local_dev|change[-_ ]?me|\.\.\.)/i;

export function validateEnv(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const problems: string[] = [];

  for (const key of REQUIRED_IN_PROD) {
    const val = (process.env[key] ?? '').trim();
    if (!val) {
      problems.push(`${key} não está definido`);
      continue;
    }
    if (PLACEHOLDER_RE.test(val)) {
      problems.push(`${key} ainda está com um valor placeholder/inseguro`);
    }
  }

  // Segredos de assinatura precisam de entropia mínima
  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'PORTAL_JWT_SECRET']) {
    const val = process.env[key] ?? '';
    if (val && val.length < 32) {
      problems.push(`${key} é curto demais (< 32 caracteres) — gere um segredo forte`);
    }
  }
  if (
    process.env.JWT_SECRET &&
    process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET
  ) {
    problems.push('JWT_SECRET e JWT_REFRESH_SECRET são iguais — use segredos diferentes');
  }

  // CORS não pode apontar para localhost em produção
  if (isProd) {
    const cors = process.env.CORS_ORIGINS ?? '';
    if (!cors || cors.includes('localhost')) {
      problems.push('CORS_ORIGINS não pode incluir localhost em produção — defina o(s) domínio(s) real(is)');
    }
  }

  if (problems.length === 0) {
    logger.log('Validação de variáveis de ambiente: OK');
    return;
  }

  const msg = `Problemas de configuração/segurança detectados:\n- ${problems.join('\n- ')}`;

  if (isProd) {
    logger.error(msg);
    // Fail-fast: não sobe em produção com configuração insegura.
    throw new Error('Boot abortado: corrija as variáveis de ambiente antes de subir em produção.');
  }

  logger.warn(`${msg}\n(apenas aviso em ambiente não-produção)`);
}
