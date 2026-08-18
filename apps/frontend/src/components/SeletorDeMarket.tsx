import { useQuery } from '@tanstack/react-query';
import { listMarkets } from '@/entities/market';
import { useMarketAtivo } from '@/shared/lib/marketAtivo';

/**
 * O market sobre o qual o módulo de vendas está trabalhando, no cabeçalho.
 *
 * Fica ao lado do seletor de CLIENTE porque são duas perguntas diferentes que
 * precisam ser lidas juntas: de quem é a conta, e o que está sendo vendido. As
 * duas palavras — "conta" e "vendendo" — existem para isso; sem elas são dois
 * menus iguais lado a lado e ninguém sabe qual é qual.
 *
 * Parece redundante enquanto os dois se chamam HiperTMS. Deixa de parecer no
 * primeiro market de outro nome, que é justamente quando errar sai caro.
 *
 * Antes disto cada aba tinha o seu seletor, e em 17/08/2026 o cabeçalho dizia
 * HiperTMS enquanto a aba de Mensagens abria em `agabe` — mensagem escrita ali
 * iria para o market errado sem nada na tela contradizendo.
 *
 * Lista TODOS os markets, inclusive rascunho: quem configura precisa alcançar o
 * que ainda não foi liberado — é o estado em que o market mais precisa de
 * trabalho.
 */
export function SeletorDeMarket() {
  const { data: markets = [] } = useQuery({
    queryKey: ['markets'],
    queryFn: () => listMarkets(false),
  });

  const [ativo, escolher] = useMarketAtivo(markets[0]?.code);

  if (markets.length === 0) return null;

  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs text-base-content/50">vendendo</span>
      <select
        value={ativo}
        onChange={(e) => escolher(e.target.value)}
        aria-label="Market ativo"
        className="h-7 rounded-md border border-base-300 bg-base-100 px-2 text-xs text-base-content"
      >
        {markets.map((m) => (
          <option key={m.code} value={m.code}>
            {m.displayName || m.name}
            {m.status !== 'active' ? ' (rascunho)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
