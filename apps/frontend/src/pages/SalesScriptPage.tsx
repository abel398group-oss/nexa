import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Input,
  Label,
  Modal,
  PageContainer,
  PageHeader,
  Breadcrumb,
  Textarea,
} from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { listMarkets, type Market } from '@/entities/market';
import {
  getHistoricoRoteiro,
  getRoteiro,
  salvarRoteiro,
  ITENS_DO_ROTEIRO,
  type Objecao,
  type RoteiroInput,
  type SalesScript,
} from '@/entities/sales-script';

/**
 * Roteiro do SDR, por mercado (módulo 1, itens 3-6).
 *
 * O roteiro vive no MERCADO e não na lista: HiperTMS tem um discurso, pneus terá outro,
 * e a mesma lista nunca atravessa dois mercados. Por isso a primeira coisa da tela é
 * escolher o mercado.
 *
 * Interação validada em 11/08: a setinha abre um resumo curto; o duplo clique na linha
 * abre o popup de edição; `Esc` fecha. Mesmo padrão de `CampaignsPage.tsx` — separar
 * "espiar" de "trabalhar" é o que permite conferir os itens sem risco de mexer neles.
 */
export function SalesScriptPage() {
  const [productCode, setProductCode] = useState('');
  const [editando, setEditando] = useState<null | 'objecoes' | (typeof ITENS_DO_ROTEIRO)[number]['campo']>(
    null,
  );
  const [resumoAberto, setResumoAberto] = useState<string | null>(null);

  const { data: mercados = [] } = useQuery<Market[]>({
    queryKey: ['markets', 'todos'],
    queryFn: () => listMarkets(false),
  });

  // Escolhe o primeiro mercado sozinho: com um mercado só, obrigar a escolher é um
  // clique que não decide nada.
  useEffect(() => {
    if (!productCode && mercados.length) setProductCode(mercados[0].code);
  }, [mercados, productCode]);

  const { data: roteiro, isLoading } = useQuery<SalesScript | null>({
    queryKey: ['sales-script', productCode],
    queryFn: () => getRoteiro(productCode),
    enabled: !!productCode,
  });

  const objecoes = roteiro?.objecoes ?? [];

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: 'Vendas' }, { label: 'Roteiro do SDR' }]} />
      <PageHeader
        title="Roteiro do SDR"
        subtitle="O que o SDR fala. Ele só lê — quem escreve é quem monta a operação."
      />

      <Card className="p-5">
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="mercado-roteiro">Mercado</Label>
          <select
            id="mercado-roteiro"
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
            className="h-9 w-full rounded-md border border-base-300 bg-white px-3 text-sm text-base-content shadow-sm outline-none focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/30"
          >
            {mercados.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
          {roteiro && (
            <p className="text-xs text-base-content/50">
              Versão {roteiro.version} · publicada em{' '}
              {new Date(roteiro.createdAt).toLocaleDateString('pt-BR')}
            </p>
          )}
          {!roteiro && !isLoading && productCode && (
            <p className="text-xs text-amber-700">
              Este mercado ainda não tem roteiro — o SDR abriria a mesa sem nada para
              falar.
            </p>
          )}
        </div>
      </Card>

      {productCode && (
        <Card className="p-0">
          <ul>
            {ITENS_DO_ROTEIRO.map((item) => {
              const valor = roteiro?.[item.campo] ?? '';
              return (
                <Linha
                  key={item.campo}
                  titulo={item.titulo}
                  preenchido={!!valor}
                  resumo={resumo(valor)}
                  aberto={resumoAberto === item.campo}
                  onSetinha={() =>
                    setResumoAberto(resumoAberto === item.campo ? null : item.campo)
                  }
                  onEditar={() => setEditando(item.campo)}
                  extra={
                    item.campo === 'aberturaEmail' && roteiro?.assuntoEmail
                      ? `Assunto: ${roteiro.assuntoEmail}`
                      : null
                  }
                />
              );
            })}

            <Linha
              titulo="Respostas por situação"
              preenchido={objecoes.length > 0}
              resumo={
                objecoes.length
                  ? objecoes.map((o) => o.situacao).join(' · ')
                  : 'Nenhuma resposta escrita'
              }
              aberto={resumoAberto === 'objecoes'}
              onSetinha={() =>
                setResumoAberto(resumoAberto === 'objecoes' ? null : 'objecoes')
              }
              onEditar={() => setEditando('objecoes')}
              extra="Valem para os três canais — objeção é a mesma no telefone e no e-mail."
            />
          </ul>
        </Card>
      )}

      <p className="text-xs text-base-content/50">
        Variáveis: <code>{'{{nome}}'}</code> vira o primeiro nome do lead (sem nome, a
        saudação sai sem ele), <code>{'{{remetente}}'}</code> quem está falando,{' '}
        <code>{'{{saudacao}}'}</code> bom dia / boa tarde conforme a hora.
      </p>

      {productCode && <HistoricoDeVersoes productCode={productCode} />}

      {editando && editando !== 'objecoes' && (
        <EditorDeTexto
          productCode={productCode}
          campo={editando}
          roteiro={roteiro ?? null}
          onFechar={() => setEditando(null)}
        />
      )}

      {editando === 'objecoes' && (
        <EditorDeObjecoes
          productCode={productCode}
          objecoes={objecoes}
          onFechar={() => setEditando(null)}
        />
      )}
    </PageContainer>
  );
}

/**
 * Versões antigas do roteiro.
 *
 * O versionamento existe para responder "o texto novo converteu melhor?". Guardar as
 * versões sem lugar para lê-las deixa a pergunta pela metade: dá para ver o número
 * subindo e não dá para ver o que mudou.
 *
 * Fechado por padrão e no fim da página — é consulta ocasional, não trabalho do dia.
 */
function HistoricoDeVersoes({ productCode }: { productCode: string }) {
  const [abre, setAbre] = useState(false);

  const { data: versoes = [], isLoading } = useQuery({
    queryKey: ['sales-script', productCode, 'history'],
    queryFn: () => getHistoricoRoteiro(productCode),
    enabled: abre,
  });

  // A vigente já está na tela inteira acima; repetir aqui só encompridaria a lista.
  const antigas = versoes.filter((v) => !v.active);

  return (
    <Card className="p-5">
      <button
        type="button"
        onClick={() => setAbre(!abre)}
        className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium"
      >
        Versões anteriores
        <span className={'text-base-content/40 transition-transform ' + (abre ? 'rotate-180' : '')}>
          ▾
        </span>
      </button>

      {abre && (
        <div className="pt-3">
          {isLoading && <p className="text-xs text-base-content/50">Carregando…</p>}
          {!isLoading && !antigas.length && (
            <p className="text-xs text-base-content/50">
              Só existe a versão atual — nada foi reescrito ainda.
            </p>
          )}
          {antigas.map((v) => (
            <details key={v.id} className="border-b border-base-200 py-2 last:border-0">
              <summary className="cursor-pointer text-sm">
                Versão {v.version}
                <span className="ml-2 text-xs text-base-content/50">
                  {new Date(v.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </summary>
              <div className="pt-2 text-xs leading-relaxed text-base-content/80">
                <Trecho titulo="Ligação" texto={v.aberturaCall} />
                <Trecho titulo="WhatsApp" texto={v.aberturaWhatsapp} />
                <Trecho
                  titulo={v.assuntoEmail ? `E-mail — ${v.assuntoEmail}` : 'E-mail'}
                  texto={v.aberturaEmail}
                />
                {(v.objecoes ?? []).map((o, i) => (
                  <Trecho key={i} titulo={o.situacao} texto={o.resposta} />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}

function Trecho({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto) return null;
  return (
    <div className="mb-2">
      <p className="font-medium text-base-content/60">{titulo}</p>
      <p className="whitespace-pre-wrap">{texto}</p>
    </div>
  );
}

function resumo(texto: string | null): string {
  if (!texto) return 'Não escrito ainda';
  const limpo = texto.replace(/\s+/g, ' ').trim();
  return limpo.length > 90 ? `${limpo.slice(0, 90)}…` : limpo;
}

function Linha({
  titulo,
  preenchido,
  resumo,
  aberto,
  onSetinha,
  onEditar,
  extra,
}: {
  titulo: string;
  preenchido: boolean;
  resumo: string;
  aberto: boolean;
  onSetinha: () => void;
  onEditar: () => void;
  extra?: string | null;
}) {
  return (
    <li className="border-b border-base-200 last:border-0">
      <div
        // Duplo clique abre pra editar; o clique simples não faz nada aqui, porque quem
        // quer só espiar usa a setinha ao lado.
        onDoubleClick={onEditar}
        className="flex items-center gap-3 px-4 py-3"
      >
        <span
          className={
            'h-2 w-2 shrink-0 rounded-full ' + (preenchido ? 'bg-emerald-500' : 'bg-red-400')
          }
          aria-hidden
        />
        <span className="flex-1 text-sm font-medium">{titulo}</span>
        {!preenchido && <span className="text-xs text-red-600">falta</span>}
        <Button size="xs" variant="ghost" onClick={onEditar}>
          Editar
        </Button>
        {/* Alvo de clique maior que a setinha: 16px de desenho erra, e errar aqui
            dispara o duplo clique e abre o popup sem querer. */}
        <button
          type="button"
          aria-label={aberto ? 'Fechar resumo' : 'Ver resumo'}
          onClick={onSetinha}
          className="flex h-8 w-8 items-center justify-center rounded-md text-base-content/40 hover:bg-base-200"
        >
          <span className={'transition-transform ' + (aberto ? 'rotate-180' : '')}>▾</span>
        </button>
      </div>
      {aberto && (
        <div className="border-t border-base-200 px-4 py-2 text-xs text-base-content/70">
          <p>{resumo}</p>
          {extra && <p className="mt-1 text-base-content/50">{extra}</p>}
        </div>
      )}
    </li>
  );
}

function EditorDeTexto({
  productCode,
  campo,
  roteiro,
  onFechar,
}: {
  productCode: string;
  campo: 'aberturaCall' | 'aberturaWhatsapp' | 'aberturaEmail';
  roteiro: SalesScript | null;
  onFechar: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const item = ITENS_DO_ROTEIRO.find((i) => i.campo === campo)!;
  const [texto, setTexto] = useState(roteiro?.[campo] ?? '');
  const [assunto, setAssunto] = useState(roteiro?.assuntoEmail ?? '');

  const salvar = useMutation({
    mutationFn: () => {
      // Manda só o item editado: o backend herda o resto da versão anterior, então
      // enviar o objeto inteiro sobrescreveria edição feita por outra pessoa enquanto
      // este popup estava aberto.
      const dados: RoteiroInput = { [campo]: texto } as RoteiroInput;
      if (campo === 'aberturaEmail') dados.assuntoEmail = assunto;
      return salvarRoteiro(productCode, dados);
    },
    onSuccess: (novo) => {
      toast.success(`Versão ${novo.version} publicada.`);
      qc.invalidateQueries({ queryKey: ['sales-script', productCode] });
      onFechar();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Não foi possível salvar.'),
  });

  return (
    <Modal
      open
      onClose={onFechar}
      title={item.titulo}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button loading={salvar.isPending} onClick={() => salvar.mutate()}>
            Publicar versão
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {campo === 'aberturaEmail' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assunto">Assunto</Label>
            <Input
              id="assunto"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              placeholder="Emissão de CT-e sem planilha"
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="texto">Texto</Label>
          <Textarea
            id="texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="min-h-[180px]"
            placeholder={'{{saudacao}}, {{nome}}! Aqui é o {{remetente}}, da Hipervias.'}
          />
          <p className="text-xs text-base-content/50">{item.dica}</p>
        </div>
        <p className="text-xs text-base-content/50">
          Salvar publica uma versão nova — a anterior fica no histórico, e as ligações já
          registradas continuam apontando para ela.
        </p>
      </div>
    </Modal>
  );
}

function EditorDeObjecoes({
  productCode,
  objecoes,
  onFechar,
}: {
  productCode: string;
  objecoes: Objecao[];
  onFechar: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [lista, setLista] = useState<Objecao[]>(
    objecoes.length ? objecoes : [{ situacao: '', resposta: '' }],
  );

  function mexer(i: number, campo: keyof Objecao, valor: string) {
    setLista((prev) => prev.map((o, idx) => (idx === i ? { ...o, [campo]: valor } : o)));
  }

  const salvar = useMutation({
    mutationFn: () =>
      salvarRoteiro(productCode, {
        // Linha em branco não vai pro banco: o operador deixa a última vazia sem querer,
        // e ela apareceria como situação sem nome na tela do SDR.
        objecoes: lista.filter((o) => o.situacao.trim() && o.resposta.trim()),
      }),
    onSuccess: (novo) => {
      toast.success(`Versão ${novo.version} publicada.`);
      qc.invalidateQueries({ queryKey: ['sales-script', productCode] });
      onFechar();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Não foi possível salvar.'),
  });

  const incompleta = lista.some(
    (o) => (o.situacao.trim() && !o.resposta.trim()) || (!o.situacao.trim() && o.resposta.trim()),
  );

  return (
    <Modal
      open
      onClose={onFechar}
      title="Respostas por situação"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            loading={salvar.isPending}
            // Situação sem resposta é pior que situação ausente: o SDR abre, não acha o
            // que dizer, e improvisa justamente onde o roteiro deveria segurá-lo.
            disabled={incompleta}
            onClick={() => salvar.mutate()}
          >
            Publicar versão
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {lista.map((o, i) => (
          <div key={i} className="flex flex-col gap-1.5 border-b border-base-200 pb-3">
            <div className="flex items-center gap-2">
              <Input
                value={o.situacao}
                onChange={(e) => mexer(i, 'situacao', e.target.value)}
                placeholder="Quando ele disser…  ex: “já tenho sistema”"
              />
              <button
                type="button"
                className="text-xs text-base-content/40 underline hover:text-base-content/70"
                onClick={() => setLista((prev) => prev.filter((_, idx) => idx !== i))}
              >
                tirar
              </button>
            </div>
            <Textarea
              value={o.resposta}
              onChange={(e) => mexer(i, 'resposta', e.target.value)}
              placeholder="…o SDR responde"
            />
          </div>
        ))}

        <Button
          size="sm"
          variant="outline"
          onClick={() => setLista((prev) => [...prev, { situacao: '', resposta: '' }])}
        >
          Acrescentar situação
        </Button>

        {incompleta && (
          <p className="text-xs text-amber-700">
            Tem situação sem resposta (ou o contrário). Complete ou remova a linha.
          </p>
        )}
      </div>
    </Modal>
  );
}
