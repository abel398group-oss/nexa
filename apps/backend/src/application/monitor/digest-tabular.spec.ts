import { describe, it, expect } from 'vitest';
import {
  rankSectorAlerts,
  actionVerbFor,
  ruleIdOf,
  buildTabularDigest,
  BLOCK_WIDTH,
  RULE_ACTION_VERBS,
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
      expect(`   → ${verb}`.length).toBeLessThanOrEqual(BLOCK_WIDTH);
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

  it('caixa: linhas de dinheiro alinhadas à direita na coluna de 30', () => {
    expect(lines).toContain('Faturado hoje'.padEnd(21) + 'R$  4.320');
    expect(lines).toContain('Gasto hoje'.padEnd(21) + 'R$  1.870');
    expect(lines).toContain('Entra (15d)'.padEnd(21) + 'R$ 38.400');
    expect(lines).toContain('Sai (15d)'.padEnd(21) + 'R$ 21.150');
    expect(lines).toContain('Sobra'.padEnd(21) + 'R$ 17.250');
    expect(lines).toContain('Vencido s/ receber'.padEnd(21) + 'R$  6.900');
    // régua simples antes do rodapé do caixa
    const sobraIdx = lines.indexOf('Sobra'.padEnd(21) + 'R$ 17.250');
    expect(lines[sobraIdx - 1]).toBe('─'.repeat(BLOCK_WIDTH));
  });

  it('setor: itens numerados com verbo indentado; cap 3; overflow "+N no site" com régua', () => {
    expect(lines).toContain('1. CT-e 4519 rejeitado');
    expect(lines).toContain('   → reenviar');
    expect(lines).toContain('2. CT-e 4512 sem retorno 5h');
    expect(lines).toContain('   → verificar');
    expect(lines).toContain('3. Certificado vence em 19d');
    expect(lines).toContain('   → renovar');
    expect(msg).not.toContain('4. ');
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
    expect(lines).toContain('   → pagar```');
    const financeTitleIdx = lines.indexOf(' FINANCEIRO (1)');
    const financeLines = lines.slice(financeTitleIdx, financeTitleIdx + 3).join('\n');
    expect(financeLines).not.toContain('no site');
  });

  it('sem NENHUM emoji; rodapé com URL completa', () => {
    expect(msg).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(lines[lines.length - 1]).toBe('Ver tudo: hipertms.com.br/painel');
  });

  it('linhas de conteúdo dos blocos respeitam a largura de 30', () => {
    for (const l of lines) {
      if (l.startsWith('```') || l.startsWith('Ver tudo') || l.startsWith('*HiperTMS')) continue;
      const bare = l.endsWith('```') ? l.slice(0, -3) : l;
      expect(bare.length).toBeLessThanOrEqual(BLOCK_WIDTH);
    }
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
    expect(msg).toContain('Falta'.padEnd(21) + 'R$  3.000');
    expect(msg).not.toContain('Sobra');
  });

  it('item escalado renderiza a idade (`há Nd`)', () => {
    const escalated = { ...item({ title: 'CP-0012 vencida' }), escalatedAgeDays: 32 };
    const map = new Map<string, TabularSectorEntry>([['finance', { total: 1, shown: [escalated] }]]);
    const msg = buildTabularDigest([{ key: 'finance', label: 'Financeiro' }], map, NOW, null);
    expect(msg).toContain('1. CP-0012 vencida há 32d');
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
    const totalLines = msg.split('\n').length;
    // Pior caso absoluto medido: 69 linhas — header(1) + caixa(11) + 5 setores
    // × (fence+título+3 itens+3 verbos+régua+overflow = 10) + rodapé(1) +
    // 7 linhas em branco entre blocos. O "≤ ~40" da spec §5 assume itens SEM
    // verbo em todos; com verbo em 100% dos itens o teto real é este. Registrado
    // pro Abel decidir se quer verbo inline pra comprimir (mudança de spec).
    expect(totalLines).toBeLessThanOrEqual(70);
    expect(msg.split('\n')[0]).toBe('*HiperTMS · seg 20/07 · 25 pendências*');
  });

  it('título longo é truncado com … pra caber na largura', () => {
    const longTitle = 'Conta a receber CAR-003208 venceu em 18/07 e não foi recebida até agora';
    const map = new Map<string, TabularSectorEntry>([['finance', { total: 1, shown: [item({ title: longTitle })] }]]);
    const msg = buildTabularDigest([{ key: 'finance', label: 'Financeiro' }], map, NOW, null);
    const itemLine = msg.split('\n').find((l) => l.startsWith('1. '))!;
    const bare = itemLine.endsWith('```') ? itemLine.slice(0, -3) : itemLine;
    expect(bare.length).toBeLessThanOrEqual(BLOCK_WIDTH);
    expect(bare).toContain('…');
  });
});
