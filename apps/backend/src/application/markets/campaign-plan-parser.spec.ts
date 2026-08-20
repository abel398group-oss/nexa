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

  // `[link calculadora]` e `[empresa]` não têm variável no envio: virar `{{empresa}}`
  // mandaria a chave crua para o lead. Em colchete, salta aos olhos na revisão.
  it('colchete sem variável correspondente fica como está', () => {
    const t = extrairToques('**Toque 1 (D0) — x:**\n> Teste em [link calculadora] na [empresa].');

    expect(t[0].body).toContain('[link calculadora]');
    expect(t[0].body).toContain('[empresa]');
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
