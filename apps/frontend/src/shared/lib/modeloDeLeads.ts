/**
 * modeloDeLeads.ts — o CSV de exemplo que a tela de Listas oferece para baixar.
 *
 * ## Por que o arquivo é gerado aqui, e não servido do disco
 *
 * Um arquivo estático em `public/` precisaria existir no build, sobreviver ao Docker
 * e ao proxy — e `/uploads` já mostrou em 20/08/2026 o que acontece quando o proxy
 * não roteia um caminho: a rota devolve `index.html` com 200, e o operador baixa a
 * aplicação inteira achando que é a planilha. Gerado no navegador, o modelo não tem
 * como divergir do que a tela promete.
 *
 * ## Por que as linhas são imperfeitas de propósito
 *
 * Uma sem nome, uma sem empresa, uma sem telefone, uma sem e-mail. É o ponto do
 * modelo: mostrar que a lista entra INCOMPLETA — basta um canal, telefone ou e-mail.
 * Cinco linhas perfeitas ensinariam o contrário, e quem tem a planilha furada
 * deixaria de subir esperando completá-la.
 *
 * O nome vazio na terceira linha também é intencional: melhor vazio do que com a
 * razão social. Sem nome a mensagem vira "Bom dia!"; com "OURO CARGO LTDA" ela vira
 * "Bom dia, OURO!" — ver `pareceRazaoSocial` no backend.
 */

const CABECALHO = 'nome;empresa;telefone;email;frota';

const LINHAS = [
  'Carlos Mendes;Transportes Silva;11988887777;carlos@transportessilva.com.br;12',
  'Fernanda Dias;Carga Pesada MG;5531999998888;fernanda@cargapesada.com.br;',
  ';Ouro Cargo Transportes;11930256122;comercial@ourocargo.com.br;40',
  'Roberto Alves;;5541988776655;;',
  ';Translog Paraná;;contato@translogpr.com.br;',
];

/** O conteúdo do modelo. Exportado para o teste afirmar o formato sem baixar nada. */
export const CSV_MODELO = [CABECALHO, ...LINHAS].join('\r\n') + '\r\n';

/**
 * Dispara o download do modelo.
 *
 * `﻿` (BOM) na frente: é o que faz o Excel brasileiro abrir o arquivo com
 * acento certo. Sem ele, "Translog Paraná" chega como "ParanÃ¡" e quem abrir vai
 * achar que o sistema corrompe a lista.
 */
export function baixarModeloDeLeads(): void {
  const blob = new Blob(['﻿' + CSV_MODELO], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo_leads_nexa.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Sem revoke, o blob fica na memória da aba até ela fechar.
  URL.revokeObjectURL(url);
}
