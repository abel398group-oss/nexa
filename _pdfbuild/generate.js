const PDFDocument = require('pdfkit');
const fs = require('fs');

// paleta
const NAVY = '#152138';
const NAVY2 = '#1d2c4a';
const GOLD = '#f2b705';
const INK = '#1f2733';
const MUT = '#6b7280';
const LIGHT = '#f4f6f9';
const LINE = '#e3e7ee';
const WHITE = '#ffffff';

const doc = new PDFDocument({ size: 'A4', margin: 0 });
const out = fs.createWriteStream(__dirname + '/../portfolio_hipertms.pdf');
doc.pipe(out);

const W = 595.28, H = 841.89, M = 50, CW = W - M * 2;

function logo(x, y, s = 28) {
  // quadrado dourado arredondado com "H"
  doc.roundedRect(x, y, s, s, s * 0.22).fill(GOLD);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(s * 0.62).text('H', x, y + s * 0.18, { width: s, align: 'center' });
}

// ---------- PÁGINA 1 — CAPA ----------
doc.rect(0, 0, W, H).fill(NAVY);
// faixa decorativa
doc.rect(0, 0, W, 6).fill(GOLD);
doc.save().rotate(-18, { origin: [W - 60, 120] }).roundedRect(W - 180, 60, 360, 90, 14).fill(NAVY2).restore();

logo(M, 70, 40);
doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(20).text('HiperTMS', M + 52, 80);
doc.fillColor('#9fb3d1').font('Helvetica').fontSize(10).text('www.hipertms.com.br', M + 52, 104);

// título central
doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(46).text('Gestão de', M, 300, { width: CW });
doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(46).text('Transporte Inteligente', M, 348, { width: CW });

doc.fillColor('#c7d3e6').font('Helvetica').fontSize(14).text(
  'O sistema completo para a sua transportadora: fiscal, frota, fretes,\nprecificação e financeiro — tudo integrado, num só lugar.',
  M, 420, { width: CW, lineGap: 4 },
);

// selos de destaque (argumentos de venda)
const selos = [
  ['Cadastro fácil', 'comece a usar rápido, sem complicação'],
  ['Emissão de CT-e em segundos', 'integrado à SEFAZ, sem emissor à parte'],
  ['Cotação de frete na hora', 'o sistema calcula o preço automático'],
  ['Tudo integrado', 'fiscal, frota e financeiro num só lugar'],
];
let sy = 492;
selos.forEach((t) => {
  doc.circle(M + 5, sy + 6, 4).fill(GOLD);
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(12.5).text(t[0], M + 20, sy, { continued: true });
  doc.fillColor('#9fb3d1').font('Helvetica').fontSize(11).text('  —  ' + t[1]);
  sy += 28;
});

// rodapé capa
doc.rect(0, H - 70, W, 70).fill(NAVY2);
doc.fillColor('#9fb3d1').font('Helvetica').fontSize(10).text('Software para transportadoras  ·  micro, pequenas e médias', M, H - 46);
doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(11).text('Plano Básico a partir de R$89/mês', M, H - 46, { width: CW, align: 'right' });

// ---------- PÁGINA 2 — MÓDULOS ----------
doc.addPage({ size: 'A4', margin: 0 });
doc.rect(0, 0, W, H).fill(WHITE);
doc.rect(0, 0, 6, H).fill(GOLD);

doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(24).text('Tudo que a sua operação precisa', M, 56, { width: CW });
doc.fillColor(MUT).font('Helvetica').fontSize(12).text('Um só sistema substitui várias planilhas e emissores separados.', M, 88, { width: CW });

const cards = [
  { t: 'Fiscal', c: '#2563eb', items: ['Emissão de CT-e e MDF-e', 'Integrado à SEFAZ + DACTE', 'Cálculo de ICMS automático', 'Certificado digital gerenciado'] },
  { t: 'Gestão de Frota', c: '#0891b2', items: ['Cadastro e custos por veículo', 'Manutenções (preventiva/corretiva)', 'Combustível, consumo (km/l)', 'Histórico de odômetro'] },
  { t: 'Motoristas', c: '#7c3aed', items: ['Cadastro com CNH', 'Alerta de vencimento de docs', 'Diárias e adiantamentos', 'Vínculo a veículo e viagens'] },
  { t: 'Operação & Fretes', c: '#ea580c', items: ['Cotações de frete', 'Fretes, viagens e embarques', 'Ordens de serviço de transporte', 'Importação de XML (NF-e)'] },
  { t: 'Precificação', c: '#16a34a', items: ['Tabelas de frete por rota', 'Motor de tarifa e markup', 'Cotação em segundos', 'Margem protegida'] },
  { t: 'Financeiro', c: '#dc2626', items: ['Contas a pagar e receber', 'Faturas e fluxo de caixa', 'Boletos (cobrança integrada)', 'Ligado às operações'] },
];

const gap = 16, cw = (CW - gap) / 2, ch = 150;
let startY = 130;
cards.forEach((card, i) => {
  const col = i % 2, row = Math.floor(i / 2);
  const x = M + col * (cw + gap);
  const y = startY + row * (ch + gap);
  doc.roundedRect(x, y, cw, ch, 12).fill(LIGHT);
  doc.roundedRect(x, y, cw, 34, 12).fill(card.c);
  doc.rect(x, y + 20, cw, 14).fill(card.c); // tampa o arredondado de baixo do header
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(13).text(card.t, x + 14, y + 10);
  let iy = y + 46;
  card.items.forEach((it) => {
    doc.circle(x + 17, iy + 5, 2.5).fill(card.c);
    doc.fillColor(INK).font('Helvetica').fontSize(9.5).text(it, x + 26, iy, { width: cw - 38 });
    iy += 19;
  });
});

doc.fillColor(MUT).font('Helvetica-Oblique').fontSize(8.5).text('+ Multiempresa/filiais, usuários com permissões, contratos comerciais, tarefas da equipe e painel de indicadores.', M, startY + 3 * ch + 2 * gap + 8, { width: CW });

// ---- Em 3 passos (simplicidade/rapidez) ----
const stepY = startY + 3 * ch + 2 * gap + 34;
doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(15).text('Simples assim — em 3 passos', M, stepY);
const steps = [
  ['1', 'Cadastre', 'veículos, motoristas e clientes — rapidinho'],
  ['2', 'Cote', 'o frete é calculado em segundos, sem erro de margem'],
  ['3', 'Emita', 'CT-e e MDF-e direto, integrado à SEFAZ'],
];
const sbw = (CW - 2 * gap) / 3, sbY = stepY + 28, sbH = 96;
steps.forEach((st, i) => {
  const x = M + i * (sbw + gap);
  doc.roundedRect(x, sbY, sbw, sbH, 12).fill(LIGHT);
  doc.circle(x + 26, sbY + 26, 15).fill(GOLD);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(15).text(st[0], x + 26 - 15, sbY + 18, { width: 30, align: 'center' });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12.5).text(st[1], x + 50, sbY + 18);
  doc.fillColor(MUT).font('Helvetica').fontSize(9).text(st[2], x + 14, sbY + 46, { width: sbw - 26 });
});

// ---------- PÁGINA 3 — BENEFÍCIOS + PLANOS ----------
doc.addPage({ size: 'A4', margin: 0 });
doc.rect(0, 0, W, H).fill(WHITE);
doc.rect(0, 0, 6, H).fill(GOLD);

doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(24).text('Por que o HiperTMS', M, 56, { width: CW });

const benef = [
  ['Evita prejuízo fiscal', 'Menos multa e retrabalho — o CT-e sai certo, integrado à SEFAZ.'],
  ['Cotação em segundos', 'Tabelas e regras de preço calculam o frete na hora, sem erro de margem.'],
  ['Tudo integrado', 'Fiscal, frota, fretes e financeiro conversam — adeus planilhas soltas.'],
  ['Pronto pra crescer', 'Multiusuário e multifilial — escala junto com a sua operação.'],
];
let by = 100;
benef.forEach((b) => {
  doc.roundedRect(M, by, CW, 56, 10).fill(LIGHT);
  doc.roundedRect(M, by, 5, 56, 2).fill(GOLD);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text(b[0], M + 18, by + 11);
  doc.fillColor(MUT).font('Helvetica').fontSize(10.5).text(b[1], M + 18, by + 30, { width: CW - 36 });
  by += 66;
});

// planos
doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text('Planos', M, by + 8);
const planos = [
  { n: 'Básico', p: 'R$89', d: '/mês', f: ['1 usuário', 'CT-e + precificação', 'até 500 docs/mês'] },
  { n: 'Essencial', p: 'R$299', d: '/mês', f: ['5 usuários', 'até 5 filiais', 'até 1.000 docs/mês'], best: true },
  { n: 'Profissional', p: 'R$599', d: '/mês', f: ['15 usuários', 'suporte prioritário', 'até 5.000 docs/mês'] },
];
const pw = (CW - 2 * gap) / 3, py = by + 40, pcH = 150;
planos.forEach((pl, i) => {
  const x = M + i * (pw + gap);
  const bg = pl.best ? NAVY : WHITE;
  doc.roundedRect(x, py, pw, pcH, 12).fill(bg);
  if (!pl.best) doc.roundedRect(x, py, pw, pcH, 12).lineWidth(1).stroke(LINE);
  if (pl.best) {
    doc.roundedRect(x + pw / 2 - 38, py - 11, 76, 22, 11).fill(GOLD);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text('MAIS POPULAR', x + pw / 2 - 38, py - 5, { width: 76, align: 'center' });
  }
  doc.fillColor(pl.best ? GOLD : NAVY).font('Helvetica-Bold').fontSize(14).text(pl.n, x, py + 16, { width: pw, align: 'center' });
  doc.fillColor(pl.best ? WHITE : INK).font('Helvetica-Bold').fontSize(26).text(pl.p, x, py + 38, { width: pw, align: 'center', continued: false });
  doc.fillColor(pl.best ? '#9fb3d1' : MUT).font('Helvetica').fontSize(9).text(pl.d, x, py + 68, { width: pw, align: 'center' });
  let fy = py + 86;
  pl.f.forEach((f) => {
    doc.fillColor(pl.best ? '#c7d3e6' : INK).font('Helvetica').fontSize(9.5).text(f, x, fy, { width: pw, align: 'center' });
    fy += 16;
  });
});

// CTA
const cy = py + pcH + 26;
doc.roundedRect(M, cy, CW, 80, 14).fill(NAVY);
doc.rect(M, cy, 6, 80).fill(GOLD); // não arredonda — visual de barra; cobre com rounded abaixo
doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(17).text('Pronto para rodar com mais margem?', M + 28, cy + 18, { width: CW - 56 });
doc.fillColor('#c7d3e6').font('Helvetica').fontSize(11).text('Fale com a gente e veja o HiperTMS na prática.', M + 28, cy + 44);
doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(13).text('www.hipertms.com.br', M + 28, cy + 44, { width: CW - 56, align: 'right' });

doc.fillColor(MUT).font('Helvetica').fontSize(8).text('HiperTMS — Gestão de Transporte Inteligente', M, H - 40, { width: CW, align: 'center' });

doc.end();
out.on('finish', () => console.log('PDF gerado: portfolio_hipertms.pdf'));
