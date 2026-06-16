import { useEffect } from 'react';
import { HelpDemo, DemoFrame } from '@/components/HelpDemo';
import { Icon } from '@/components/ui/icons';

interface HelpSection { title: string; steps: string[]; }
interface HelpDoc { title: string; intro: string; sections: HelpSection[]; tip?: string; demo?: DemoFrame[]; }

// Manual contextual por tela
export const HELP: Record<string, HelpDoc> = {
  '/dashboard': {
    title: 'Painel',
    intro: 'Visão geral do que está acontecendo. Atualiza sozinho a cada 10 segundos.',
    demo: [
      { mock: 'card', caption: '1. Cards mostram os números do dia', label: '14', result: '11' },
      { mock: 'list', caption: '2. Quadros detalham leads, cobranças e reclamações', label: 'Item' },
      { mock: 'card', caption: '3. Atualiza sozinho a cada 10s', label: 'Auto', result: 'auto' },
    ],
    sections: [
      { title: 'O que cada número significa', steps: [
        'Contatos: total de leads cadastrados (e quantos pediram opt-out).',
        'Conversas: total de conversas e quantas estão abertas.',
        'Mensagens: recebidas (in) e enviadas (out).',
        'IA autônoma: % das respostas que a Lia mandou sozinha.',
        'Tokens / Custo IA: consumo estimado da IA (em US$).',
        'Reclamações: queixas detectadas (monitor interno, o cliente não vê).',
      ] },
      { title: 'Quadros de baixo', steps: [
        'Leads por estágio, cobranças, eventos e reclamações por tema.',
      ] },
    ],
    tip: 'Se você é vendedor, o painel mostra só os números da SUA carteira.',
  },
  '/inbox': {
    title: 'Inbox',
    intro: 'Onde você lê e responde as conversas do WhatsApp em tempo real.',
    demo: [
      { mock: 'list', caption: '1. Clique numa conversa da lista', label: 'Lead' },
      { mock: 'click', caption: '2. Clique em Lia pra sugerir resposta', label: 'Lia' },
      { mock: 'type', caption: '3. A resposta aparece — revise e envie', label: 'Bom dia! O HiperTMS emite CT-e...', result: 'enviado' },
    ],
    sections: [
      { title: 'Conversar', steps: [
        'Clique em uma conversa na lista da esquerda.',
        'As mensagens do cliente aparecem à esquerda; as suas, à direita (verde/azul).',
        'Digite no campo de baixo e clique Enviar — vai pro WhatsApp do cliente.',
      ] },
      { title: 'Usar a Lia (IA)', steps: [
        'Clique no botão "Lia" — ela lê a última mensagem do cliente e sugere uma resposta.',
        'A barrinha mostra pra qual agente roteou (vendas / suporte) e o score do lead.',
        'Revise o texto sugerido, edite se quiser, e clique Enviar.',
      ] },
      { title: 'Etiquetas', steps: [
        'Uma conversa com o nome do vendedor foi atribuída àquele vendedor.',
      ] },
    ],
    tip: 'Com o kill switch "IA ON" (no topo), a Lia responde sozinha os leads — sem você clicar.',
  },
  '/contacts': {
    title: 'Contatos (CRM)',
    intro: 'Seu cadastro de leads e clientes.',
    demo: [
      { mock: 'click', caption: '1. Clique em + Novo (ou ↑ Importar)', label: '+ Novo' },
      { mock: 'type', caption: '2. Preencha telefone, nome e empresa', label: '5511999998888, João, Transp X' },
      { mock: 'list', caption: '3. O contato aparece na lista', label: 'Contato', result: 'salvo' },
    ],
    sections: [
      { title: 'Adicionar', steps: [
        'Clique "+ Novo" e preencha telefone (55+DDD+número), nome, empresa.',
        'Ou "↑ Importar" e cole vários: uma linha por contato — telefone,nome,empresa.',
      ] },
      { title: 'Buscar', steps: [
        'Digite nome, telefone ou empresa no campo de busca e clique Buscar.',
      ] },
    ],
    tip: 'A coluna "Lead" mostra a temperatura (novo/cold/warm/hot) conforme a IA qualifica.',
  },
  '/knowledge': {
    title: 'Base de Conhecimento',
    intro: 'O que a Lia sabe pra responder os clientes. Quanto melhor a base, melhor a IA.',
    demo: [
      { mock: 'click', caption: '1. Clique em ↓ Importar TMS', label: '↓ Importar TMS' },
      { mock: 'list', caption: '2. Abra um item pra ver as versões', label: 'Tópico' },
      { mock: 'click', caption: '3. Clique Aprovar — a Lia passa a usar', label: 'Aprovar', result: 'aprovada' },
    ],
    sections: [
      { title: 'Importar do TMS', steps: [
        'Clique "↓ Importar TMS" — traz as informações do HiperTMS (planos, CT-e, etc.).',
        'É idempotente: importar de novo não duplica.',
      ] },
      { title: 'Curadoria (aprovar)', steps: [
        'Clique num item pra ver o conteúdo e as versões.',
        'Clique "Aprovar" numa versão — ela vira a verdade que a Lia usa.',
      ] },
    ],
    tip: 'A Lia só usa o que está na base. Se ela "não sabe", adicione/aprove aqui.',
  },
  '/sellers': {
    title: 'Vendedores',
    intro: 'Quem recebe os leads quentes e atende os clientes.',
    demo: [
      { mock: 'type', caption: '1. Preencha nome, WhatsApp, e-mail e senha', label: 'mateus@empresa.com' },
      { mock: 'click', caption: '2. Clique em Adicionar', label: '+ Adicionar' },
      { mock: 'list', caption: '3. Leads quentes são distribuídos automaticamente', label: 'Vendedor', result: 'lead → notificado no WhatsApp' },
    ],
    sections: [
      { title: 'Cadastrar', steps: [
        'Preencha nome + WhatsApp do vendedor.',
        'Preencha também e-mail + senha para ele ter LOGIN próprio (vê só a carteira dele).',
        'Clique "+ Adicionar".',
      ] },
      { title: 'Como funciona a distribuição', steps: [
        'Lead quente (score ≥ 70) é distribuído automaticamente (round-robin: o que tem menos leads recebe).',
        'O vendedor é avisado no WhatsApp dele na hora.',
        'Use "Ativar/Desativar" pra tirar alguém do rodízio (férias, etc.).',
      ] },
    ],
    tip: 'A coluna "Leads recebidos" mostra a distribuição entre a equipe.',
  },
  '/campaigns': {
    title: 'Disparo de Leads',
    intro: 'Enviar mensagens em massa para uma lista, com proteção anti-bloqueio.',
    demo: [
      { mock: 'type', caption: '1. Escreva a mensagem com {{nome}}', label: 'Oi {{nome}}! Conhece o HiperTMS?' },
      { mock: 'click', caption: '2. Clique em Iniciar', label: 'Iniciar' },
      { mock: 'card', caption: '3. Acompanhe o progresso e o limite do dia', label: '12/30', result: '40%' },
    ],
    sections: [
      { title: 'Criar campanha', steps: [
        'Clique "+ Nova campanha", dê um nome e escreva a mensagem.',
        'Use {{nome}} (vira o nome do lead) e {{saudacao}} (Bom dia/tarde/noite).',
        'Escolha "todos os contatos" ou cole uma lista de telefones.',
      ] },
      { title: 'Acompanhar', steps: [
        'Clique "Iniciar". A barra mostra o progresso (enviados/total).',
        'Pode "Pausar" a qualquer momento.',
      ] },
      { title: 'Anti-ban (automático)', steps: [
        'Só dispara em horário comercial (7h-19h).',
        'Respeita limite por dia e por hora; número novo "aquece" aos poucos.',
        'Opt-out e quem já respondeu são pulados; rodapé "responda SAIR" é automático.',
      ] },
    ],
    tip: 'O topo mostra quanto o número já enviou hoje (ex: 3/30).',
  },
};

export function HelpDrawer({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const doc = HELP[pathname];
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!doc) return null;
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-base-200 px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-brand-600">Como usar</div>
            <h2 className="text-lg font-bold text-base-content">{doc.title}</h2>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-base-content/50 hover:bg-base-200"><Icon name="close" className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-sm text-base-content/70">{doc.intro}</p>
          {doc.demo && <HelpDemo frames={doc.demo} />}
          {doc.sections.map((s) => (
            <div key={s.title} className="mb-5">
              <h3 className="mb-2 text-sm font-semibold text-base-content">{s.title}</h3>
              <ol className="space-y-1.5">
                {s.steps.map((st, i) => (
                  <li key={i} className="flex gap-2 text-sm text-base-content/80">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">{i + 1}</span>
                    <span>{st}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {doc.tip && (
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-700">
<span className="font-medium">Dica:</span> {doc.tip}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
