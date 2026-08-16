/**
 * TmsLookupService — consulta READ-ONLY ao banco do HiperTMS.
 *
 * ⚠️  REGRA ABSOLUTA: este serviço NUNCA escreve no banco do TMS.
 *     Apenas SELECT. Qualquer tentativa de INSERT/UPDATE/DELETE é proibida.
 *
 * Configuração (env do Nexa):
 *   TMS_DB_URL = postgresql://user:pass@host:port/hipertms_v12_398?sslmode=require
 *
 * Se TMS_DB_URL não estiver configurado, os métodos retornam vazio/null sem erro.
 *
 * ⚠️  Vazio NÃO significa "ninguém é cliente": pode ser TMS fora do ar. Quem usa o
 *     resultado para DECIDIR (o filtro de campanha) precisa de `batchLookupVerificado`,
 *     que informa se a consulta funcionou. Ver o comentário lá.
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

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
export class TmsLookupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('TmsLookup');
  // Pool em vez de Client: gerencia reconexão automática e concorrência sem estado manual.
  // max:2 — read-only, baixa concorrência; idleTimeoutMillis: 30s — libera conexões ociosas.
  private pool: Pool | null = null;

  // Normaliza para dígitos sem código de país (55)
  static normalize(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length >= 12) return digits.slice(2);
    return digits;
  }

  onModuleInit() {
    const url = process.env.TMS_DB_URL;
    if (!url) return;
    this.pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    this.pool.on('error', (err) => {
      this.logger.warn(`TMS pool error: ${err.message}`);
    });
    this.logger.log('Pool TMS inicializado (read-only, max:2)');
  }

  private getPool(): Pool | null {
    return this.pool;
  }

  /**
   * Consulta em lote: dado um array de telefones do Nexa,
   * retorna um Map de phone_normalizado → TmsCustomerInfo
   * para todos que tiverem cadastro no TMS.
   *
   * Faz apenas 2 queries (usuarios + empresas) independente do tamanho do lote.
   */
  async batchLookup(phones: string[]): Promise<Map<string, TmsCustomerInfo>> {
    return (await this.batchLookupVerificado(phones)).clientes;
  }

  /**
   * Igual ao `batchLookup`, mas DIZ se a consulta funcionou.
   *
   * O `batchLookup` devolve um Map vazio em três situações que não são a mesma coisa:
   * ninguém do lote é cliente, o TMS não está configurado, ou o TMS caiu. Quem chama não
   * tinha como distinguir — e o disparo de campanha usa esse resultado para NÃO mandar
   * oferta fria a cliente pagante. Ou seja, o banco do TMS fora do ar virava "nenhum
   * deles é cliente", e a campanha saía para a base inteira.
   *
   * `falhou` é true SÓ quando a consulta deveria ter funcionado e não funcionou. TMS não
   * configurado não é falha: é um ambiente que deliberadamente roda sem o conector (CI,
   * máquina nova) e ali não há filtro a aplicar.
   */
  async batchLookupVerificado(
    phones: string[],
  ): Promise<{ clientes: Map<string, TmsCustomerInfo>; falhou: boolean; motivo?: string }> {
    const result = new Map<string, TmsCustomerInfo>();
    if (!phones.length) return { clientes: result, falhou: false };

    const pool = this.getPool();
    // Sem TMS_DB_URL: não há filtro a aplicar. Não é falha, mas o aviso fica no log —
    // em produção isso significa campanha saindo sem peneira de cliente.
    if (!pool) {
      this.logger.warn('TMS_DB_URL ausente — nenhum filtro de cliente TMS será aplicado');
      return { clientes: result, falhou: false, motivo: 'tms_nao_configurado' };
    }

    // Normaliza todos os telefones de entrada
    const normalized = phones.map(TmsLookupService.normalize);

    const client = await pool.connect().catch((e: any) => {
      this.logger.error(`TMS DB indisponível: ${e?.message}`);
      return null;
    });
    if (!client) {
      return { clientes: result, falhou: true, motivo: 'conexão com o banco do TMS recusada' };
    }

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
      // Antes era fail-open com um `warn`: a campanha prosseguia SEM filtro e ninguém
      // ficava sabendo. Agora o erro é devolvido a quem chamou, que decide — o disparo
      // recusa a campanha, o roteamento da Lia segue como antes.
      this.logger.error(`batchLookup falhou: ${e?.message}`);
      return { clientes: result, falhou: true, motivo: e?.message ?? 'erro na consulta ao TMS' };
    } finally {
      client.release();
    }

    return { clientes: result, falhou: false };
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end().catch(() => null);
    }
  }
}
