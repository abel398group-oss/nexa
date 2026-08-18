import { Input } from '@/shared/ui';

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Cor da marca do mercado — seletor nativo e o hex, lado a lado.
 *
 * Era só uma caixa de texto pedindo `#FF5A1F`. Quem sabe o hex de cor da própria
 * marca de cabeça é minoria, e quem não sabe abria outra aba para descobrir. O
 * `input[type=color]` do navegador resolve isso sem biblioteca nenhuma.
 *
 * Os dois campos continuam existindo porque servem a pessoas diferentes: quem tem
 * o manual da marca cola o hex e confere; quem não tem, escolhe no olho. O seletor
 * nunca fica vazio (o navegador não permite), então ele abre no cinza do design
 * system enquanto ninguém escolheu — e é só o hex que decide se há cor gravada.
 *
 * Hex inválido não é bloqueado aqui: o servidor recusa com a mensagem certa, e
 * travar a digitação impediria de apagar o campo para voltar à marca padrão.
 */
export function CampoCor({
  valor,
  aoMudar,
  rotulo = 'Cor da faixa',
}: {
  valor: string;
  aoMudar: (v: string) => void;
  rotulo?: string;
}) {
  const valida = HEX.test(valor);

  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-base-content/60">{rotulo}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={rotulo}
          value={valida ? valor : '#64748b'}
          onChange={(e) => aoMudar(e.target.value.toUpperCase())}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-base-300 bg-transparent p-0.5"
        />
        <Input className="!h-9 text-sm" placeholder="#FF5A1F" value={valor} onChange={(e) => aoMudar(e.target.value)} />
      </div>
      {valor.trim() !== '' && !valida && (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Formato de cor inválido — use #FF5A1F.</p>
      )}
    </label>
  );
}
