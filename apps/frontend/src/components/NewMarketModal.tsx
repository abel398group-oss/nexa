import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Input, Button } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { createMarket } from '@/entities/market';

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

export function NewMarketModal({ open, onClose }: NewMarketModalProps) {
  const toast = useToast();
  const qc = useQueryClient();
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  // Enquanto o usuário não editar o slug à mão, ele acompanha o nome.
  const [slugEditado, setSlugEditado] = useState(false);

  function limpar() {
    setNome('');
    setSlug('');
    setSlugEditado(false);
  }

  function fechar() {
    limpar();
    onClose();
  }

  const criar = useMutation({
    mutationFn: () => createMarket({ name: nome.trim(), slug: slug.trim() }),
    onSuccess: (m) => {
      // Mesma queryKey que a MarketsPage consome — sem isto o mercado só apareceria
      // depois de um F5.
      void qc.invalidateQueries({ queryKey: ['markets'] });
      toast.success(`${m.name} criado em rascunho — libere quando estiver montado.`);
      limpar();
      onClose();
    },
    // O servidor diz QUAL regra falhou (slug duplicado, formato inválido). Mostrar a
    // mensagem dele vale mais que um "erro ao criar" genérico.
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(' · ') : msg ?? 'Não foi possível criar o market.');
    },
  });

  const slugPreview = slugEditado ? slug : derivarSlug(nome);
  const podeSalvar = nome.trim().length > 0 && slugPreview.length > 0;

  return (
    <Modal open={open} onClose={fechar} title="Criar novo market" size="sm">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-base-content/60">Nome do market</label>
          <Input
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              if (!slugEditado) setSlug(derivarSlug(e.target.value));
            }}
            placeholder="Agabê"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-base-content/60">Identificador</label>
          <Input
            value={slugPreview}
            onChange={(e) => {
              setSlugEditado(true);
              setSlug(e.target.value);
            }}
            placeholder="agabe"
          />
          <p className="mt-1 text-[11px] text-base-content/40">
            Vira o código do market no sistema. Só letras minúsculas, números e hífen — não muda depois.
          </p>
        </div>
        <p className="rounded-lg bg-base-100 px-3 py-2 text-[11px] text-base-content/50">
          O market nasce em <strong>rascunho</strong>: não aparece no Disparo até você liberá-lo.
          A identidade de e-mail começa com o nome e pode ser ajustada depois.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={fechar}>Cancelar</Button>
          <Button onClick={() => criar.mutate()} loading={criar.isPending} disabled={!podeSalvar}>
            Criar market
          </Button>
        </div>
      </div>
    </Modal>
  );
}
