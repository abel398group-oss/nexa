import { useEffect } from 'react';

/**
 * Avisa antes de sair da página quando há coisa digitada e não salva.
 *
 * Achado em 13/08/2026: F5, Ctrl+W ou fechar a aba apagavam um formulário
 * preenchido sem uma palavra. Em cadastro curto é chato; num artigo da base de
 * conhecimento ou no corpo de uma campanha, que são textos longos, é trabalho
 * perdido de verdade.
 *
 * O aviso é o do NAVEGADOR, não um modal nosso, e isso é de propósito: só ele
 * consegue interceptar F5 e o fechar da aba. A contrapartida é que o texto é
 * fixo e escolhido pelo navegador — desde 2016 nenhum browser deixa
 * personalizar a frase (era usado para golpe). Por isso não adianta passar
 * mensagem aqui.
 *
 * Ligar isto quando NÃO há nada a perder é o erro clássico: vira aquele site
 * que pergunta "tem certeza?" toda vez que você sai. Daí o parâmetro ser o
 * estado de "sujo" do formulário, e o listener só existir enquanto ele for
 * true — depois de salvar, o formulário volta a limpo e o aviso some sozinho.
 *
 * Navegação DENTRO do app (react-router) não passa por aqui: ali não há recarga
 * de página, e o dado continua em memória.
 */
export function useUnsavedGuard(temAlteracaoNaoSalva: boolean): void {
  useEffect(() => {
    if (!temAlteracaoNaoSalva) return;

    const aoSair = (e: BeforeUnloadEvent) => {
      // `preventDefault` é o que vale no padrão atual; `returnValue` fica pelos
      // navegadores antigos, que ignoram o primeiro.
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [temAlteracaoNaoSalva]);
}
