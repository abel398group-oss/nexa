// As mensagens do fluxo de cotação — puro, sem IO.
//
// Separado da máquina de estados porque texto muda por decisão de produto e regra muda
// por decisão de engenharia; juntos, mexer num obriga a reler o outro.
//
// Formatação do WhatsApp: *negrito* com asterisco, _itálico_ com sublinhado.

import type { CidadeDoTms } from './quote-city';
import { passoAtual, type EstadoCotacao } from './quote-flow';
import type { ImpostoDaCotacao } from './quote-tms.client';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

const cidade = (c: CidadeDoTms) => `${c.name}/${c.state}`;

/// A operação é brasileira. Mesmo motivo do fuso fixo em `closer-today.ts`: o container
/// roda em UTC, e formatar no fuso do servidor mostraria a data errada por algumas horas
/// todo dia.
const FUSO_DA_OPERACAO = 'America/Sao_Paulo';

/**
 * Eco da resposta anterior.
 *
 * É a última trava contra cidade errada: quem digitou "sp" querendo Sorocaba vê
 * "São Paulo/SP ✓" e corrige antes de o número virar preço dito ao cliente.
 */
function eco(estado: EstadoCotacao): string {
  if (estado.etapa === 'destino' && estado.origem) return `Origem: *${cidade(estado.origem)}* ✓\n\n`;
  if (estado.etapa === 'modalidade' && estado.destino) {
    return `Destino: *${cidade(estado.destino)}* ✓\n\n`;
  }
  return '';
}

export function abertura(): string {
  return [
    '*Cotação de frete* 🚛',
    '',
    'São 5 ou 6 perguntas rápidas, depende do tipo de frete.',
    'No fim eu te dou o valor e deixo o rascunho salvo no TMS.',
    '',
    'Digite *sair* pra cancelar a qualquer momento.',
    '',
    '1/5 — Cidade de *origem*?',
    '_exemplo: Campinas SP_',
  ].join('\n');
}

/**
 * A pergunta da etapa atual.
 *
 * A contagem vem de `passoAtual` e NÃO é fixa: dedicado tem veículo e tipo de carga (6),
 * fracionado tem peso (5). Escrever "n/5" na mão faria o dedicado exibir "6/5" no último
 * passo — número impossível é o tipo de detalhe que faz o usuário desconfiar do resto.
 *
 * O contador existe porque sem ele, na terceira pergunta, a pessoa acha que não acaba
 * nunca.
 */
export function pergunta(estado: EstadoCotacao): string {
  const p = passoAtual(estado);
  const n = p ? `${p.n}/${p.total} — ` : '';

  switch (estado.etapa) {
    case 'origem':
      return `${n}Cidade de *origem*?\n_exemplo: Campinas SP_`;

    case 'destino':
      return `${eco(estado)}${n}Cidade de *destino*?\n_exemplo: Belo Horizonte MG_`;

    case 'escolher_origem':
    case 'escolher_destino': {
      const opcoes = estado.opcoes ?? [];
      const linhas = opcoes.map((c, i) => `*${i + 1}* ${cidade(c)}`);
      return [`Achei ${opcoes.length}. Qual delas?`, '', ...linhas].join('\n');
    }

    case 'modalidade':
      return [
        eco(estado) + `${n}Tipo de frete?`,
        '*1* Dedicado — veículo só pra sua carga',
        '*2* Fracionado — divide com outras cargas',
      ].join('\n');

    case 'veiculo':
      return [`${n}Qual veículo?`, '*1* Truck', '*2* Carreta', '*3* Bitrem', '*4* Rodotrem'].join(
        '\n',
      );

    case 'carga': {
      // Os rótulos vêm da tabela do tenant, não de uma lista nossa: o motor do TMS casa
      // `cargoType` por igualdade estrita, então texto escrito aqui nunca casaria.
      const opcoes = estado.opcoesCarga ?? [];
      return [
        `${n}Tipo de carga?`,
        ...opcoes.map((c, i) => `*${i + 1}* ${c}`),
      ].join('\n');
    }

    case 'peso':
      return `${n}Peso total da carga, em kg?\n_exemplo: 500_`;

    case 'valor':
      return `${n}Valor da mercadoria, em reais?\n_exemplo: 80000_`;

    default:
      return '';
  }
}

/**
 * O tenant não tem tabela de frete para o veículo escolhido.
 *
 * Frase própria, e não "não entendi": o usuário respondeu certo, o cadastro é que não
 * existe. Mandar ele tentar de novo o faria repetir a mesma escolha até desistir.
 */
export function semTabelaDeFrete(estado: EstadoCotacao): string {
  const veiculo = estado.veiculo ? estado.veiculo[0].toUpperCase() + estado.veiculo.slice(1) : 'esse veículo';
  return [
    `Não há tabela de frete cadastrada para *${veiculo}* 😕`,
    '',
    'Fale com o administrador do TMS para cadastrar, ou',
    'digite *cotar* pra tentar com outro veículo.',
  ].join('\n');
}

/**
 * Resposta a entrada inválida.
 *
 * A segunda tentativa NÃO repete a primeira: quem errou uma vez errou porque a pergunta
 * não bastou, e repetir igual é o robô que não entende. Na terceira, entrega para humano
 * em vez de insistir.
 */
export function naoEntendi(estado: EstadoCotacao, desistiu: boolean): string {
  if (desistiu) {
    return [
      'Não consegui entender 😕',
      '',
      'Vou passar para alguém do time te ajudar.',
      'Se preferir recomeçar, digite *cotar*.',
    ].join('\n');
  }

  switch (estado.etapa) {
    case 'origem':
      return 'Não achei essa cidade. Escreve com o estado, tipo *Campinas SP*.';
    case 'destino':
      // Com a origem já gravada, dizer QUAL cidade falhou: no par ("Jacareí pra Xique"),
      // a origem resolveu em silêncio e o erro é só do destino — sem o eco, a pessoa
      // reescreveria as duas e a busca trataria o par inteiro como um nome de cidade.
      return estado.origem
        ? `Origem: *${cidade(estado.origem)}* ✓\n\nNão achei a cidade de *destino*. Escreve com o estado, tipo *Campinas SP*.`
        : 'Não achei essa cidade. Escreve com o estado, tipo *Campinas SP*.';
    case 'escolher_origem':
    case 'escolher_destino':
      return `Responde só com o número da opção, de *1* a *${(estado.opcoes ?? []).length}*.`;
    case 'carga':
      return `Responde com o número do tipo de carga, de *1* a *${(estado.opcoesCarga ?? []).length}*.`;
    case 'peso':
      return 'Preciso do peso em número, só os kg. _exemplo: 500_';
    case 'valor':
      return 'Preciso do valor em número. _exemplo: 80000_ (não vale "80 mil")';
    default:
      return 'Responde com o número da opção.';
  }
}

export function cancelado(): string {
  return 'Cotação cancelada. Quando quiser, é só mandar *cotar*. 👍';
}

/**
 * A resposta chegou depois de a sessão morrer por inatividade (TTL de 10 min).
 *
 * Dizer POR QUE nada aconteceu: sem esta mensagem, quem respondeu "400" no minuto 11
 * via silêncio e concluía que o robô quebrou — e a cotação seguinte começava com
 * desconfiança.
 */
export function expirada(): string {
  return [
    'Essa cotação expirou — 10 minutos sem resposta e eu encerro pra não ficar conversa pendurada. ⏱️',
    'Manda *cotar* que a gente recomeça do zero, é rapidinho.',
  ].join('\n');
}

export interface ResultadoDaCotacao {
  distanciaKm?: number | null;
  valor: number;
  pisoAntt?: number | null;
  rascunhoId?: string | null;
  /// ISO-8601 do TMS. Ver `validadeEmDiaMes` — instante e data pura são tratados diferente.
  validoAte?: string | null;
  /// Campos aditivos (2026-08-19) — só entram em `resultadoInterno`, nunca em
  /// `resultadoParaCliente`. `null` quando o TMS não devolveu análise crítica.
  netMargin?: number | null;
  netRevenue?: number | null;
  taxes?: { total: number; items: ImpostoDaCotacao[] } | null;
  /// Absoluto, só quando o TMS conhece a própria base de web-app. `null` = não mostramos
  /// link nenhum — ver o porquê em `ResultadoTms` de `quote-tms.client.ts`.
  draftUrl?: string | null;
}

/**
 * Validade em dia/mês. Depende de o valor ser um INSTANTE ou uma DATA — e são coisas
 * diferentes, que erram para lados opostos se tratadas igual.
 *
 * O TMS calcula `validUntil` como o momento da criação mais N dias, então ele carrega
 * hora: `2026-09-03T13:19:00.000Z`. Isso é instante, e instante se formata no fuso de
 * quem lê. Ler os dígitos UTC crus erraria na janela das 21h à meia-noite de Brasília,
 * quando o dia em UTC já virou: uma cotação das 22h mostraria 04/09 aqui e 03/09 na tela
 * do TMS, que usa o fuso do navegador.
 *
 * Já uma data SEM hora (`2026-09-03`) é data de calendário. Aí `new Date()` a interpreta
 * como meia-noite UTC, e converter para Brasília devolveria 02/09 — o erro inverso. Essa
 * se lê pelos dígitos.
 *
 * Um dia a menos numa validade é o cliente cobrando um preço que o sistema já considera
 * vencido, com a mensagem na mão dizendo que estava válido. É a mesma armadilha que o
 * `formatToBrazilianDate` do TMS resolve acrescentando meio-dia às datas sem hora.
 */
export function validadeEmDiaMes(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string') return null;

  const soData = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soData) return `${soData[3]}/${soData[2]}`;

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // `en-GB` para sair dd/mm; `pt-BR` traria o ano junto e o corte por índice quebraria
  // no dia que o formato mudasse.
  return d
    .toLocaleDateString('en-GB', { timeZone: FUSO_DA_OPERACAO, day: '2-digit', month: '2-digit' })
    .replace(/-/g, '/');
}

function resumoDaRota(estado: EstadoCotacao, r: ResultadoDaCotacao): { rota: string; detalhe: string } {
  const rota =
    estado.origem && estado.destino ? `${cidade(estado.origem)} → ${cidade(estado.destino)}` : '';
  const detalhe = [
    r.distanciaKm ? `${Math.round(r.distanciaKm)} km` : null,
    estado.modalidade === 'dedicado' ? 'Dedicado' : 'Fracionado',
    estado.veiculo ? estado.veiculo[0].toUpperCase() + estado.veiculo.slice(1) : null,
    estado.pesoKg ? `${estado.pesoKg} kg` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return { rota, detalhe };
}

/// Percentual legível a partir da fração do TMS: 0.12 → "12%", 0.045 → "4,5%".
function pct(fracao: number): string {
  const p = fracao * 100;
  const arred = Math.round(p * 10) / 10;
  return `${String(arred).replace('.', ',')}%`;
}

/**
 * O resultado — mensagem encaminhável, a que o vendedor repassa pro cliente.
 *
 * Formato de linhas rotuladas pedido pelo Uelder em 20/08/2026, direto do uso real:
 * termina na VALIDADE — "valor de referência, confirme antes de fechar" e "rascunho
 * salvo" são instruções pro VENDEDOR, e numa mensagem que vai pro cliente viravam ruído
 * (essas informações vivem na mensagem interna, que chega antes).
 *
 * O ICMS sai destacado, mas como "incluso": o imposto é por dentro no TMS (R$ 34,89
 * DENTRO dos R$ 290,73 no rascunho 017750). Somar "frete + ICMS = total" com três
 * números diferentes inventaria uma decomposição que não bate com a proposta formal —
 * o cliente compararia e veria divergência.
 *
 * Piso ANTT e margem continuam FORA — ver `resultadoInterno`.
 */
export function resultadoParaCliente(estado: EstadoCotacao, r: ResultadoDaCotacao): string {
  const icms = r.taxes?.items.find((i) => i.acronym.toUpperCase() === 'ICMS') ?? null;
  const veiculo = estado.veiculo ? estado.veiculo[0].toUpperCase() + estado.veiculo.slice(1) : null;

  return [
    // O número no TÍTULO, e não no rodapé: é por ele que a pessoa vai procurar a cotação
    // no sistema, e no fim da mensagem ele compete com o preço pela atenção.
    r.rascunhoId ? `*Cotação ${r.rascunhoId}* ✅` : '*Cotação pronta* ✅',
    '',
    ...(estado.origem ? [`Origem: ${cidade(estado.origem)}`] : []),
    ...(estado.destino ? [`Destino: ${cidade(estado.destino)}`] : []),
    ...(r.distanciaKm ? [`Distância: ${Math.round(r.distanciaKm)} km`] : []),
    `Modalidade: ${estado.modalidade === 'dedicado' ? 'Dedicado' : 'Fracionado'}`,
    ...(veiculo ? [`Veículo: ${veiculo}`] : []),
    ...(estado.pesoKg ? [`Peso: ${estado.pesoKg} kg`] : []),
    // Eco do valor da mercadoria: é o único número que a pessoa digitou livre, e trocar
    // 10.000 por 100.000 muda o seguro sem ninguém perceber.
    ...(estado.valorMercadoria ? [`Mercadoria: ${brl(estado.valorMercadoria)}`] : []),
    '',
    `💰 *Frete total: ${brl(r.valor)}*`,
    ...(icms ? [`ICMS incluso: ${brl(icms.value)}${icms.rate > 0 ? ` (${pct(icms.rate)})` : ''}`] : []),
    '',
    ...(validadeEmDiaMes(r.validoAte) ? [`Válida até *${validadeEmDiaMes(r.validoAte)}*`] : []),
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/**
 * O resultado — mensagem interna, só quem cotou vê. Chega ANTES da mensagem-cliente.
 *
 * Existe pra separar o que é do vendedor do que é seguro encaminhar: piso ANTT, análise
 * crítica (margem, receita líquida, impostos) e o link do rascunho vivem SÓ aqui, nunca em
 * `resultadoParaCliente` — que é a mensagem que sai do controle de quem cotou assim que
 * chega no zap dele.
 *
 * O título é DIFERENTE do da mensagem-cliente de propósito (🔒 + "uso interno" em vez de
 * ✅): as duas bolhas chegam coladas e encaminhar no WhatsApp é apertar e segurar — se
 * fossem parecidas, mandar a errada pro cliente seria questão de tempo, e a errada carrega
 * a margem.
 */
export function resultadoInterno(estado: EstadoCotacao, r: ResultadoDaCotacao): string {
  const { rota, detalhe } = resumoDaRota(estado, r);

  // Presente só quando o TMS devolveu análise crítica — nem sempre devolve (motor sem
  // essa etapa, ou tenant sem tabela fiscal configurada). Ausência TOTAL, não zero: ver
  // o comentário em `ResultadoDaCotacao`.
  const temAnalise = r.netMargin != null || r.netRevenue != null || r.taxes != null;
  // Margem em negrito E com o percentual sobre o preço: é O número da decisão — o
  // vendedor bate o olho e sabe se aquela cotação fecha conta, sem calcular de cabeça.
  const margem =
    r.netMargin != null
      ? `Margem: *${brl(r.netMargin)}*${r.valor > 0 ? ` (${Math.round((r.netMargin / r.valor) * 100)}%)` : ''}`
      : null;
  const analiseCritica = temAnalise
    ? [
        '',
        '📊 *Análise crítica*',
        ...(r.netRevenue != null ? [`Receita líquida: ${brl(r.netRevenue)}`] : []),
        ...(r.taxes ? [`Impostos: ${brl(r.taxes.total)}`] : []),
        ...(margem ? [margem] : []),
      ]
    : [];

  return [
    r.rascunhoId ? `🔒 *Cotação ${r.rascunhoId}* — uso interno` : '🔒 *Cotação pronta* — uso interno',
    '',
    rota,
    detalhe,
    ...(estado.valorMercadoria ? [`Mercadoria: ${brl(estado.valorMercadoria)}`] : []),
    '',
    `💰 *${brl(r.valor)}*`,
    // > 0, não só != null: fracionado normalmente não tem piso ANTT aplicável e o TMS
    // manda 0 nesse caso — mostrar "R$ 0,00" leria como um piso real, quando é "não se
    // aplica". Mesmo raciocínio do `price` em quote-tms.client.ts.
    ...(r.pisoAntt != null && r.pisoAntt > 0 ? [`Piso ANTT: ${brl(r.pisoAntt)}`] : []),
    ...analiseCritica,
    '',
    ...(validadeEmDiaMes(r.validoAte) ? [`Válida até *${validadeEmDiaMes(r.validoAte)}*.`] : []),
    // A cautela morava na mensagem-cliente; saiu de lá a pedido do Uelder (20/08/2026) —
    // instrução pro vendedor não é coisa que o cliente deva ler. O aviso continua
    // existindo, aqui, onde só o vendedor vê.
    'Valor de referência — confirme antes de fechar com o cliente.',
    ...(r.rascunhoId
      ? [`📋 Rascunho salvo. Complete em *Vendas › Cotações › ${r.rascunhoId}*`]
      : []),
    // Só quando o TMS manda um absoluto pronto — nunca montado aqui. Ver o porquê em
    // `ResultadoTms.draftUrl` (quote-tms.client.ts): domínio errado já quebrou link antes.
    ...(r.draftUrl ? [`🔗 ${r.draftUrl}`] : []),
    '',
    '👇 Mensagem pronta pra encaminhar ao cliente, logo abaixo.',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/**
 * Recusa vinda do TMS.
 *
 * Duas frases diferentes porque são dois problemas diferentes, e mandar a mesma para os
 * dois faz quem estourou a cota ir pedir permissão que já tem.
 */
export function recusado(motivo: 'sem_permissao' | 'cota_estourada'): string {
  return motivo === 'sem_permissao'
    ? 'Seu acesso à cotação não está liberado. Fale com o administrador do TMS. 🔒'
    : 'Você atingiu o limite de cotações do período. Fale com o administrador do TMS. 📊';
}
