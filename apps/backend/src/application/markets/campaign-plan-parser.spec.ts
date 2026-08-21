import { describe, expect, it } from 'vitest';
import { extrairToques } from './campaign-plan-parser';

/**
 * O texto destes testes é o formato REAL dos roteiros
 * (`marketing-social/06_plano_leads_email_whatsapp.md`), copiado como está — com o
 * travessão, a crase no assunto e os colchetes. Um teste com markdown inventado
 * provaria que o parser lê o markdown que eu escrevi, não o que a operação escreve.
 */
const PLANO = `
## 5. Sequências prontas

### 5.1. WhatsApp (via Lia) — 3 toques

**Toque 1 (D0) — abertura/qualificação:**
> Oi, [nome]! Aqui é a Lia, do HiperTMS. Quanto tempo vocês levam para responder uma cotação? 🚚

**Toque 2 (D5, sem resposta) — a virada:**
> [Nome], a maioria dos sistemas só emite CT-e. No HiperTMS a tabela **já vem pronta**.
> _(Responda SAIR para não receber mais mensagens.)_

### 5.2. Email — 4 toques

**Email 1 (D2) — a dor com nome:**
- Assunto: \`Montar tabela de frete cidade por cidade — até quando?\`
- Corpo: dor (tabela manual trava a PME) → virada (o HiperTMS entrega pronta) → CTA calculadora.

**Email 2 (D9) — prova visual:**
- Assunto: \`Todo o Brasil precificado (veja a tela)\`
- Corpo: sequência de 3 prints da cotação real → CTA agendar demonstração.

## 6. Conteúdo de apoio (produzir antes do disparo)

| Peça | Uso | Status |
|---|---|---|
| Vídeo de tela | Somente positivados | Fazer |
`;

describe('extrairToques — as mensagens que já estão no roteiro', () => {
  it('acha os toques de WhatsApp e de e-mail, sem misturar canal', () => {
    const t = extrairToques(PLANO);

    expect(t).toHaveLength(4);
    expect(t.filter((x) => x.channel === 'whatsapp')).toHaveLength(2);
    expect(t.filter((x) => x.channel === 'email')).toHaveLength(2);
  });

  it('o número do toque vira o step — é a posição na cadência', () => {
    const t = extrairToques(PLANO);

    expect(t.find((x) => x.channel === 'email' && x.step === 1)?.subject).toBe(
      'Montar tabela de frete cidade por cidade — até quando?',
    );
    expect(t.find((x) => x.channel === 'email' && x.step === 2)?.subject).toBe(
      'Todo o Brasil precificado (veja a tela)',
    );
  });

  it('o nome é o do plano, para a peça ser reconhecível nas duas telas', () => {
    const t = extrairToques(PLANO);

    expect(t[0].name).toBe('Toque 1 (D0) — abertura/qualificação');
    expect(t.find((x) => x.channel === 'email')?.name).toBe('Email 1 (D2) — a dor com nome');
  });

  it('WhatsApp: a citação inteira vira o corpo, com as linhas na ordem', () => {
    const t = extrairToques(PLANO);
    const toque2 = t.find((x) => x.channel === 'whatsapp' && x.step === 2)!;

    expect(toque2.body).toContain('a maioria dos sistemas só emite CT-e');
    expect(toque2.body).toContain('Responda SAIR');
  });

  // O disparo só resolve {{nome}}, {{saudacao}} e {{remetente}} — `[nome]` sairia
  // literal para o lead.
  it('[nome] e [Nome] viram {{nome}}', () => {
    const t = extrairToques(PLANO);

    expect(t[0].body).toContain('Oi, {{nome}}!');
    expect(t[1].body).toContain('{{nome}}, a maioria');
    expect(t[0].body).not.toContain('[nome]');
  });

  // `[empresa]` tem variável desde 20/08 (renderEmpresa, com fallback "sua
  // empresa"); `[link calculadora]` segue sem — em colchete, salta aos olhos.
  it('[empresa] vira variável; colchete sem variável fica como está', () => {
    const t = extrairToques('**Toque 1 (D0) — x:**\n> Teste em [link calculadora] na [empresa].');

    expect(t[0].body).toContain('[link calculadora]');
    expect(t[0].body).toContain('{{empresa}}');
    expect(t[0].body).not.toContain('[empresa]');
  });

  // O parser precisa parar no fim da seção — senão a tabela de "Conteúdo de apoio"
  // entraria no corpo do último e-mail.
  it('o título da seção seguinte encerra a peça', () => {
    const t = extrairToques(PLANO);
    const ultimo = t[t.length - 1];

    expect(ultimo.body).not.toContain('Vídeo de tela');
    expect(ultimo.body).not.toContain('Conteúdo de apoio');
  });

  // Cabeçalho solto é rascunho de quem estava escrevendo. Virar modelo vazio
  // encheria a tela de Mensagens de linha que ninguém pode enviar.
  it('cabeçalho sem corpo não vira modelo', () => {
    expect(extrairToques('**Toque 3 (D14) — última chamada:**\n\n## outra seção')).toEqual([]);
  });

  // Assunto é obrigatório no modelo de e-mail (MessageTemplatesService.validar):
  // criar sem ele seria criar algo que a própria tela recusa salvar.
  it('e-mail sem assunto fica de fora', () => {
    const t = extrairToques('**Email 1 (D2) — x:**\n- Corpo: só o briefing, sem assunto.');
    expect(t).toEqual([]);
  });

  it('roteiro sem cadência nenhuma devolve vazio, sem erro', () => {
    expect(extrairToques('# Posicionamento\n\nTexto de marca, sem toques.')).toEqual([]);
    expect(extrairToques('')).toEqual([]);
  });
});

/**
 * O formato do plano de agosto/2026 (`12_sequencia_email_solucoes.md`).
 *
 * Título de seção em vez de negrito, `E1` em vez de "Email 1", dia separado por
 * `·`, assunto em `**Assunto (A):**` e corpo inteiro em citação. Quem escreve o
 * plano não pensa no parser — pensa no documento —, e pedir que reescreva um
 * plano pronto para caber num formato que só existe aqui dentro é o caminho para
 * a transcrição manual voltar.
 */
describe('extrairToques — formato de seção (### E1 · D0)', () => {
  const PLANO = [
    '### E1 · D0 — Tabela de frete pronta (o diferencial)',
    '',
    '**Assunto (A):** `tabela de frete cidade por cidade — até quando?`',
    '**Assunto (B):** `[cidade] → qualquer cidade do Brasil`',
    '**Pré-header:** A maioria ainda monta tabela na mão.',
    '',
    '> Oi, [nome].',
    '>',
    '> Quando chega cotação para uma cidade que a [empresa] não atende, o que acontece?',
    '>',
    '> Abraço,',
    '> [Nome]',
    '',
    '### E2 · D3 — Cotação em uma tela',
    '',
    '**Assunto (A):** `a carga vai para quem responde primeiro`',
    '',
    '> [nome], uma conta rápida.',
  ].join('\n');

  it('lê os toques do formato de seção', () => {
    const t = extrairToques(PLANO);
    expect(t).toHaveLength(2);
    expect(t[0].channel).toBe('email');
    expect(t[0].step).toBe(1);
    expect(t[0].name).toContain('D0');
    expect(t[1].step).toBe(2);
  });

  // A variante B existe para o teste A/B; o modelo guarda UM assunto, e escolher
  // o vencedor é decisão de quem lê o resultado, não do parser.
  it('só o primeiro assunto entra — a variante B não sobrescreve', () => {
    const t = extrairToques(PLANO);
    expect(t[0].subject).toBe('tabela de frete cidade por cidade — até quando?');
  });

  // Pré-header é campo do provedor. No corpo, viraria a primeira frase do e-mail,
  // repetindo o assunto.
  it('pré-header não entra no corpo', () => {
    const t = extrairToques(PLANO);
    expect(t[0].body).not.toMatch(/monta tabela na mão/);
  });

  /**
   * `[Nome]` com maiúscula é QUEM ASSINA — os planos declaram essa convenção.
   * Caindo na regra de `[nome]`, a assinatura sairia com o nome do LEAD: "Abraço,
   * Carlos" assinado para o próprio Carlos.
   */
  // O que separa assinatura de frase é a POSIÇÃO, não a maiúscula: os dois planos
  // usam `[Nome]` capitalizado para coisas opostas.
  it('[Nome] SOZINHO na linha é assinatura — vira {{remetente}}', () => {
    const t = extrairToques(PLANO);
    expect(t[0].body).toContain('{{remetente}}');
    expect(t[0].body).toContain('Oi, {{nome}}.');
  });

  it('[empresa] vira variável no formato novo também', () => {
    const t = extrairToques(PLANO);
    expect(t[0].body).toContain('{{empresa}}');
  });

  // O formato antigo (`**Toque 1 (D0) — x:**`) não pode parar de funcionar.
  it('o formato antigo continua sendo lido', () => {
    const t = extrairToques('**Toque 1 (D0) — abertura:**\n> Oi, [nome]!');
    expect(t).toHaveLength(1);
    expect(t[0].channel).toBe('whatsapp');
  });
});

/**
 * Quem assina × a quem se escreve.
 *
 * Os dois planos usam `[Nome]` capitalizado para coisas OPOSTAS: no de julho é o
 * lead abrindo a frase, no de agosto é o remetente assinando. Uma regra por caixa
 * acerta um e erra o outro — e errar aqui produz "Abraço, Carlos" assinado para o
 * próprio Carlos. O que separa é a posição.
 */
describe('extrairToques — assinatura × abertura de frase', () => {
  it('sozinho na linha é assinatura', () => {
    const t = extrairToques('### E1 · D0 — x\n\n**Assunto:** `a`\n\n> Oi.\n>\n> Abraço,\n> [Nome]');
    expect(t[0].body).toMatch(/Abraço,\n\{\{remetente\}\}/);
  });

  it('abrindo a frase é o lead', () => {
    const t = extrairToques('**Toque 1 (D0) — x:**\n> [Nome], a maioria dos sistemas só emite CT-e.');
    expect(t[0].body).toContain('{{nome}}, a maioria');
    expect(t[0].body).not.toContain('{{remetente}}');
  });
});
