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

  /**
   * Acrescenta `uselibpqcompat=true` quando a URL declara `sslmode`.
   *
   * O `pg` novo trata `sslmode=require` como `verify-full`, e o certificado do Postgres
   * gerenciado da DigitalOcean é autoassinado — a conexão morre com "self-signed
   * certificate in certificate chain". O `ssl: { rejectUnauthorized: false }` do config
   * NÃO salva: quando a URL declara `sslmode`, é ela que decide.
   *
   * Sintoma em produção (17/08/2026): o log mostrava "Pool TMS inicializado" e nunca uma
   * consulta — o pool é criado sem conectar, e a conexão só é tentada na primeira query.
   * Como o filtro de cliente do disparo usa isso, campanha era RECUSADA por falha de
   * consulta. É o mesmo tratamento que o CLAUDE.md prescreve para o banco do Nexa.
   *
   * Só age quando há `sslmode` e ainda não há o parâmetro — URL sem SSL fica intocada.
   */
  static comCompatibilidadeSsl(url: string): string {
    if (!url.includes('sslmode=')) return url;
    if (url.includes('uselibpqcompat=')) return url;
    return `${url}${url.includes('?') ? '&' : '?'}uselibpqcompat=true`;
  }

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
      connectionString: TmsLookupService.comCompatibilidadeSsl(url),
      ssl: { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    this.pool.on('error', (err) => {
      this.logger.warn(`TMS pool error: ${err.message}`);
    });
    this.logger.log('Pool TMS inicializado (read-only, max:2)');

    /**
     * Prova a conexão no boot, sem bloquear o startup.
     *
     * `new Pool` não conecta — ele só conecta na primeira query. Por isso o log de
     * produção mostrava "Pool TMS inicializado" e mais nada, enquanto a conexão estava
     * quebrada por SSL: a falha só apareceria na primeira campanha, como campanha
     * recusada, longe da causa. Um `SELECT 1` no boot põe a verdade no log de deploy.
     */
    this.pool
      .query('SELECT 1')
      .then(() => this.logger.log('conexão com o banco do TMS verificada'))
      .catch((e: any) =>
        this.logger.error(
          `banco do TMS INACESSÍVEL: ${e?.message} — o filtro de cliente do disparo vai recusar campanha até isto ser resolvido`,
        ),
      );
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

  /**
   * Coluna que diz se o cliente do TMS está vigente.
   *
   * Descoberta em tempo de execução, e não escrita à mão, porque o schema do TMS é de
   * OUTRO projeto: chutar `isActive` e errar produziria a pior saída possível — a
   * consulta falha e a tela mostra "nenhum cliente", que se lê como base vazia. E
   * fixar o nome aqui deixaria o Nexa quebrando no dia que o TMS renomear a coluna.
   *
   * Só nomes desta lista são aceitos, e é isso que torna seguro interpolar o nome no
   * SQL: ele nunca vem de entrada do usuário, vem do catálogo do banco filtrado por
   * uma lista fechada.
   */
  private static readonly COLUNAS_DE_ATIVO = ['isActive', 'is_active', 'active', 'ativo'] as const;
  private static readonly COLUNAS_DE_EXCLUSAO = ['deletedAt', 'deleted_at'] as const;
  /// `undefined` = ainda não perguntei. `null` = perguntei e não existe.
  private colunaDeVigencia?: { nome: string; tipo: 'booleano' | 'exclusao' } | null;

  /// Cache do catálogo por tabela+coluna. O schema do TMS não muda em runtime, e uma
  /// consulta ao `information_schema` por listagem seria desperdício num pool de 2.
  private readonly colunasConhecidas = new Map<string, boolean>();

  private async colunaExiste(client: any, coluna: string, tabela = 'system_core_tenant'): Promise<boolean> {
    const chave = `${tabela}.${coluna}`;
    const cache = this.colunasConhecidas.get(chave);
    if (cache !== undefined) return cache;
    try {
      const r = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [tabela, coluna],
      );
      const existe = r.rowCount > 0;
      this.colunasConhecidas.set(chave, existe);
      return existe;
    } catch {
      return false;
    }
  }

  private async descobrirColunaDeVigencia(client: any): Promise<{ nome: string; tipo: 'booleano' | 'exclusao' } | null> {
    if (this.colunaDeVigencia !== undefined) return this.colunaDeVigencia;
    try {
      const res = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
        ['system_core_tenant'],
      );
      const existentes = new Set<string>(res.rows.map((r: { column_name: string }) => r.column_name));
      const booleana = TmsLookupService.COLUNAS_DE_ATIVO.find((c) => existentes.has(c));
      if (booleana) {
        this.colunaDeVigencia = { nome: booleana, tipo: 'booleano' };
      } else {
        const exclusao = TmsLookupService.COLUNAS_DE_EXCLUSAO.find((c) => existentes.has(c));
        this.colunaDeVigencia = exclusao ? { nome: exclusao, tipo: 'exclusao' } : null;
      }
      this.logger.log(
        this.colunaDeVigencia
          ? `clientes do TMS: vigência lida de "${this.colunaDeVigencia.nome}"`
          : 'clientes do TMS: nenhuma coluna de vigência encontrada — a lista virá sem filtro de cancelados',
      );
    } catch (e: any) {
      this.logger.warn(`não consegui ler o catálogo do TMS: ${e?.message}`);
      this.colunaDeVigencia = null;
    }
    return this.colunaDeVigencia;
  }

  /**
   * Todos os clientes do TMS — as empresas que usam o produto.
   *
   * Existe porque a tela "Clientes" do módulo TMS montava a lista a partir das CONVERSAS
   * de suporte: era "quem abriu chamado" com nome de "Clientes", e cliente que paga e
   * nunca reclamou não aparecia. A base de verdade está aqui.
   *
   * `filtrouCancelados = false` é informação para a tela, não detalhe interno: sem a
   * coluna de vigência a lista inclui quem já cancelou, e quem lê precisa saber disso.
   *
   * Como o resto deste serviço: apenas SELECT, e falha devolvida a quem chamou em vez de
   * lista vazia silenciosa — vazio e "TMS fora do ar" não são a mesma coisa.
   */
  async listarClientes(limite = 500): Promise<{
    clientes: { id: string; name: string; ativo: boolean | null }[];
    falhou: boolean;
    motivo?: string;
    filtrouCancelados: boolean;
  }> {
    const pool = this.getPool();
    if (!pool) {
      return { clientes: [], falhou: false, motivo: 'tms_nao_configurado', filtrouCancelados: false };
    }
    const client = await pool.connect().catch((e: any) => {
      this.logger.error(`TMS DB indisponível: ${e?.message}`);
      return null;
    });
    if (!client) {
      return {
        clientes: [],
        falhou: true,
        motivo: 'conexão com o banco do TMS recusada',
        filtrouCancelados: false,
      };
    }

    try {
      const coluna = await this.descobrirColunaDeVigencia(client);
      // `"nome"` entre aspas duplas: o TMS usa camelCase em coluna, que o Postgres só
      // reconhece citado. O nome vem da lista fechada acima, nunca de fora.
      const base = !coluna
        ? 'NULL::boolean'
        : coluna.tipo === 'booleano'
          ? `t."${coluna.nome}"`
          : `(t."${coluna.nome}" IS NULL)`;
      // `suspended` (confirmada em 17/08/2026) precisa entrar: cliente suspenso tem
      // `isActive = true` e não está operando. Mostrá-lo como ativo faria o suporte
      // tratar como cliente vigente quem está com o acesso cortado.
      const suspensao = await this.colunaExiste(client, 'suspended');
      const expressaoAtivo = coluna && suspensao ? `(${base} AND NOT COALESCE(t."suspended", false))` : base;

      const res = await client.query<{ id: string; name: string; ativo: boolean | null }>(
        `SELECT t.id, t.name, ${expressaoAtivo} AS ativo
           FROM system_core_tenant t
          ORDER BY t.name ASC
          LIMIT $1`,
        [limite],
      );
      return { clientes: res.rows, falhou: false, filtrouCancelados: !!coluna };
    } catch (e: any) {
      this.logger.error(`listarClientes falhou: ${e?.message}`);
      return {
        clientes: [],
        falhou: true,
        motivo: e?.message ?? 'erro na consulta ao TMS',
        filtrouCancelados: false,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Empresa de cada pessoa: `tenant_core_user.id` → `tenantId`.
   *
   * A conversa de suporte do Nexa guarda o id da PESSOA que abriu o chamado (confirmado
   * em produção em 17/08/2026: o id gravado existe em `tenant_core_user`). A base de
   * clientes é de EMPRESAS. Este é o degrau que liga os dois.
   *
   * Uma query só, com `= ANY`, independente do tamanho da lista — o pool tem 2 conexões.
   *
   * Usuário removido do TMS simplesmente não vem no Map. Quem chama trata isso como
   * "chamado sem empresa" e MOSTRA o número, em vez de sumir com o atendimento.
   */
  async empresasDeUsuarios(userIds: string[]): Promise<Map<string, string>> {
    const mapa = new Map<string, string>();
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return mapa;

    const pool = this.getPool();
    if (!pool) return mapa;
    const client = await pool.connect().catch((e: any) => {
      this.logger.error(`TMS DB indisponível: ${e?.message}`);
      return null;
    });
    if (!client) return mapa;

    try {
      const res = await client.query(
        // `"tenantId"` citado: o TMS usa camelCase em coluna.
        `SELECT id, "tenantId" FROM tenant_core_user WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      for (const row of res.rows as { id: string; tenantId: string | null }[]) {
        if (row.tenantId) mapa.set(row.id, row.tenantId);
      }
    } catch (e: any) {
      this.logger.error(`empresasDeUsuarios falhou: ${e?.message}`);
    } finally {
      client.release();
    }
    return mapa;
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end().catch(() => null);
    }
  }
}
