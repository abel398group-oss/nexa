/**
 * Textos FIXOS do suporte — literais escritos por nós, sem nada gerado pela IA.
 *
 * Existem por um motivo de latência: cada mensagem de suporte custava uma chamada
 * à Supervisora mesmo quando a resposta era um literal daqui ("oi" → saudação,
 * "sim" → chamado encerrado, transbordo → aviso de escalação). Auditar um literal
 * não protege de nada — não há alucinação possível num texto que nós escrevemos.
 *
 * A mesma trava do catálogo de vendas vale aqui (ver SCRIPTS em
 * conversation-agent.service.ts): a flag `scripted` sozinha é uma promessa; ela é
 * CONFERIDA contra este catálogo no envio (`isSupportScript`). Se alguém marcar
 * como roteirizado um draft montado dinamicamente, a conferência falha, o texto
 * volta a ser auditado pela Supervisora e o caso é logado — a falha é para o lado
 * seguro.
 *
 * Regra ao editar: qualquer mudança de texto aqui precisa ser feita AQUI, nunca
 * duplicando a string no service. String duplicada que sai de sincronia vira uma
 * chamada de IA extra e silenciosa em produção.
 */
export const SUPPORT_SCRIPTS = {
  // Saudação de primeiro contato (small talk).
  saudacao: 'Olá! 👋 Estou aqui para ajudar com dúvidas sobre o HiperTMS. O que você precisa?',
  // Small talk quando a Lia JÁ falou nesta conversa — cumprimentar de novo soa
  // robótico, e o corte de saudação do ConversationAgent não roda em texto
  // roteirizado (isso quebraria a conferência do catálogo).
  saudacaoRepetida: 'Claro! Me conta o que você precisa sobre o HiperTMS. 😊',

  // ── Confirmação de resolução / CSAT (N2 + C1) ──────────────────────────────
  confirmaResolucao:
    'Fico feliz em ter ajudado! Isso resolveu seu problema?\n' +
    'Responda "sim" para encerrar ou "não" se precisar de mais ajuda.',
  chamadoEncerrado:
    'Ótimo! Chamado encerrado com sucesso. 😊\n' +
    'Se quiser, avalie o atendimento de 1 a 5 respondendo com o número (1 = ruim, 5 = excelente). ' +
    'Sua opinião nos ajuda a melhorar!',
  naoResolvido:
    'Entendido, me desculpe pelo transtorno. Estou encaminhando para um especialista que vai te ajudar com mais detalhes. ' +
    'Em breve alguém entrará em contato!',
  aguardandoRetorno:
    'Fique à vontade para me avisar se precisar de algo mais. Caso não haja resposta, o chamado será encerrado automaticamente em breve.',
  csatAgradecimentoBom: 'Obrigado pela avaliação! Fico feliz que tenha ficado satisfeito. 😊',
  csatAgradecimentoRuim:
    'Obrigado pelo feedback! Vamos trabalhar para melhorar. Se precisar de mais ajuda, pode nos contatar novamente.',

  // ── Matriz de escalonamento (usados pelo EscalationAgent) ──────────────────
  escalaFiscalFinanceiro:
    'Sua solicitação envolve um tema fiscal ou financeiro que precisa de verificação especializada. ' +
    'Vou te conectar com nossa equipe agora.',
  escalaCritica: 'Identifiquei que sua operação está parada. Estou escalando para atendimento urgente agora.',
  escalaAltaPrioridade:
    'Não consegui resolver sua questão de alta prioridade automaticamente. ' +
    'Estou acionando um especialista para te ajudar.',
  escalaAnaliseEspecializada:
    'Esta solicitação precisa de análise especializada. Estou te conectando com nossa equipe.',
} as const;

const CATALOGO: readonly string[] = Object.values(SUPPORT_SCRIPTS);

/** O texto é EXATAMENTE um dos literais do catálogo de suporte? */
export function isSupportScript(draft: string): boolean {
  return CATALOGO.includes(draft);
}
