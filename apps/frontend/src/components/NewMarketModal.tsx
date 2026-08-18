import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Input, Button } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { createMarket } from '@/entities/market';
import { CampoCor } from './CampoCor';

interface NewMarketModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Deriva o identificador a partir do nome: "Agabê Óleos" → "agabe-oleos".
 *
 * O servidor recusa acento, espaço e maiúscula (o slug vira o `code` do produto, que
 * entra em rota e filtro), então derivar aqui evita que o usuário descubra a regra
 * levando erro na cara. Continua editável — só para de seguir o nome depois que a
 * pessoa mexe no campo.
 */
function derivarSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira acento (diacríticos combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const VAZIO = {
  nome: '',
  slug: '',
  displayName: '',
  senderName: 'Lia',
  brandTagline: '',
  brandColor: '',
  signupUrl: '',
};

/**
 * Criar mercado.
 *
 * Pedia duas coisas — nome e identificador — e o mercado nascia com uma pendência
 * vermelha na lista: "falta o nome de exibição e o remetente". Quem acabou de
 * preencher um formulário não entende ser cobrado por um campo que o formulário não
 * ofereceu. A identidade entra aqui porque é onde o operador já está pensando na
 * marca do mercado que está criando.
 *
 * Continua tudo opcional: vazio cai no nome do mercado, do lado do servidor, e a
 * tela de Mercados edita depois. O que mudou é que agora dá para nascer pronto.
 *
 * Nome e identificador ficam separados do resto por uma linha porque são a única
 * parte que NÃO muda depois — o `code` entra em conhecimento, campanha e conector.
 */
export function NewMarketModal({ open, onClose }: NewMarketModalProps) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(VAZIO);
  // Enquanto o usuário não editar o slug à mão, ele acompanha o nome.
  const [slugEditado, setSlugEditado] = useState(false);

  function fechar() {
    setF(VAZIO);
    setSlugEditado(false);
    onClose();
  }

  const slug = slugEditado ? f.slug : derivarSlug(f.nome);

  const criar = useMutation({
    mutationFn: () =>
      createMarket({
        name: f.nome.trim(),
        slug: slug.trim(),
        // Campo vazio não entra no corpo: o DTO valida FORMATO, e mandar `''` em
        // `brandColor` reprovaria a criação inteira por causa de um campo opcional.
        ...(f.displayName.trim() && { displayName: f.displayName.trim() }),
        ...(f.senderName.trim() && { senderName: f.senderName.trim() }),
        ...(f.brandTagline.trim() && { brandTagline: f.brandTagline.trim() }),
        ...(f.brandColor.trim() && { brandColor: f.brandColor.trim() }),
        ...(f.signupUrl.trim() && { signupUrl: f.signupUrl.trim() }),
      }),
    onSuccess: (m) => {
      // Mesma queryKey que a MarketsPage consome — sem isto o mercado só apareceria
      // depois de um F5.
      void qc.invalidateQueries({ queryKey: ['markets'] });
      toast.success(`${m.name} criado em rascunho — libere quando estiver montado.`);
      fechar();
    },
    // O servidor diz QUAL regra falhou (slug duplicado, formato inválido). Mostrar a
    // mensagem dele vale mais que um "erro ao criar" genérico.
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(' · ') : msg ?? 'Não foi possível criar o mercado.');
    },
  });

  const campo = (k: keyof typeof VAZIO) => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value })),
  });

  const podeSalvar = f.nome.trim().length > 0 && slug.length > 0;

  return (
    <Modal open={open} onClose={fechar} title="Criar novo mercado" size="lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (podeSalvar) criar.mutate();
        }}
      >
        {/* ── O que não muda depois ──────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-base-content/60">Nome do mercado</span>
            <Input
              value={f.nome}
              onChange={(e) =>
                setF((v) => ({
                  ...v,
                  nome: e.target.value,
                  slug: slugEditado ? v.slug : derivarSlug(e.target.value),
                }))
              }
              placeholder="Agabê Óleos"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-base-content/60">Identificador</span>
            <Input
              value={slug}
              onChange={(e) => {
                setSlugEditado(true);
                setF((v) => ({ ...v, slug: e.target.value }));
              }}
              placeholder="agabe-oleos"
            />
            <p className="mt-1 text-[11px] text-base-content/40">
              Vira o código no sistema. Minúsculas, números e hífen — <strong>não muda depois</strong>.
            </p>
          </label>
        </div>

        {/* ── A cara dele no e-mail ──────────────────────────────────────── */}
        <div className="border-t border-base-200 pt-3">
          <p className="text-xs font-medium text-base-content">A cara dele no e-mail</p>
          <p className="mb-2 text-[11px] text-base-content/50">
            É o que o lead vê quando a mensagem chega. Em branco, o mercado usa o próprio nome — dá
            para acertar depois em Mercados.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[11px] text-base-content/60">Nome de exibição</span>
              <Input className="!h-9 text-sm" placeholder={f.nome || 'HiperTMS'} {...campo('displayName')} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-base-content/60">Assina como</span>
              <Input className="!h-9 text-sm" placeholder="Lia" {...campo('senderName')} />
            </label>
            <CampoCor valor={f.brandColor} aoMudar={(v) => setF((s) => ({ ...s, brandColor: v }))} />
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] text-base-content/60">Punchline</span>
              <Input
                className="!h-9 text-sm"
                placeholder="O TMS feito para vender frete."
                {...campo('brandTagline')}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-base-content/60">Link de cadastro</span>
              <Input className="!h-9 text-sm" placeholder="https://..." {...campo('signupUrl')} />
            </label>
          </div>
        </div>

        <p className="rounded-lg bg-base-100 px-3 py-2 text-[11px] text-base-content/50">
          O mercado nasce em <strong>rascunho</strong>: não aparece no Disparo até você liberá-lo.
          Para liberar ainda vão faltar conhecimento, uma mensagem pronta e um vendedor — a lista
          mostra o que falta.
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={fechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={criar.isPending} disabled={!podeSalvar}>
            Criar mercado
          </Button>
        </div>
      </form>
    </Modal>
  );
}
