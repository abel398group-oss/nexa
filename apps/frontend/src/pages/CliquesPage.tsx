import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, PageContainer, PageHeader, Breadcrumb, Icon, StatusBadge } from '@/shared/ui';
import { listCliques, type CliqueDeLead } from '@/entities/site-analytics';

/**
 * Quem clicou no link da campanha.
 *
 * A tela de Audiência responde "quantos vieram" — número, que não serve para ligar
 * para ninguém. Esta responde "quem foi", que é a informação com que o vendedor age.
 *
 * Ordenada pelo clique mais recente de propósito: quem clicou agora está com a página
 * aberta, e é para esse que vale a pena ligar primeiro.
 */

const PERIODOS = [
  { rotulo: 'Hoje', dias: 1 },
  { rotulo: '7 dias', dias: 7 },
  { rotulo: '30 dias', dias: 30 },
] as const;

/** "há 6 min" diz mais que "10/08 14:32" quando a decisão é ligar ou não agora. */
function quandoRelativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

/** Telefone só com dígitos, pronto para o wa.me. */
function soDigitos(tel: string | null): string {
  return (tel ?? '').replace(/\D/g, '');
}

function Linha({ c }: { c: CliqueDeLead }) {
  const zap = soDigitos(c.telefone);
  // Clique de menos de uma hora é o que vale interromper o dia do vendedor.
  const quente = Date.now() - new Date(c.quando).getTime() < 3600_000;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-base-200 px-4 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-base-content">
            {c.nome || c.email || 'Contato sem nome'}
          </span>
          {quente && <StatusBadge tone="danger">clicou agora</StatusBadge>}
          {c.visitas > 1 && (
            <span className="text-xs text-base-content/40">{c.visitas} visitas</span>
          )}
        </div>
        <div className="truncate text-xs text-base-content/50">
          {c.email}
          {c.campanha && ` · ${c.campanha}`}
          {` · ${c.pagina}`}
        </div>
      </div>

      <span className="shrink-0 text-xs text-base-content/50">{quandoRelativo(c.quando)}</span>

      {/* Ligar é a ação da tela, então o telefone é botão, não texto. */}
      {zap.length >= 10 && (
        <div className="flex shrink-0 gap-1">
          <a href={`tel:+${zap}`} className="rounded-lg border border-base-200 px-2 py-1 text-xs hover:bg-base-100">
            Ligar
          </a>
          <a
            href={`https://wa.me/${zap}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-base-200 px-2 py-1 text-xs hover:bg-base-100"
          >
            WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}

export function CliquesPage() {
  const [dias, setDias] = useState<number>(7);

  const { data: cliques = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['cliques', dias],
    queryFn: () => listCliques({ dias }),
    // Um minuto: a tela é para agir sobre clique recente, e ficar apertando F5 é o
    // sintoma de que faltava atualizar sozinha.
    refetchInterval: 60_000,
  });

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: 'Vendas' }, { label: 'Quem clicou' }]} />
      <PageHeader
        title="Quem clicou"
        subtitle="Leads que abriram o link da campanha. Quem clicou agora está com a página aberta — é para esse que vale ligar primeiro."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => (
          <button
            key={p.dias}
            type="button"
            onClick={() => setDias(p.dias)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              dias === p.dias
                ? 'border-blue-500 bg-blue-500 text-white'
                : 'border-base-200 text-base-content/60 hover:bg-base-100'
            }`}
          >
            {p.rotulo}
          </button>
        ))}
        <Button size="sm" variant="ghost" disabled={isRefetching} onClick={() => void refetch()}>
          <Icon name="refresh" className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      <Card className="p-0">
        {isLoading ? (
          <p className="px-4 py-3 text-sm text-base-content/50">Carregando…</p>
        ) : cliques.length === 0 ? (
          // O vazio precisa dizer as DUAS causas: pode não ter clique, ou o rastreio
          // pode não estar chegando. Sem isso a tela vazia parece defeito dela.
          <div className="px-4 py-4 text-xs leading-relaxed text-base-content/50">
            Nenhum clique identificado neste período.
            <br />
            Se você já disparou com link, confira: a campanha precisa estar com{' '}
            <strong className="font-medium">link no 1º envio</strong>, o link precisa apontar para uma
            página pública do site, e o rastreio do site precisa estar publicado.
          </div>
        ) : (
          <>
            <div className="border-b border-base-200 px-4 py-2 text-xs text-base-content/60">
              {cliques.length} lead(s) clicaram
            </div>
            {cliques.map((c, i) => (
              <Linha key={`${c.email ?? c.telefone ?? i}`} c={c} />
            ))}
          </>
        )}
      </Card>

      <p className="mt-3 text-[11px] text-base-content/40">
        Só aparece quem recebeu a campanha por aqui — o link leva um código do contato. Clique de
        visitante anônimo entra na Audiência do site, não nesta lista.
      </p>
    </PageContainer>
  );
}
