/**
 * TmsLookupService — consulta READ-ONLY ao banco do HiperTMS.
 *
 * ⚠️  REGRA ABSOLUTA: este serviço NUNCA escreve no banco do TMS.
 *     Apenas SELECT. Qualquer tentativa de INSERT/UPDATE/DELETE é proibida.
 *
 * Configuração (env do Nexa):
 *   TMS_DB_URL = postgresql://user:pass@host:port/hipertms_v12_398?sslmode=require
 *
 * Se TMS_DB_URL não estiver configurado, todos os métodos retornam vazio/null
 * sem erro — o fluxo de campanha continua normalmente.
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Client } from 'pg';

export interface TmsCustomerInfo {
  phone: string;           // telefone normalizado (só dígitos, sem 55)
  name: string;
  email?: string;
  role?: string;           // ADMIN | USER | etc.
  tenantName?: string;     // nome da empresa no TMS
  isUser: boolean;         // tem login no TMS
  isCompany: boolean;      // empresa cadastrada no TMS
}

@Injectable()
export class TmsLookupService implements OnModuleDestroy {
  private readonly logger = new Logger('TmsLookup');
  private client: Client | null = null;
  private connected = false;

  // Normaliza para dígitos sem código de país (55)
  static normalize(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length >= 12) return digits.slice(2);
    return digits;
  }

  private async getClient(): Promise<Client | null> {
    const url = process.env.TMS_DB_URL;
    if (!url) return null;

    if (this.connected && this.client) return this.client;

    try {
      this.client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
      await this.client.connect();
      this.connected = true;
      this.logger.log('Conectado ao banco TMS (read-only)');
    } catch (e: any) {
      this.logger.warn(`TMS DB indisponível: ${e?.message}`);
      this.client = null;
      this.connected = false;
    }
    return this.client;
  }

  /**
   * Consulta em lote: dado um array de telefones do Nexa,
   * retorna um Map de phone_normalizado → TmsCustomerInfo
   * para todos que tiverem cadastro no TMS.
   *
   * Faz apenas 2 queries (usuarios + empresas) independente do tamanho do lote.
   */
  async batchLookup(phones: string[]): Promise<Map<string, TmsCustomerInfo>> {
    const result = new Map<string, TmsCustomerInfo>();
    if (!phones.length) return result;

    const client = await this.getClient();
    if (!client) return result; // TMS não configurado — retorna vazio sem erro

    // Normaliza todos os telefones de entrada
    const normalized = phones.map(TmsLookupService.normalize);

    try {
      // ── Query 1: usuários (tenant_core_user) ──────────────────────────────
      // Normaliza o telefone do TMS (remove não-dígitos) e compara
      const usersRes = await client.query<{
        phone: string; name: string; email: string; role: string; tenant_name: string;
      }>(
        `SELECT
           u.phone,
           u.name,
           u.email,
           u.role,
           t.name AS tenant_name
         FROM tenant_core_user u
         LEFT JOIN system_core_tenant t ON t.id = u."tenantId"
         WHERE regexp_replace(u.phone, '[^0-9]', '', 'g') = ANY($1::text[])
           AND u.phone IS NOT NULL AND u.phone != ''`,
        [normalized],
      );

      for (const row of usersRes.rows) {
        const key = TmsLookupService.normalize(row.phone);
        result.set(key, {
          phone: key,
          name: row.name,
          email: row.email,
          role: row.role,
          tenantName: row.tenant_name,
          isUser: true,
          isCompany: false,
        });
      }

      // ── Query 2: empresas (tenant_company) ────────────────────────────────
      const companiesRes = await client.query<{
        telefone: string | null; celular: string | null; nome: string; email: string | null;
      }>(
        `SELECT
           "contatoTelefone" AS telefone,
           "contatoCelular"  AS celular,
           nome,
           "contatoEmail"    AS email
         FROM tenant_company
         WHERE (
           regexp_replace("contatoTelefone", '[^0-9]', '', 'g') = ANY($1::text[])
           OR regexp_replace("contatoCelular",  '[^0-9]', '', 'g') = ANY($1::text[])
         )
         AND "isActive" = true`,
        [normalized],
      );

      for (const row of companiesRes.rows) {
        const tel = row.telefone ? TmsLookupService.normalize(row.telefone) : null;
        const cel = row.celular  ? TmsLookupService.normalize(row.celular)  : null;
        const key = (tel && normalized.includes(tel)) ? tel : cel!;
        if (!result.has(key)) {
          // não sobrescreve se já achou como usuário
          result.set(key, {
            phone: key,
            name: row.nome,
            email: row.email ?? undefined,
            tenantName: row.nome,
            isUser: false,
            isCompany: true,
          });
        } else {
          result.get(key)!.isCompany = true; // marca empresa também
        }
      }
    } catch (e: any) {
      this.logger.warn(`batchLookup falhou: ${e?.message} — campanha prossegue sem filtro TMS`);
      // fail-open: se der erro, não bloqueia a campanha
    }

    return result;
  }

  async onModuleDestroy() {
    if (this.client && this.connected) {
      await this.client.end().catch(() => null);
    }
  }
}
