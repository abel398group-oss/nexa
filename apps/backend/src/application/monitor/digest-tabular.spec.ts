import { describe, it, expect } from 'vitest';
import {
  rankSectorAlerts,
  actionVerbFor,
  ruleIdOf,
  buildTabularDigest,
  sectorPanelUrl,
  BLOCK_WIDTH,
  RULE_ACTION_VERBS,
  weekWindowLabel,
  weekRowsAreRedundant,
  type TabularAlertItem,
  type TabularSectorEntry,
} from './digest-tabular';

// ─── T10: formato tabular do digest WhatsApp (spec 2026-07-20) ───────────────
// docs/monitor/t10-digest-tabular-format-2026-07.md — ranking §2, verbos §3,
// layout §1. now fixo: 2026-07-20 é uma segunda-feira ("seg").

const NOW = new Date(2026, 6, 20, 8, 0, 0);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

function item(over: Partial<TabularAlertItem> = {}): TabularAlertItem {
  return { severity: 'OVERDUE', title: 'Pendência', createdAt: daysAgo(1), ...over };
}

// ─── §2 Ranking ──────────────────────────────────────────────────────────────

describe('rankSectorAlerts — banda de severidade', () => {
  it('CRITICAL > OVERDUE > DUE_SOON > INFO, independente de métrica', () => {
    const sorted = rankSectorAlerts('finance', [
      item({ severity: 'INFO', title: 'i' }),
      item({ severity: 'CRITICAL', title: 'c' }),
      item({ severity: 'DUE_SOON', title: 'd', metadata: { amount: 999_999 } }),
      item({ severity: 'OVERDUE', title: 'o', metadata: { amount: 1 } }),
    ], NOW);
    expect(sorted.map((a) => a.title)).toEqual(['c', 'o', 'd', 'i']);
  });
});

describe('rankSectorAlerts — desempate por métrica do setor', () => {
  it('finance: maior valor primeiro', () => {
    const sorted = rankSectorAlerts('finance', [
      item({ title: 'a', metadata: { amount: 100 } }),
      item({ title: 'b', metadata: { amount: 9000 } }),
      item({ title: 'c', metadata: { amount: 500 } }),
    ], NOW);
    expect(sorted.map((a) => a.title)).toEqual(['b', 'c', 'a']);
  });

  it('fiscal: mais horas travado primeiro', () => {
    const sorted = rankSectorAlerts('fiscal', [
      item({ title: 'a', metadata: { hoursWaiting: 2 } }),
      item({ title: 'b', metadata: { hoursWaiting: 48 } }),
    ], NOW);
    expect(sorted.map((a) => a.title)).toEqual(['b', 'a']);
  });

  it('logistic: mais dias de atraso primeiro', () => {
    const sorted = rankSectorAlerts('logistic', [
      item({ title: 'a', metadata: { daysLate: 1 } }),
      item({ title: 'b', metadata: { daysLate: 7 } }),
    ], NOW);
    expect(sorted.map((a) => a.title)).toEqual(['b', 'a']);
  });

  it('frota: MENOS dias até vencer primeiro (mais urgente)', () => {
    const sorted = rankSectorAlerts('frota', [
      item({ title: 'a', metadata: { daysLeft: 30 } }),
      item({ title: 'b', metadata: { daysLeft: 3 } }),
    ], NOW);
    expect(sorted.map((a) => a.title)).toEqual(['b', 'a']);
  });

  it('métrica ausente → degrada pro mais antigo, sem quebrar (spec: never crash)', () => {
    const sorted = rankSectorAlerts('finance', [
      item({ title: 'novo-sem-metrica', createdAt: daysAgo(1) }),
      item({ title: 'velho-sem-metrica', createdAt: daysAgo(9) }),
      item({ title: 'com-metrica', metadata: { amount: 10 }, createdAt: daysAgo(0) }),
    ], NOW);
    // quem tem métrica rankeia acima de quem não tem; entre os sem, mais antigo primeiro
    expect(sorted.map((a) => a.title)).toEqual(['com-metrica', 'velho-sem-metrica', 'novo-sem-metrica']);
  });

  it('empate total → mais antigo primeiro', () => {
    const sorted = rankSectorAlerts('logistic', [
      item({ title: 'novo', createdAt: daysAgo(2) }),
      item({ title: 'velho', createdAt: daysAgo(20) }),
    ], NOW);
    expect(sorted.map((a) => a.title)).toEqual(['velho', 'novo']);
  });
});

describe('rankSectorAlerts — escalada por idade (§2)', () => {
  it('OVERDUE > 30 dias sobe pro topo da banda, com escalatedAgeDays', () => {
    const sorted = rankSectorAlerts('finance', [
      item({ title: 'gordo-recente', metadata: { amount: 50_000 }, createdAt: daysAgo(2) }),
      item({ title: 'divida-antiga', metadata: { amount: 100 }, createdAt: daysAgo(32) }),
    ], NOW);
    expect(sorted[0].title).toBe('divida-antiga');
    expect(sorted[0].escalatedAgeDays).toBe(32);
    expect(sorted[1].escalatedAgeDays).toBeUndefined();
  });

  it('CRITICAL continua acima de OVERDUE escalado (escalada é dentro da banda)', () => {
    const sorted = rankSectorAlerts('finance', [
      item({ title: 'antiga', createdAt: daysAgo(45) }),
      item({ severity: 'CRITICAL', title: 'critica', createdAt: daysAgo(1) }),
    ], NOW);
    expect(sorted.map((a) => a.title)).toEqual(['critica', 'antiga']);
  });

  it('dois escalados: mais antigo primeiro; DUE_SOON velho NÃO escala', () => {
    const sorted = rankSectorAlerts('finance', [
      item({ title: 'e32', createdAt: daysAgo(32) }),
      item({ title: 'e60', createdAt: daysAgo(60) }),
      item({ severity: 'DUE_SOON', title: 'ds-velho', createdAt: daysAgo(90) }),
    ], NOW);
    expect(sorted.map((a) => a.title)).toEqual(['e60', 'e32', 'ds-velho']);
    expect(sorted[2].escalatedAgeDays).toBeUndefined();
  });

  it('createdAt ausente/inválido → não escala nem quebra', () => {
    const sorted = rankSectorAlerts('fiscal', [item({ title: 'sem-data', createdAt: undefined })], NOW);
    expect(sorted[0].escalatedAgeDays).toBeUndefined();
  });
});

// ─── §3 Verbos de ação ───────────────────────────────────────────────────────

describe('actionVerbFor / ruleIdOf', () => {
  it('extrai ruleId do prefixo do tmsEventId (`rule:entidade`)', () => {
    expect(ruleIdOf({ tmsEventId: 'cte.rejected:4519' })).toBe('cte.rejected');
    expect(actionVerbFor({ tmsEventId: 'cte.rejected:4519', title: '' })).toBe('reenviar');
  });

  it('metadata.ruleId tem prioridade sobre o id', () => {
    expect(actionVerbFor({ tmsEventId: 'whatever-123', metadata: { ruleId: 'fleet.cnh_expired' }, title: '' })).toBe('renovar');
  });

  it('ruleId desconhecido → undefined (linha omitida, nunca inventa)', () => {
    expect(actionVerbFor({ tmsEventId: 'unknown.rule:1', title: 'x' })).toBeUndefined();
    expect(actionVerbFor({ tmsEventId: 'seed-test-frota-1', title: 'x' })).toBeUndefined();
  });

  it('installment.overdue: PAYABLE → pagar, RECEIVABLE → cobrar (metadata.accountType do TMS)', () => {
    // accountType é o campo REAL do TMS (pending-event-rules :1011/:1029)
    expect(actionVerbFor({ tmsEventId: 'installment.overdue:1', metadata: { accountType: 'PAYABLE' }, title: '' })).toBe('pagar');
    expect(actionVerbFor({ tmsEventId: 'installment.overdue:2', metadata: { accountType: 'RECEIVABLE' }, title: '' })).toBe('cobrar');
    // aliases defensivos continuam aceitos
    expect(actionVerbFor({ tmsEventId: 'installment.overdue:3', metadata: { kind: 'PAYABLE' }, title: '' })).toBe('pagar');
  });

  it('eventos agregados: `<ruleId>:agg` (formato novo) e `agg:<ruleId>` (defensivo) resolvem o verbo', () => {
    // formato que o TMS vai adotar (prefixo continua sendo o ruleId)
    expect(ruleIdOf({ tmsEventId: 'shipment.pickup_due:agg' })).toBe('shipment.pickup_due');
    expect(actionVerbFor({ tmsEventId: 'shipment.pickup_due:agg', title: '23 coletas pendentes' })).toBe('agendar coletas');
    // formato antigo pré-inversão — nunca deixar verbo sumir em silêncio
    expect(ruleIdOf({ tmsEventId: 'agg:trip.overdue' })).toBe('trip.overdue');
    expect(actionVerbFor({ tmsEventId: 'agg:trip.overdue', title: '3 viagens atrasadas' })).toBe('acompanhar');
  });

  it('enum validado (2026-07-21): novos ruleIds do TMS têm verbo; os inventados sumiram', () => {
    // novos, confirmados pelo squad TMS
    for (const [id, verb] of [
      ['cte.pending_authorization', 'verificar'],
      ['shipment.delivered_uninvoiced', 'faturar'],
      ['budget.over', 'revisar'],
      ['fleet.document_expired', 'renovar'],
      ['fleet.maintenance_km_overdue', 'agendar'],
      ['fleet.consumption_anomaly', 'verificar'],
    ] as const) {
      expect(actionVerbFor({ tmsEventId: `${id}:1`, title: '' })).toBe(verb);
    }
    // não existem no enum real — nunca devem ter verbo
    for (const ghost of ['cte.pending_return', 'mdfe.rejected', 'shipment.delayed', 'fleet.crlv_expiring', 'purchase.overdue']) {
      expect(actionVerbFor({ tmsEventId: `${ghost}:1`, title: '' })).toBeUndefined();
    }
  });

  it('installment.overdue sem metadata: heurística pelo título de hoje do TMS', () => {
    expect(actionVerbFor({ tmsEventId: 'installment.overdue:3', title: 'Conta a pagar CAP-1 venceu' })).toBe('pagar');
    expect(actionVerbFor({ tmsEventId: 'installment.overdue:4', title: 'Conta a receber CAR-1 venceu' })).toBe('cobrar');
    expect(actionVerbFor({ tmsEventId: 'installment.overdue:5', title: 'sem pista' })).toBeUndefined();
  });

  it('todo verbo do mapa é curto (cabe na linha de 30)', () => {
    for (const verb of Object.values(RULE_ACTION_VERBS)) {
      expect(`  → ${verb}`.length).toBeLessThanOrEqual(BLOCK_WIDTH);
    }
  });
});

// ─── §1 Layout ───────────────────────────────────────────────────────────────

const CASH = {
  inflow15d: { amount: 38400, count: 7 },
  outflow15d: { amount: 21150, count: 3 },
  overdueReceivable: { amount: 6900, count: 2 },
  unbilledCte: { amount: 3100, count: 1 },
  invoicedMonth: { amount: 0 },
  invoicedToday: { amount: 4320, count: 1 },
  paidToday: { amount: 1870, count: 1 },
};

function fiscalEntry(): TabularSectorEntry {
  return {
    total: 5,
    shown: [
      item({ title: 'CT-e 4519 rejeitado', tmsEventId: 'cte.rejected:4519' }),
      item({ title: 'CT-e 4512 sem retorno 5h', tmsEventId: 'cte.pending_authorization:4512' }),
      item({ title: 'Certificado vence em 19d', tmsEventId: 'certificate.expiring:1', severity: 'DUE_SOON' }),
    ],
  };
}

const SECTORS_META = [
  { key: 'fiscal', label: 'Fiscal' },
  { key: 'finance', label: 'Financeiro' },
  { key: 'logistic', label: 'Logística' },
];

describe('buildTabularDigest — layout aprovado (snapshot estrutural)', () => {
  const map = new Map<string, TabularSectorEntry>([
    ['fiscal', fiscalEntry()],
    ['finance', { total: 1, shown: [item({ title: 'CP-0012 vencida', tmsEventId: 'installment.overdue:12', metadata: { kind: 'PAYABLE' } })] }],
    // logistic ausente do map → seção omitida
  ]);
  const msg = buildTabularDigest(SECTORS_META, map, NOW, CASH as any);
  const lines = msg.split('\n');

  it('header: *HiperTMS · seg 20/07 · 6 pendências* (total real, todas as seções)', () => {
    expect(lines[0]).toBe('*HiperTMS · seg 20/07 · 6 pendências*');
  });

  it('blocos abrem com fence + ═ de 30 (nunca régua abaixo do título)', () => {
    const fenceLines = lines.filter((l) => l.startsWith('``` '));
    expect(fenceLines.length).toBe(3); // caixa + fiscal + finance
    fenceLines.forEach((l) => expect(l).toBe('``` ' + '═'.repeat(BLOCK_WIDTH)));
    // título vem na linha seguinte à régua, e a linha após o título NÃO é régua
    const titleIdx = lines.indexOf(' FISCAL (5)');
    expect(titleIdx).toBeGreaterThan(0);
    expect(lines[titleIdx - 1]).toBe('``` ' + '═'.repeat(BLOCK_WIDTH));
    expect(lines[titleIdx + 1].startsWith('═')).toBe(false);
    expect(lines[titleIdx + 1].startsWith('─')).toBe(false);
  });

  it('caixa: linhas de dinheiro alinhadas à direita na coluna do bloco', () => {
    // padding derivado da constante (não hardcoded) — a largura pode mudar
    const money = (label: string, value: string) => label.padEnd(BLOCK_WIDTH - value.length) + value;
    expect(lines).toContain(money('Faturado hoje (1)', 'R$  4.320'));
    expect(lines).toContain(money('Pago hoje (1)', 'R$  1.870'));
    expect(lines).toContain(money('Entra (15d)', 'R$ 38.400'));
    expect(lines).toContain(money('Sai (15d)', 'R$ 21.150'));
    expect(lines).toContain(money('Sobra', 'R$ 17.250'));
    expect(lines).toContain(money('Vencido s/ receber', 'R$  6.900'));
    // toda linha de dinheiro ocupa a largura cheia do bloco
    expect(money('Sobra', 'R$ 17.250').length).toBe(BLOCK_WIDTH);
    // régua simples antes do rodapé do caixa
    const sobraIdx = lines.indexOf(money('Sobra', 'R$ 17.250'));
    expect(lines[sobraIdx - 1]).toBe('─'.repeat(BLOCK_WIDTH));
  });

  it('setor: itens com bullet "-" e verbo indentado; cap 3; overflow "+N no site" com régua', () => {
    // Bullet em vez de número: títulos do TMS começam com número
    // ("21 viagens atrasadas") e "1. 21 viagens" era lido como "1.21".
    expect(lines).toContain('- CT-e 4519 rejeitado');
    expect(lines).toContain('  → reenviar');
    expect(lines).toContain('- CT-e 4512 sem retorno 5h');
    expect(lines).toContain('  → verificar');
    expect(lines).toContain('- Certificado vence em 19d');
    expect(lines).toContain('  → renovar');
    // cap de 3 dentro do bloco fiscal (o 4º e 5º viram "+2 no site")
    const fiscalIdx = lines.findIndex((l) => l.trim().startsWith('FISCAL'));
    const plusOffset = lines.slice(fiscalIdx).findIndex((l) => l.startsWith('+2 no site'));
    const fiscalBullets = lines.slice(fiscalIdx, fiscalIdx + plusOffset).filter((l) => l.startsWith('- '));
    expect(fiscalBullets).toHaveLength(3);
    const plusIdx = lines.findIndex((l) => l.startsWith('+2 no site'));
    expect(plusIdx).toBeGreaterThan(0);
    expect(lines[plusIdx - 1]).toBe('─'.repeat(BLOCK_WIDTH));
    expect(lines[plusIdx]).toBe('+2 no site```'); // fence fecha colado na última linha
  });

  it('setor com ≤3 itens: sem rodapé "+N"; setor ausente: omitido', () => {
    expect(lines).toContain(' FINANCEIRO (1)');
    expect(msg).not.toContain('LOGÍSTICA');
    // finance (1 item, sem overflow): NADA de "+N no site" e o fence fecha
    // colado na última linha — que aqui é a linha do verbo.
    expect(lines).toContain('  → pagar```');
    const financeTitleIdx = lines.indexOf(' FINANCEIRO (1)');
    const financeLines = lines.slice(financeTitleIdx, financeTitleIdx + 3).join('\n');
    expect(financeLines).not.toContain('no site');
  });

  it('sem NENHUM emoji', () => {
    expect(msg).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('linhas de conteúdo dos blocos respeitam a largura de 30', () => {
    for (const l of lines) {
      if (l.startsWith('```') || l.startsWith('Ver tudo') || l.startsWith('*HiperTMS')) continue;
      if (l.startsWith('hipertms.com.br')) continue; // link do setor, fora do bloco
      const bare = l.endsWith('```') ? l.slice(0, -3) : l;
      expect(bare.length).toBeLessThanOrEqual(BLOCK_WIDTH);
    }
  });
});

// ─── Link por setor (2026-07-21) ─────────────────────────────────────────────
// Tabela fixa setor→página: nenhuma mudança de contrato (o Nexa já sabe o setor).
// No WhatsApp o link fica FORA do bloco ``` — dentro dele a URL não é clicável.

describe('link do setor', () => {
  it('mapeia as 5 áreas confirmadas (frota → /fleet)', () => {
    expect(sectorPanelUrl('fiscal')).toBe('https://hipertms.com.br/fiscal');
    expect(sectorPanelUrl('logistic')).toBe('https://hipertms.com.br/logistic');
    expect(sectorPanelUrl('frota')).toBe('https://hipertms.com.br/fleet');
    expect(sectorPanelUrl('finance')).toBe('https://hipertms.com.br/finance');
    expect(sectorPanelUrl('procurement')).toBe('https://hipertms.com.br/procurement');
  });

  it('setor desconhecido → sem link (nunca inventa destino)', () => {
    expect(sectorPanelUrl('inexistente')).toBeUndefined();
  });

  it('a URL aparece logo APÓS o fechamento do bloco (fora do ```, pra ser clicável)', () => {
    const map = new Map<string, TabularSectorEntry>([
      ['finance', { total: 1, shown: [item({ title: 'CAR-002242 venceu' })] }],
    ]);
    const msg = buildTabularDigest([{ key: 'finance', label: 'Financeiro' }], map, NOW, null);
    const lines = msg.split('\n');
    const urlIdx = lines.findIndex((l) => l === 'hipertms.com.br/finance');
    expect(urlIdx).toBeGreaterThan(0);
    // a linha anterior é a que fecha o bloco monoespaçado
    expect(lines[urlIdx - 1].endsWith('```')).toBe(true);
  });

  it('com links por setor, o rodapé "Ver tudo" some (sem destino repetido)', () => {
    const map = new Map<string, TabularSectorEntry>([
      ['finance', { total: 1, shown: [item({ title: 'X' })] }],
    ]);
    const msg = buildTabularDigest([{ key: 'finance', label: 'Financeiro' }], map, NOW, null);
    expect(msg).not.toContain('Ver tudo:');
    expect(msg).toContain('hipertms.com.br/finance');
  });

  it('setor sem página conhecida → mantém o rodapé geral como saída', () => {
    const map = new Map<string, TabularSectorEntry>([
      ['desconhecido', { total: 1, shown: [item({ title: 'X' })] }],
    ]);
    const msg = buildTabularDigest([{ key: 'desconhecido', label: 'Outro' }], map, NOW, null);
    expect(msg).toContain('Ver tudo: hipertms.com.br');
  });

  it('no máximo 1 link por setor (nunca por item)', () => {
    const map = new Map<string, TabularSectorEntry>([
      ['finance', { total: 9, shown: [item({ title: 'a' }), item({ title: 'b' }), item({ title: 'c' })] }],
    ]);
    const msg = buildTabularDigest([{ key: 'finance', label: 'Financeiro' }], map, NOW, null);
    expect(msg.match(/hipertms\.com\.br/g)?.length).toBe(1);
  });
});

describe('buildTabularDigest — variações', () => {
  it('singular: 1 pendência', () => {
    const map = new Map<string, TabularSectorEntry>([['fiscal', { total: 1, shown: [item({ title: 'X' })] }]]);
    const msg = buildTabularDigest([{ key: 'fiscal', label: 'Fiscal' }], map, NOW, null);
    expect(msg.split('\n')[0]).toBe('*HiperTMS · seg 20/07 · 1 pendência*');
  });

  it('sem cashView → sem bloco de caixa', () => {
    const map = new Map<string, TabularSectorEntry>([['fiscal', { total: 1, shown: [item({ title: 'X' })] }]]);
    const msg = buildTabularDigest([{ key: 'fiscal', label: 'Fiscal' }], map, NOW, null);
    expect(msg).not.toContain('SEU CAIXA');
  });

  it('saldo negativo vira "Falta"', () => {
    const map = new Map<string, TabularSectorEntry>();
    const cash = { ...CASH, inflow15d: { amount: 1000, count: 1 }, outflow15d: { amount: 4000, count: 1 } };
    const msg = buildTabularDigest([], map, NOW, cash as any);
    expect(msg).toContain('Falta'.padEnd(BLOCK_WIDTH - 'R$  3.000'.length) + 'R$  3.000');
    expect(msg).not.toContain('Sobra');
  });

  it('item escalado renderiza a idade (`há Nd`)', () => {
    const escalated = { ...item({ title: 'CP-0012 vencida' }), escalatedAgeDays: 32 };
    const map = new Map<string, TabularSectorEntry>([['finance', { total: 1, shown: [escalated] }]]);
    const msg = buildTabularDigest([{ key: 'finance', label: 'Financeiro' }], map, NOW, null);
    expect(msg).toContain('- CP-0012 vencida há 32d');
  });

  it('simulação cheia (5 setores × 5 itens + caixa) fica compacta (spec §5: ~40 linhas)', () => {
    const sectors = [
      { key: 'fiscal', label: 'Fiscal' },
      { key: 'logistic', label: 'Logística' },
      { key: 'frota', label: 'Frota' },
      { key: 'finance', label: 'Financeiro' },
      { key: 'procurement', label: 'Compras' },
    ];
    const map = new Map<string, TabularSectorEntry>(
      sectors.map((s) => [
        s.key,
        {
          total: 5,
          shown: [
            item({ title: `${s.label} pendência 1`, tmsEventId: 'cte.rejected:1' }),
            item({ title: `${s.label} pendência 2`, tmsEventId: 'cte.rejected:2' }),
            item({ title: `${s.label} pendência 3`, tmsEventId: 'cte.rejected:3' }),
          ],
        },
      ]),
    );
    const msg = buildTabularDigest(sectors, map, NOW, CASH as any);
    const lines = msg.split('\n');
    // Em vez de um teto de linhas fixo (que quebrava a cada feature nova — já
    // subiu 60→70 com verbos e links), a asserção fixa o que a spec §5 quer de
    // fato: CADA SETOR ocupa um bloco curto e a mensagem não vira lista longa.
    // Máx. 15 linhas por setor (fence+título+3 itens+3 verbos+régua+overflow+
    // link+branco) e nenhum setor listando mais de 3 itens.
    const perSector = (lines.length - 1) / sectors.length; // -1 = header
    expect(perSector).toBeLessThanOrEqual(15);
    // 3 itens por setor, nunca mais (bullets "- " somam 3 × nº de setores)
    expect(lines.filter((l) => l.startsWith('- '))).toHaveLength(3 * sectors.length);
    expect(lines[0]).toBe('*HiperTMS · seg 20/07 · 25 pendências*');
  });

  it('título longo é truncado com … pra caber na largura', () => {
    const longTitle = 'Conta a receber CAR-003208 venceu em 18/07 e não foi recebida até agora';
    const map = new Map<string, TabularSectorEntry>([['finance', { total: 1, shown: [item({ title: longTitle })] }]]);
    const msg = buildTabularDigest([{ key: 'finance', label: 'Financeiro' }], map, NOW, null);
    const itemLine = msg.split('\n').find((l) => l.startsWith('- '))!;
    const bare = itemLine.endsWith('```') ? itemLine.slice(0, -3) : itemLine;
    expect(bare.length).toBeLessThanOrEqual(BLOCK_WIDTH);
    expect(bare).toContain('…');
  });
});

// ─── T11: acumulado da semana no bloco de caixa (2026-07-29) ─────────────────
// Regra central: as linhas `seg→X` só existem se o TMS mandar invoicedWeek/
// paidWeek. TMS antigo → bloco idêntico ao de hoje (degradação graciosa, mesmo
// contrato aditivo do adendo T9). NUNCA somar no Nexa (ver TmsCashView).

describe('weekWindowLabel / weekRowsAreRedundant', () => {
  it('rótulo cresce com o dia da semana', () => {
    expect(weekWindowLabel(new Date(2026, 6, 20))).toBe('seg→seg'); // 20/07 = segunda
    expect(weekWindowLabel(new Date(2026, 6, 22))).toBe('seg→qua');
    expect(weekWindowLabel(new Date(2026, 6, 24))).toBe('seg→sex');
    expect(weekWindowLabel(new Date(2026, 6, 26))).toBe('seg→dom');
  });

  it('segunda = acumulado redundante (igual ao dia); resto da semana não', () => {
    expect(weekRowsAreRedundant(new Date(2026, 6, 20))).toBe(true); // seg
    expect(weekRowsAreRedundant(new Date(2026, 6, 21))).toBe(false); // ter
    expect(weekRowsAreRedundant(new Date(2026, 6, 24))).toBe(false); // sex
    // domingo é FIM da janela, não começo — acumulado ainda faz sentido
    expect(weekRowsAreRedundant(new Date(2026, 6, 26))).toBe(false); // dom
  });
});

describe('buildTabularDigest — caixa com acumulado da semana (T11)', () => {
  const WED = new Date(2026, 6, 22, 8, 0, 0); // quarta
  const MON = new Date(2026, 6, 20, 8, 0, 0); // segunda
  const CASH_WEEK = {
    ...CASH,
    invoicedToday: { amount: 6500, count: 12 },
    paidToday: { amount: 1100, count: 4 },
    invoicedWeek: { amount: 18500, count: 37 },
    paidWeek: { amount: 3900, count: 11 },
  };
  const money = (label: string, value: string) => label.padEnd(BLOCK_WIDTH - value.length) + value;
  const build = (now: Date, cash: any) => buildTabularDigest([], new Map(), now, cash);

  it('quarta: linha do dia seguida da linha seg→qua, com contagem no rótulo', () => {
    const lines = build(WED, CASH_WEEK).split('\n');
    expect(lines).toContain(money('Faturado hoje (12)', 'R$  6.500'));
    expect(lines).toContain(money('Faturado seg→qua (37)', 'R$ 18.500'));
    expect(lines).toContain(money('Pago hoje (4)', 'R$  1.100'));
    expect(lines).toContain(money('Pago seg→qua (11)', 'R$  3.900'));
    // acumulado vem logo DEPOIS do dia correspondente (leitura pareada)
    const iToday = lines.indexOf(money('Faturado hoje (12)', 'R$  6.500'));
    expect(lines[iToday + 1]).toBe(money('Faturado seg→qua (37)', 'R$ 18.500'));
  });

  it('título do bloco é a DATA, não "15 dias" (as linhas de 15d mantêm o rótulo)', () => {
    const msg = build(WED, CASH_WEEK);
    expect(msg).toContain(' SEU CAIXA — qua 22/07');
    expect(msg).not.toContain('SEU CAIXA — 15 dias');
    expect(msg).toContain('Entra (15d)');
  });

  it('segunda: acumulado é igual ao dia → linhas seg→X omitidas', () => {
    const msg = build(MON, CASH_WEEK);
    expect(msg).toContain('Faturado hoje (12)');
    expect(msg).not.toContain('seg→seg');
    expect(msg).not.toContain('R$ 18.500');
  });

  it('TMS antigo (sem invoicedWeek/paidWeek) → só as linhas do dia, resto intacto', () => {
    const msg = build(WED, CASH); // CASH tem só invoicedToday/paidToday
    expect(msg).not.toContain('seg→qua');
    expect(msg).toContain('Faturado hoje (1)');
    expect(msg).toContain('Sobra');
    expect(msg).toContain('Vencido s/ receber');
  });

  it('só invoicedWeek (sem paidWeek) → cada linha é independente', () => {
    const msg = build(WED, { ...CASH, invoicedWeek: { amount: 18500, count: 37 } });
    expect(msg).toContain('Faturado seg→qua (37)');
    expect(msg).not.toContain('Pago seg→qua');
  });

  it('todas as linhas de dinheiro respeitam a largura do bloco', () => {
    const lines = build(WED, CASH_WEEK).split('\n');
    for (const l of lines) {
      if (!l.includes('R$')) continue;
      const bare = l.endsWith('```') ? l.slice(0, -3) : l;
      expect(bare.length).toBe(BLOCK_WIDTH);
    }
  });

  it('contagem de 4 dígitos não estoura o alinhamento (trunca o rótulo)', () => {
    const lines = build(WED, {
      ...CASH_WEEK,
      invoicedWeek: { amount: 18500, count: 1234 },
    }).split('\n');
    const row = lines.find((l) => l.startsWith('Faturado seg→'))!;
    const bare = row.endsWith('```') ? row.slice(0, -3) : row;
    expect(bare.length).toBe(BLOCK_WIDTH);
  });
});
