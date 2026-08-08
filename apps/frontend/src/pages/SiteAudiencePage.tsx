import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, PageContainer, PageHeader, Breadcrumb, Icon } from '@/shared/ui';
import { getSiteOverview, type ItemContado, type PontoDiario } from '@/entities/site-analytics';

/** Períodos prontos — cobrem as três perguntas reais: hoje, a semana, o mês. */
const PERIODOS = [
  { chave: '1', rotulo: 'Hoje', dias: 1 },
  { chave: '7', rotulo: '7 dias', dias: 7 },
  { chave: '30', rotulo: '30 dias', dias: 30 },
  { chave: '90', rotulo: '90 dias', dias: 90 },
] as const;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** DD/MM — o ano no eixo do gráfico só rouba espaço. */
function diaCurto(dia: string): string {
  const [, m, d] = dia.split('-');
  return `${d}/${m}`;
}

/**
 * Série diária em barras.
 *
 * SVG na mão em vez de biblioteca de gráfico: são duas dimensões e no máximo 90
 * barras. Uma dependência de charting aqui custaria mais em bundle do que entrega.
 *
 * Dia sem visita aparece como trilho vazio, não como ausência — o vazio é
 * informação, e uma série que só desenha os dias com tráfego dá a impressão de
 * movimento contínuo que não existiu.
 */
function SerieBarras({ serie }: { serie: PontoDiario[] }) {
  const max = Math.max(1, ...serie.map((p) => p.visitas));
  // Acima de ~31 barras o rótulo de cada dia não caberia; mostra um a cada N.
  const passoRotulo = Math.ceil(serie.length / 15);

  return (
    <div className="flex items-end gap-[3px]" style={{ height: 160 }}>
      {serie.map((p, i) => {
        const altura = p.visitas === 0 ? 2 : Math.max(4, Math.round((p.visitas / max) * 140));
        return (
          <div key={p.dia} className="group relative flex flex-1 flex-col items-center justify-end">
            <div
              className={p.visitas === 0 ? 'w-full rounded-sm bg-base-200' : 'w-full rounded-sm bg-brand-500'}
              style={{ height: altura }}
            />
            {/* Tooltip em CSS puro — o número exato só importa quando se aponta. */}
            <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-base-content px-2 py-1 text-[11px] text-base-100 group-hover:block">
              {diaCurto(p.dia)}: {p.visitas} visita{p.visitas === 1 ? '' : 's'} · {p.unicos} único{p.unicos === 1 ? '' : 's'}
            </div>
            <div className="mt-1 h-3 text-[10px] text-base-content/40">
              {i % passoRotulo === 0 ? diaCurto(p.dia) : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Lista "top N" com barra proporcional.
 *
 * A barra é relativa ao PRIMEIRO item, não ao total: o que se quer ler aqui é
 * "quanto o segundo colocado fica atrás do primeiro", e normalizar pelo total
 * achataria tudo quando houver muitos itens pequenos.
 */
function TopLista({ titulo, itens, vazio }: { titulo: string; itens: ItemContado[]; vazio: string }) {
  const max = Math.max(1, ...itens.map((i) => i.visitas));
  return (
    <Card className="p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">{titulo}</div>
      {itens.length === 0 ? (
        <p className="mt-3 text-xs text-base-content/40">{vazio}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {itens.map((i) => (
            <li key={i.rotulo}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm text-base-content" title={i.rotulo}>{i.rotulo}</span>
                <span className="shrink-0 text-sm font-semibold text-base-content">{i.visitas}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-base-200">
                <div className="h-full bg-brand-500/60" style={{ width: `${Math.round((i.visitas / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SiteAudiencePage() {
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]['chave']>('7');
  const dias = PERIODOS.find((p) => p.chave === periodo)!.dias;

  const { from, to } = useMemo(() => {
    const hoje = new Date();
    return { from: iso(new Date(hoje.getTime() - (dias - 1) * 86_400_000)), to: iso(hoje) };
  }, [dias]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['site-overview', from, to],
    queryFn: () => getSiteOverview(from, to),
  });

  const mobile = data?.dispositivos.find((d) => d.rotulo === 'mobile')?.visitas ?? 0;
  const desktop = data?.dispositivos.find((d) => d.rotulo === 'desktop')?.visitas ?? 0;
  const tablet = data?.dispositivos.find((d) => d.rotulo === 'tablet')?.visitas ?? 0;
  const totalDisp = mobile + desktop + tablet;

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Início', to: '/dashboard' }, { label: 'Audiência do site' }]} />}
        title="Audiência do site"
        subtitle="Visitas das páginas públicas do site. Sem cookie e sem rastrear pessoa — só contagem agregada."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-base-300 p-0.5">
              {PERIODOS.map((p) => (
                <button
                  key={p.chave}
                  type="button"
                  onClick={() => setPeriodo(p.chave)}
                  className={
                    periodo === p.chave
                      ? 'rounded-md bg-brand-500 px-3 py-1 text-xs font-medium text-white'
                      : 'rounded-md px-3 py-1 text-xs text-base-content/60 hover:text-base-content'
                  }
                >
                  {p.rotulo}
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={() => refetch()}>
              <Icon name="refresh" className="h-4 w-4" /> Atualizar
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <p className="py-10 text-center text-sm text-base-content/40">Carregando…</p>
      ) : isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-base-content">Erro ao carregar a audiência do site.</p>
          <Button className="mt-3" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
        </Card>
      ) : !data || data.visitas === 0 ? (
        // Zero visitas tem duas causas MUITO diferentes, e confundi-las custaria
        // dias: ou ninguém entrou, ou o site não está enviando os pageviews. A tela
        // diz as duas em vez de mostrar um gráfico vazio e deixar a dúvida.
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-base-content">Nenhuma visita registrada neste período.</p>
          <p className="mx-auto mt-2 max-w-md text-xs text-base-content/50">
            Se o site já deveria estar enviando dados, confira se o script de medição está publicado
            nas páginas públicas e se o domínio está liberado no CORS do Nexa.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card className="p-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">Visitas</div>
              <div className="mt-0.5 text-2xl font-bold text-base-content">{data.visitas}</div>
              <div className="mt-0.5 text-xs text-base-content/40">
                {dias === 1 ? 'hoje' : `últimos ${dias} dias`}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">Visitantes</div>
              <div className="mt-0.5 text-2xl font-bold text-base-content">{data.unicosPorDia}</div>
              {/* Rótulo honesto: o hash do visitante muda à meia-noite, então em
                  período este número é a soma dos únicos de cada dia. Chamar de
                  "visitantes únicos" seco seria vender precisão que o dado não tem. */}
              <div className="mt-0.5 text-xs text-base-content/40">
                {dias === 1 ? 'distintos hoje' : 'soma dos únicos por dia'}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">Visitas por dia</div>
              <div className="mt-0.5 text-2xl font-bold text-base-content">
                {Math.round(data.visitas / Math.max(1, data.serie.length))}
              </div>
              <div className="mt-0.5 text-xs text-base-content/40">média do período</div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">Mobile</div>
              <div className="mt-0.5 text-2xl font-bold text-base-content">
                {totalDisp > 0 ? Math.round((mobile / totalDisp) * 100) : 0}%
              </div>
              <div className="mt-0.5 text-xs text-base-content/40">
                {desktop} desktop · {mobile} mobile{tablet ? ` · ${tablet} tablet` : ''}
              </div>
            </Card>
          </div>

          <Card className="mb-6 p-4">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-base-content/50">
              Visitas por dia
            </div>
            <SerieBarras serie={data.serie} />
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <TopLista
              titulo="Páginas mais vistas"
              itens={data.topPaginas}
              vazio="Nenhuma página registrada."
            />
            <TopLista
              titulo="Origens (utm_source)"
              itens={data.topOrigens}
              vazio="Nenhuma visita com utm_source. Links de campanha precisam da tag para aparecer aqui."
            />
            <TopLista
              titulo="Vieram de"
              itens={data.topReferrers}
              vazio="Nenhum referrer — visitas diretas não têm site de origem."
            />
          </div>
        </>
      )}
    </PageContainer>
  );
}
