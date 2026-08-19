// As mensagens do fluxo de cotação — puro, sem IO.
//
// Separado da máquina de estados porque texto muda por decisão de produto e regra muda
// por decisão de engenharia; juntos, mexer num obriga a reler o outro.
//
// Formatação do WhatsApp: *negrito* com asterisco, _itálico_ com sublinhado.

import type { CidadeDoTms } from './quote-city';
import { passoAtual, type EstadoCotacao } from './quote-flow';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

const cidade = (c: CidadeDoTms) => `${c.name}/${c.state}`;

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
    case 'destino':
      return 'Não achei essa cidade. Escreve com o estado, tipo *Campinas SP*.';
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

export interface ResultadoDaCotacao {
  distanciaKm?: number | null;
  valor: number;
  pisoAntt?: number | null;
  rascunhoId?: string | null;
  /// ISO-8601 do TMS. Ver `validadeEmDiaMes` — NÃO converter para fuso nenhum.
  validoAte?: string | null;
}

/**
 * Validade em dia/mês, lida DIRETO dos dígitos do ISO.
 *
 * Não converte fuso, e isso é o ponto: o TMS manda `2026-09-03T00:00:00.000Z`, e
 * `toLocaleDateString` em America/Sao_Paulo devolve **02/09** — meia-noite UTC é 21h do
 * dia anterior em Brasília. A proposta impressa diz 03/09, e a mensagem diria 02/09.
 *
 * Um dia a menos numa validade é o cliente cobrando um preço que o sistema já considera
 * vencido. Validade é data de CALENDÁRIO, não instante no tempo — e data de calendário
 * não se converte.
 */
export function validadeEmDiaMes(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : null;
}

/**
 * O resultado.
 *
 * "Valor de referência" fica na mensagem de propósito: o número dito no WhatsApp já é um
 * preço na cabeça de quem lê, e a formalização ainda vai acontecer no TMS.
 */
export function resultado(estado: EstadoCotacao, r: ResultadoDaCotacao): string {
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

  return [
    // O número no TÍTULO, e não no rodapé: é por ele que a pessoa vai procurar a cotação
    // no sistema, e no fim da mensagem ele compete com o preço pela atenção.
    r.rascunhoId ? `*Cotação ${r.rascunhoId}* ✅` : '*Cotação pronta* ✅',
    '',
    rota,
    detalhe,
    // Eco do valor da mercadoria: é o único número que a pessoa digitou livre, e trocar
    // 10.000 por 100.000 muda o seguro sem ninguém perceber.
    ...(estado.valorMercadoria ? [`Mercadoria: ${brl(estado.valorMercadoria)}`] : []),
    '',
    `💰 *${brl(r.valor)}*`,
    // O piso ANTT fica FORA da mensagem de propósito, e continua gravado no rascunho.
    // Esta mensagem é encaminhável com um toque: se ela chegar ao cliente com o piso,
    // ele passa a saber a margem. O vendedor consulta no sistema quando precisar.
    '',
    ...(validadeEmDiaMes(r.validoAte) ? [`Válida até *${validadeEmDiaMes(r.validoAte)}*.`] : []),
    'Valor de referência — confirme antes de fechar com o cliente.',
    ...(r.rascunhoId
      ? [`📋 Rascunho salvo. Complete em *Vendas › Cotações › ${r.rascunhoId}*`]
      : []),
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
