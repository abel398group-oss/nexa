/**
 * json-extract.ts — tira o JSON de dentro da resposta do modelo.
 *
 * ## O defeito que isto substitui
 *
 * A extração era `raw.matchAll(/\{[\s\S]*?\}/g)`: pegar todo trecho entre chaves,
 * do menor para o maior, e tentar `JSON.parse` em cada um. Non-greedy, então ela
 * corta no PRIMEIRO `}` — e quebra em duas situações que este sistema produz o
 * tempo todo:
 *
 *   • **JSON aninhado.** `{"modelos":[{"name":"x"},{"name":"y"}]}` casa apenas
 *     `{"modelos":[{"name":"x"}`, que não é JSON válido.
 *   • **`{{nome}}` dentro do texto.** O prompt MANDA a IA escrever `{{saudacao}}`
 *     e `{{nome}}` no corpo da mensagem, e cada um vira um falso candidato.
 *
 * Sobrava o fallback `JSON.parse(raw)`, que só funciona quando a resposta é JSON
 * puro. Em 20/08/2026 o "Gerar do roteiro" devolveu 400 em toda tentativa por
 * causa disso: a resposta vinha correta, mas embrulhada em cerca de markdown
 * (```json … ```), e nenhum dos dois caminhos a alcançava. O modelo tinha
 * obedecido; quem não sabia ler era o nosso lado.
 *
 * ## Como esta faz
 *
 * Descasca a cerca de markdown e varre o texto contando chaves — pulando o que
 * está DENTRO de string JSON, que é o que torna `{{nome}}` inofensivo. Devolve o
 * primeiro valor completo e parseável.
 *
 * Função PURA e sem dependência: a decisão que precisa de teste é esta, e ela não
 * deveria exigir uma chamada de API para ser verificada.
 */

/** Tira ```json … ``` (ou ``` … ```) que o modelo põe em volta da resposta. */
export function descascarCerca(raw: string): string {
  const cerca = raw.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/);
  return (cerca ? cerca[1] : raw).trim();
}

/**
 * Acha o primeiro objeto ou array COMPLETO no texto.
 *
 * Conta a profundidade de `{}`/`[]` ignorando o que está dentro de aspas, e
 * respeitando a barra invertida — sem isso um `\"` no meio do texto encerraria a
 * string cedo e a contagem sairia errada a partir dali.
 */
export function primeiroValorBalanceado(texto: string): string | null {
  const inicio = texto.search(/[[{]/);
  if (inicio === -1) return null;

  const abre = texto[inicio];
  const fecha = abre === '{' ? '}' : ']';
  let profundidade = 0;
  let dentroDeString = false;
  let escapado = false;

  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];

    if (escapado) { escapado = false; continue; }
    if (c === '\\') { escapado = true; continue; }
    if (c === '"') { dentroDeString = !dentroDeString; continue; }
    if (dentroDeString) continue;

    if (c === abre) profundidade++;
    else if (c === fecha) {
      profundidade--;
      if (profundidade === 0) return texto.slice(inicio, i + 1);
    }
  }

  // Chegou ao fim sem fechar: resposta truncada (estouro de max_tokens). Devolver
  // um pedaço aqui só empurraria o erro para o `JSON.parse` de quem chamou.
  return null;
}

/**
 * O JSON da resposta, ou `null` se não houver nenhum aproveitável.
 *
 * `null` em vez de exceção porque quem chama decide o que fazer com a falha — o
 * agente tem fallback, a tela de modelos vira 400 com texto explicativo.
 */
export function extrairJson<T = any>(raw: string): T | null {
  if (!raw?.trim()) return null;

  const limpo = descascarCerca(raw);

  // O caminho comum primeiro: a resposta é o JSON inteiro e nada mais.
  try {
    return JSON.parse(limpo) as T;
  } catch {
    // segue para a varredura
  }

  const trecho = primeiroValorBalanceado(limpo);
  if (!trecho) return null;

  try {
    return JSON.parse(trecho) as T;
  } catch {
    return null;
  }
}
