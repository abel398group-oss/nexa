// Necessário antes do class-transformer: `plainToInstance` lê metadata de
// decorator, e sem isto o arquivo inteiro morre com "Reflect.getMetadata is not
// a function" — suíte que falha ANTES de rodar um teste, ou seja, verde falso.
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateConversationDto,
  ListConversationsQueryDto,
} from './conversations.dto';

/**
 * Casos reais medidos em 13/08/2026 testando o Inbox. Antes destes DTOs o
 * ValidationPipe global não agia — `POST /api/conversations` e o `?status=` da
 * listagem tinham `@Body()`/`@Query()` sem validação de valor, e o texto cru
 * chegava até o enum do Prisma. O resultado era 500 "Internal server error" no
 * lugar de um 400 dizendo o que estava errado, e campo inventado no corpo
 * respondendo 201.
 */

/** Roda a mesma pipeline do ValidationPipe global (whitelist + forbidNonWhitelisted). */
async function erros(Cls: any, payload: any): Promise<string[]> {
  const instancia = plainToInstance(Cls, payload);
  const r = await validate(instancia, { whitelist: true, forbidNonWhitelisted: true });
  return r.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('CreateConversationDto', () => {
  it('corpo vazio é recusado — antes virava 500 no Prisma', async () => {
    const e = await erros(CreateConversationDto, {});
    expect(e.join(' ')).toContain('contactId');
    expect(e.join(' ')).toContain('phone');
  });

  it('phone numérico é recusado — antes ia cru pra coluna de texto', async () => {
    const e = await erros(CreateConversationDto, { contactId: 'c1', phone: 12345 });
    expect(e).toContain('phone must be a string');
  });

  it('sourceChannel fora do enum é recusado, não estourado', async () => {
    const e = await erros(CreateConversationDto, {
      contactId: 'c1',
      phone: '5511999999999',
      sourceChannel: 'banana',
    });
    expect(e.join(' ')).toContain('sourceChannel must be one of');
  });

  it('agentType fora do enum é recusado', async () => {
    const e = await erros(CreateConversationDto, {
      contactId: 'c1',
      phone: '5511999999999',
      agentType: 'chefe',
    });
    expect(e.join(' ')).toContain('agentType must be one of');
  });

  // O ponto do DTO existir: sem uma CLASSE no @Body() o forbidNonWhitelisted
  // nem roda, e um campo inventado entrava com 201.
  it('campo não declarado é recusado', async () => {
    const e = await erros(CreateConversationDto, {
      contactId: 'c1',
      phone: '5511999999999',
      hackeado: true,
    });
    expect(e).toContain('property hackeado should not exist');
  });

  it('o caso VÁLIDO continua passando', async () => {
    const e = await erros(CreateConversationDto, {
      contactId: 'c1',
      phone: '5511999999999',
      sourceChannel: 'whatsapp',
      agentType: 'router',
      productCode: 'hipertms',
      assignedSellerId: 's1',
    });
    expect(e).toEqual([]);
  });

  it('só os obrigatórios também basta', async () => {
    const e = await erros(CreateConversationDto, { contactId: 'c1', phone: '5511999999999' });
    expect(e).toEqual([]);
  });
});

describe('ListConversationsQueryDto — status', () => {
  it('status inventado é recusado — antes derrubava a listagem inteira com 500', async () => {
    const e = await erros(ListConversationsQueryDto, { status: 'banana' });
    expect(e.join(' ')).toContain('status must be one of');
  });

  // 'all' é o chip "Todas" do Inbox. O frontend o remove da query, mas um link
  // colado com ?status=all precisa responder lista, não erro.
  it("'all' é aceito", async () => {
    expect(await erros(ListConversationsQueryDto, { status: 'all' })).toEqual([]);
  });

  it.each(['open', 'waiting_customer', 'waiting_internal', 'escalated', 'opt_out', 'closed'])(
    "'%s' é aceito",
    async (s) => {
      expect(await erros(ListConversationsQueryDto, { status: s })).toEqual([]);
    },
  );

  it('sem status continua válido', async () => {
    expect(await erros(ListConversationsQueryDto, {})).toEqual([]);
  });
});
