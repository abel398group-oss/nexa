import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Breadcrumb, Card, Label, PageContainer, PageHeader } from '@/shared/ui';
import { listMarkets, type Market } from '@/entities/market';
import {
  getRelatorio,
  type RelatorioComercial,
  type TaxaCalculada,
  type SlaCalculado,
} from '@/entities/telemarketing-report';

/**
 * Relatório comercial — as três perguntas que a esteira foi instrumentada para responder.
 *
 * A decisão que define esta tela: **taxa com amostra pequena não é exibida**. O backend
 * devolve `percentual: null` abaixo de 20, e aqui isso vira "—" com a contagem ao lado,
 * nunca 0%. Um ganho em seis leads renderizado como "17% de conversão" faz alguém comprar
 * mais lista por causa de ruído — e o relatório existe justamente para evitar decisão por
 * impressão.
 */
export function TelemarketingReportPage() {
  const [productCode, setProductCode] = useState('');

  const { data: mercados = [] } = useQuery<Market[]>({
    queryKey: ['markets', 'todos'],
    queryFn: () => listMarkets(false),
  });

  const { data, isLoading } = useQuery<RelatorioComercial>({
    queryKey: ['telemarketing', 'report', productCode],
    queryFn: () => getRelatorio(productCode || undefined),
  });

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: 'Vendas' }, { label: 'Relatório comercial' }]} />
      <PageHeader
        title="Relatório comercial"
        subtitle="Qual lista prestou, quem está produzindo, e qual roteiro converte."
      />

      <Card className="p-5">
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="mercado-rel">Mercado</Label>
          <select
            id="mercado-rel"
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
            className="h-9 w-full rounded-md border border-base-300 bg-white px-3 text-sm text-base-content shadow-sm outline-none focus:border-brand-500"
          >
            <option value="">Todos os mercados</option>
            {mercados.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-base-content/50">
            Comparar lista de mercados diferentes não responde nada — as taxas não estão na
            mesma escala.
          </p>
        </div>
      </Card>

      {isLoading && (
        <Card className="p-6 text-sm text-base-content/60">Somando…</Card>
      )}

      {data && <Sla sla={data.slaPrimeiroContato} />}
      {data && <Lotes lotes={data.lotes} />}
      {data && <Vendedores vendedores={data.vendedores} />}
      {data && <Campanhas campanhas={data.campanhas} />}
      {data && <Roteiros roteiros={data.roteiros} />}

      <p className="text-xs text-base-content/50">
        Taxa só aparece a partir de <b>20</b> na base. Abaixo disso o número existe, mas
        não significa nada — e um relatório que finge significado é pior que um vazio.
      </p>
    </PageContainer>
  );
}

/// "—" e não "0%": o backend se recusou a afirmar, a tela não afirma no lugar dele.
function Taxa({ t }: { t: TaxaCalculada }) {
  if (t.percentual === null) {
    return (
      <span className="text-base-content/40" title={`Base de ${t.base} — pequena demais`}>
        — <span className="text-xs">({t.base})</span>
      </span>
    );
  }
  return <span className="font-medium tabular-nums">{t.percentual.toFixed(1)}%</span>;
}

/// Quanto tempo até o primeiro toque humano — a métrica que faltava conectar
/// (22/08/2026): o backend já calculava, a tela nunca lia.
function Sla({ sla }: { sla: SlaCalculado }) {
  return (
    <Card className="p-5">
      <p className="mb-1 text-sm font-semibold">SLA de primeiro contato</p>
      <p className="mb-3 text-xs text-base-content/60">
        Horas entre o lead ENTRAR na base e a primeira atividade que um SDR registra nele.
        Só entram leads já tocados ao menos uma vez — não é "quantos ainda faltam".
      </p>
      {sla.mediaHoras === null ? (
        <p className="text-sm text-base-content/40" title={`Base de ${sla.base} — pequena demais`}>
          — <span className="text-xs">({sla.base} contatados até agora)</span>
        </p>
      ) : (
        <p className="text-2xl font-semibold tabular-nums">
          {sla.mediaHoras < 1
            ? `${Math.round(sla.mediaHoras * 60)} min`
            : `${sla.mediaHoras.toFixed(1)} h`}
          <span className="ml-2 text-xs font-normal text-base-content/50">
            média sobre {sla.base} leads
          </span>
        </p>
      )}
    </Card>
  );
}

function Lotes({ lotes }: { lotes: RelatorioComercial['lotes'] }) {
  if (!lotes.length) {
    return (
      <Card className="p-6 text-sm text-base-content/60">
        Nenhuma lista importada ainda. O relatório por lote começa a existir na primeira
        importação — não há como reconstruir origem depois.
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <p className="mb-1 text-sm font-semibold">Qual lista prestou</p>
      <p className="mb-3 text-xs text-base-content/60">
        Conversão sobre os <b>válidos</b>, não sobre o que chegou — senão lista suja se
        elogia sozinha.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-base-300 text-left text-xs text-base-content/60">
              <th className="py-2">Lista</th>
              <th className="py-2 text-right">Chegaram</th>
              <th className="py-2 text-right">Válidos</th>
              <th className="py-2 text-right">Andando</th>
              <th className="py-2 text-right">Ganhos</th>
              <th className="py-2 text-right">Perdidos</th>
              <th className="py-2 text-right">Conversão</th>
            </tr>
          </thead>
          <tbody>
            {lotes.map((l) => (
              <tr key={l.nome + l.productCode} className="border-b border-base-200 last:border-0">
                <td className="py-2">
                  {l.nome}
                  <span className="ml-2 text-xs text-base-content/40">{l.productCode}</span>
                </td>
                <td className="py-2 text-right tabular-nums text-base-content/60">{l.recebidos}</td>
                <td className="py-2 text-right tabular-nums">{l.validos}</td>
                <td className="py-2 text-right tabular-nums">{l.emAndamento}</td>
                <td className="py-2 text-right tabular-nums text-emerald-600">{l.ganhos}</td>
                <td className="py-2 text-right tabular-nums text-base-content/60">{l.perdidos}</td>
                <td className="py-2 text-right">
                  <Taxa t={l.conversao} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Vendedores({ vendedores }: { vendedores: RelatorioComercial['vendedores'] }) {
  if (!vendedores.length) return null;

  return (
    <Card className="p-5">
      <p className="mb-1 text-sm font-semibold">Quem está produzindo</p>
      <p className="mb-3 text-xs text-base-content/60">
        Aproveitamento é <b>atendeu ÷ tentativas</b> — mede o trabalho dele, não a qualidade
        da lista que recebeu. Quem pegou lista ruim tem conversão baixa e aproveitamento
        normal.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-base-300 text-left text-xs text-base-content/60">
              <th className="py-2">Vendedor</th>
              <th className="py-2 text-right">Tentativas</th>
              <th className="py-2 text-right">Atendeu</th>
              <th className="py-2 text-right">Passou pro closer</th>
              <th className="py-2 text-right">Ganhos</th>
              <th className="py-2 text-right">Aproveitamento</th>
            </tr>
          </thead>
          <tbody>
            {vendedores.map((v) => (
              <tr key={v.nome} className="border-b border-base-200 last:border-0">
                <td className="py-2">{v.nome}</td>
                <td className="py-2 text-right tabular-nums">{v.atividades}</td>
                <td className="py-2 text-right tabular-nums">{v.atendeu}</td>
                <td className="py-2 text-right tabular-nums">{v.passouCloser}</td>
                <td className="py-2 text-right tabular-nums text-emerald-600">{v.ganhos}</td>
                <td className="py-2 text-right">
                  <Taxa t={v.aproveitamento} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Campanhas({ campanhas }: { campanhas: RelatorioComercial['campanhas'] }) {
  if (!campanhas.length) return null;

  return (
    <Card className="p-5">
      <p className="mb-1 text-sm font-semibold">Qual campanha rendeu</p>
      <p className="mb-3 text-xs text-base-content/60">
        Conversão e resposta sobre os <b>entregues</b> — alvo pulado por opt-out ou que
        falhou no envio nunca teve chance de responder.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-base-300 text-left text-xs text-base-content/60">
              <th className="py-2">Campanha</th>
              <th className="py-2">Canal</th>
              <th className="py-2 text-right">Entregues</th>
              <th className="py-2 text-right">Resposta</th>
              <th className="py-2 text-right">Ganhos</th>
              <th className="py-2 text-right">Conversão</th>
            </tr>
          </thead>
          <tbody>
            {campanhas.map((c) => (
              <tr key={c.nome} className="border-b border-base-200 last:border-0">
                <td className="py-2">{c.nome}</td>
                <td className="py-2 text-xs text-base-content/50">
                  {c.canal === 'email' ? 'E-mail' : 'WhatsApp'}
                </td>
                <td className="py-2 text-right tabular-nums text-base-content/60">
                  {c.enviados}
                </td>
                <td className="py-2 text-right">
                  <Taxa t={c.resposta} />
                </td>
                <td className="py-2 text-right tabular-nums text-emerald-600">{c.ganhos}</td>
                <td className="py-2 text-right">
                  <Taxa t={c.conversao} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Roteiros({ roteiros }: { roteiros: RelatorioComercial['roteiros'] }) {
  const { comparaveis, omitidasPorAmostra } = roteiros;

  return (
    <Card className="p-5">
      <p className="mb-1 text-sm font-semibold">Qual roteiro converte</p>
      <p className="mb-3 text-xs text-base-content/60">
        Só existe porque cada ação do SDR grava a versão do roteiro que estava na tela. É a
        pergunta que justificou o versionamento.
      </p>

      {comparaveis.length === 0 ? (
        <p className="text-sm text-base-content/60">
          Nenhuma versão com dado suficiente ainda.
          {omitidasPorAmostra > 0 && (
            <>
              {' '}
              <b>{omitidasPorAmostra}</b>{' '}
              {omitidasPorAmostra === 1 ? 'versão já tem' : 'versões já têm'} registro, mas
              abaixo de 20 ações — comparar agora escolheria o roteiro errado.
            </>
          )}
        </p>
      ) : (
        <>
          <ul className="flex flex-col">
            {comparaveis.map((r, i) => (
              <li
                key={r.versao}
                className="flex items-center justify-between border-b border-base-200 py-2 text-sm last:border-0"
              >
                <span>
                  Versão {r.versao}
                  {i === 0 && (
                    <span className="ml-2 text-xs text-emerald-600">melhor até agora</span>
                  )}
                </span>
                <span className="flex items-baseline gap-3">
                  <span className="text-xs text-base-content/50">
                    {r.atendeu} de {r.acoes}
                  </span>
                  <span className="font-medium tabular-nums">{r.percentual.toFixed(1)}%</span>
                </span>
              </li>
            ))}
          </ul>
          {omitidasPorAmostra > 0 && (
            <p className="mt-2 text-xs text-base-content/50">
              {omitidasPorAmostra}{' '}
              {omitidasPorAmostra === 1 ? 'versão ficou' : 'versões ficaram'} de fora por
              amostra pequena.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
