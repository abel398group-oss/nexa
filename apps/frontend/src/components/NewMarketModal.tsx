import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Modal, Input, Button } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { createMarket } from '@/entities/market';
import { listPartners } from '@/entities/partner';
import { CampoCor } from './CampoCor';
import { MaterialDaCampanha } from './MaterialDaCampanha';

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
  /**
   * Quem assina o e-mail. Não tem campo na tela de criação de propósito — é sempre
   * "Lia" e nunca foi uma pergunta de quem está montando a campanha. Mas continua
   * indo no payload: a trava de liberação exige `senderName`, e um mercado nascendo
   * sem ele nasceria reprovado por uma pergunta que o formulário não fez.
   *
   * Quem precisar de outro nome muda em Mercados → Identidade, onde a identidade
   * inteira é editada.
   */
  senderName: 'Lia',
  brandTagline: '',
  brandColor: '',
  signupUrl: '',
};

/**
 * Criar mercado.
 *
 * O primeiro campo é o PARCEIRO, e não um nome digitado, porque é assim que a coisa
 * funciona de verdade: cadastra-se a empresa em Parceiros de indicação e vende-se o
 * produto dela. Digitar o nome de novo aqui é a chance de escrever "HiperTms" numa
 * tela e "HiperTMS" na outra, e ninguém descobrir que são a mesma empresa.
 *
 * "Outro" continua existindo: nem todo mercado é um parceiro cadastrado — pode ser
 * um produto próprio, ou um teste antes de formalizar a empresa.
 *
 * A identidade também está aqui. Antes o formulário pedia duas coisas e o mercado
 * nascia com uma pendência vermelha cobrando uma terceira: quem acabou de preencher
 * não entende ser cobrado por um campo que a tela não ofereceu.
 *
 * Nome e identificador ficam separados do resto por uma linha porque são a única
 * parte que NÃO muda depois — o `code` entra em conhecimento, campanha e conector.
 *
 * ## Por que a modal não fecha ao criar
 *
 * Ela tem DOIS passos. Criar era o fim, e o operador caía de volta na lista tendo
 * que achar o mercado que acabou de criar, abrir a gaveta e só então arrastar o
 * roteiro — três cliques para continuar exatamente o que estava fazendo.
 *
 * Só que o upload precisa do mercado existindo: a rota é `/markets/:code/assets`.
 * Então a modal cria de verdade e SEGUE ABERTA no passo de subir. Fechar no meio não
 * perde nada — o mercado está criado e os arquivos que já entraram estão lá.
 */
export function NewMarketModal({ open, onClose }: NewMarketModalProps) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(VAZIO);
  // Enquanto o usuário não editar o slug à mão, ele acompanha o nome.
  const [slugEditado, setSlugEditado] = useState(false);
  /// '' = ainda não escolheu · 'outro' = mercado que não é parceiro cadastrado.
  const [parceiro, setParceiro] = useState('');

  // Quem tem `settings` pode não ter `partners`, e aí esta lista devolve 403. Não é
  // erro a mostrar: o formulário continua inteiro pelo caminho "Outro". Sem
  // `retry: false` o axios ainda tentaria de novo um 403 que nunca vai virar 200.
  const { data: parceiros = [], isError: semAcesso } = useQuery({
    queryKey: ['partners'],
    queryFn: () => listPartners(),
    enabled: open,
    retry: false,
  });
  const ativos = parceiros.filter((p) => p.active);

  /** Escolher o parceiro preenche o resto — continua tudo editável depois. */
  function escolherParceiro(id: string) {
    setParceiro(id);
    if (id === 'outro' || !id) {
      setF((v) => ({ ...v, nome: '', slug: '', displayName: '' }));
      setSlugEditado(false);
      return;
    }
    const p = ativos.find((x) => x.id === id);
    if (!p) return;
    setF((v) => ({ ...v, nome: p.name, slug: derivarSlug(p.name), displayName: p.name }));
    setSlugEditado(false);
  }

  /// Preenchido quando o mercado já existe: é o que troca o passo da modal.
  const [criado, setCriado] = useState<{ code: string; name: string } | null>(null);

  function fechar() {
    setF(VAZIO);
    setSlugEditado(false);
    setParceiro('');
    setCriado(null);
    onClose();
  }

  const slug = slugEditado ? f.slug : derivarSlug(f.nome);

  const criar = useMutation({
    mutationFn: () =>
      createMarket({
        name: f.nome.trim(),
        slug: slug.trim(),
        // O vínculo de verdade, não só o preenchimento: até 19/08/2026 o seletor
        // preenchia nome/slug e o parceiro escolhido era descartado no envio —
        // nenhum mercado sabia de quem era.
        ...(parceiro && parceiro !== 'outro' && { partnerId: parceiro }),
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
      toast.success(`${m.name} criado em rascunho.`);
      // Não fecha: segue para o passo de subir o material, com o mercado já existindo.
      setCriado({ code: m.code, name: m.name });
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

  const podeSalvar = !!parceiro && f.nome.trim().length > 0 && slug.length > 0;

  // ── Passo 2: o mercado existe, agora entra o material ───────────────────
  if (criado) {
    return (
      <Modal open={open} onClose={fechar} title={`${criado.name} — material da campanha`} size="lg">
        <div className="space-y-3">
          <p className="rounded-lg bg-base-100 px-3 py-2 text-[11px] text-base-content/60">
            Mercado criado em <strong>rascunho</strong>. Arraste agora o roteiro e o portfólio —
            ou feche e faça depois em Mercados, que o que já entrou fica salvo.
          </p>

          {/* O mesmo componente da tela de Mercados: sobe pendente e é aprovado ali
              ou aqui, sem diferença. Uma segunda versão do upload seria uma segunda
              chance de as duas divergirem. */}
          <MaterialDaCampanha code={criado.code} />

          <div className="flex justify-end pt-1">
            <Button type="button" onClick={fechar}>Concluir</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={fechar} title="Criar novo mercado" size="lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (podeSalvar) criar.mutate();
        }}
      >
        {/* ── De quem é este mercado ─────────────────────────────────────── */}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-base-content/60">Parceiro</span>
          <select
            className="input w-full text-sm"
            value={parceiro}
            onChange={(e) => escolherParceiro(e.target.value)}
            autoFocus
          >
            <option value="">Escolha o parceiro…</option>
            {ativos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.type ? ` · ${p.type}` : ''}
              </option>
            ))}
            <option value="outro">Outro — produto próprio ou ainda sem cadastro</option>
          </select>
          {/* Lista vazia não é a mesma coisa que lista negada: uma manda cadastrar,
              a outra manda seguir sem. Dizer "nenhum parceiro" a quem não tem
              permissão o faria procurar um cadastro que existe. */}
          {semAcesso ? (
            <p className="mt-1 text-[11px] text-base-content/40">
              Não consigo listar os parceiros com o seu acesso — siga por "Outro".
            </p>
          ) : ativos.length === 0 ? (
            <p className="mt-1 text-[11px] text-base-content/40">
              Nenhum parceiro ativo ainda.{' '}
              <Link to="/partners" className="underline" onClick={fechar}>
                Cadastre a empresa
              </Link>{' '}
              ou siga por "Outro".
            </p>
          ) : null}
        </label>

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
            />
            {parceiro && parceiro !== 'outro' && (
              // Veio do cadastro, mas segue editável: o nome do mercado pode ser mais
              // curto que a razão social do parceiro.
              <p className="mt-1 text-[11px] text-base-content/40">Veio do parceiro — dá para ajustar.</p>
            )}
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
          Depois de criar, esta mesma janela abre para você subir o roteiro e o portfólio.
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={fechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={criar.isPending} disabled={!podeSalvar}>
            Criar e subir material
          </Button>
        </div>
      </form>
    </Modal>
  );
}
