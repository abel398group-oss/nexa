import { describe, expect, it, vi } from 'vitest';
import { TmsLookupService } from './tms-lookup.service';

/**
 * A coluna do nome da empresa em `tenant_company`.
 *
 * Em 20/08/2026 a consulta pedia `nome` fixo e o TMS chama de `name`. O Postgres
 * respondeu `column "nome" does not exist`, `batchLookup` marcou `falhou: true` — e
 * como falha ali significa "não deu para verificar quem é cliente", a importação de
 * listas parou por inteiro, junto com qualquer campanha nova. Um nome de coluna
 * derrubou dois módulos.
 *
 * O schema do TMS é de OUTRO projeto: ele muda sem avisar este repositório. Por isso
 * o que se afirma aqui não é "a coluna chama X", e sim que a consulta **descobre** o
 * nome e **sobrevive** a nenhum dos candidatos existir.
 */
function makeClient(colunas: string[]) {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('information_schema.columns')) {
        return { rows: colunas.map((column_name) => ({ column_name })), rowCount: colunas.length };
      }
      // As duas consultas de lookup: devolvem vazio, o que basta aqui — o que
      // interessa é o SQL que foi montado, não a linha que volta.
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  return client;
}

/** Monta o serviço com um pool falso que entrega o client dado. */
function makeSvc(client: any) {
  const svc = new TmsLookupService();
  (svc as any).pool = { connect: async () => client };
  (svc as any).logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return svc;
}

/** O SQL da consulta de empresas — é onde a coluna de nome entra. */
const sqlDasEmpresas = (client: any): string =>
  client.query.mock.calls.map((c: any[]) => String(c[0])).find((s: string) => s.includes('tenant_company') && s.includes('contatoTelefone')) ?? '';

describe('TmsLookup — coluna do nome da empresa', () => {
  const COLUNAS_REAIS = [
    'id', 'tenantId', 'document', 'name', 'status', 'fantasia', 'isActive',
    'contatoEmail', 'contatoTelefone', 'contatoCelular', 'display_name',
  ];

  it('usa `name`, que é como o TMS chama hoje', async () => {
    const client = makeClient(COLUNAS_REAIS);
    const r = await makeSvc(client).batchLookupVerificado(['11988887777']);

    expect(r.falhou).toBe(false);
    expect(sqlDasEmpresas(client)).toContain('"name" AS nome');
  });

  // Base antiga, ou um TMS que volte atrás: continua funcionando.
  it('cai para `nome` quando é esse o schema', async () => {
    const client = makeClient(['contatoTelefone', 'contatoCelular', 'contatoEmail', 'nome']);
    await makeSvc(client).batchLookupVerificado(['11988887777']);

    expect(sqlDasEmpresas(client)).toContain('"nome" AS nome');
  });

  /**
   * O caso que motivou tudo. Sem nenhuma candidata, a consulta sai sem a coluna em
   * vez de estourar: o lookup responde "este telefone é de cliente?", e essa resposta
   * não depende do nome. Perder o rótulo é aceitável; derrubar a peneira não é.
   */
  it('nenhuma coluna de nome: consulta segue de pé, sem rótulo', async () => {
    const client = makeClient(['contatoTelefone', 'contatoCelular', 'contatoEmail']);
    const r = await makeSvc(client).batchLookupVerificado(['11988887777']);

    expect(r.falhou).toBe(false);
    expect(sqlDasEmpresas(client)).toContain('NULL AS nome');
  });

  // O nome interpolado no SQL vem SEMPRE da lista fechada cruzada com o catálogo do
  // banco — nunca de entrada de usuário. É o que torna a interpolação segura.
  it('só interpola nome vindo da lista fechada', async () => {
    const client = makeClient(['contatoTelefone', 'name', 'nome; DROP TABLE x --']);
    await makeSvc(client).batchLookupVerificado(['11988887777']);

    const sql = sqlDasEmpresas(client);
    expect(sql).toContain('"name" AS nome');
    expect(sql).not.toContain('DROP TABLE');
  });

  // O catálogo é consultado uma vez e fica em cache: o schema do TMS não muda em
  // runtime, e o pool tem duas conexões.
  it('pergunta o catálogo uma vez só', async () => {
    const client = makeClient(COLUNAS_REAIS);
    const svc = makeSvc(client);

    await svc.batchLookupVerificado(['11988887777']);
    await svc.batchLookupVerificado(['11977776666']);

    const consultasAoCatalogo = client.query.mock.calls.filter((c: any[]) =>
      String(c[0]).includes('information_schema.columns') && c[1]?.[0] === 'tenant_company',
    );
    expect(consultasAoCatalogo).toHaveLength(1);
  });
});
