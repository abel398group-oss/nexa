import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { RecipientTagsInput, type Recipient } from './RecipientTagsInput';

const meta = {
  title: 'Formulários/RecipientTagsInput',
  component: RecipientTagsInput,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Campo de múltiplos destinatários com tags removíveis. Inline com ≤ 2 contatos; colapsa em sumário com ≥ 3. Suporta WhatsApp (DDI + dígitos) e e-mail. Cap configurável (default 10).',
      },
    },
  },
} satisfies Meta<typeof RecipientTagsInput>;
export default meta;

type Story = StoryObj<typeof meta>;

// ── Helper ────────────────────────────────────────────────────────────────────

function Controlled(props: Partial<React.ComponentProps<typeof RecipientTagsInput>> & {
  channel: 'whatsapp' | 'email';
  initial?: Recipient[];
}) {
  const { initial = [], ...rest } = props;
  const [value, setValue] = useState<Recipient[]>(initial);
  return (
    <div className="w-80">
      <RecipientTagsInput value={value} onChange={setValue} {...rest} />
      {value.length > 0 && (
        <pre className="mt-3 rounded bg-base-200 p-2 text-[10px] text-base-content/60 overflow-auto">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Stories ───────────────────────────────────────────────────────────────────

/** WhatsApp vazio — estado inicial. */
export const WhatsAppVazio: Story = {
  render: () => (
    <Controlled
      channel="whatsapp"
      label="WhatsApp (com DDI)"
      placeholder="+ 5511999999999"
    />
  ),
};

/** E-mail vazio — estado inicial. */
export const EmailVazio: Story = {
  render: () => (
    <Controlled
      channel="email"
      label="E-mail (canal dual)"
      placeholder="+ email@empresa.com"
    />
  ),
};

/** Inline com 2 contatos — tags visíveis + input. */
export const Inline2Contatos: Story = {
  render: () => (
    <Controlled
      channel="whatsapp"
      label="WhatsApp (com DDI)"
      initial={[
        { contact: '5511917747429', channel: 'whatsapp' },
        { contact: '5511974869142', channel: 'whatsapp' },
      ]}
    />
  ),
};

/** Colapsado — 3 ou mais contatos. Clique para expandir a lista. */
export const Colapsado3Contatos: Story = {
  render: () => (
    <Controlled
      channel="whatsapp"
      label="WhatsApp (com DDI)"
      initial={[
        { contact: '5511917747429', channel: 'whatsapp' },
        { contact: '5511974869142', channel: 'whatsapp' },
        { contact: '5511994327713', channel: 'whatsapp' },
      ]}
    />
  ),
};

/** E-mails colapsados — 3 endereços configurados. */
export const EmailColapsado: Story = {
  render: () => (
    <Controlled
      channel="email"
      label="E-mail (canal dual)"
      initial={[
        { contact: 'fiscal@empresa.com.br', channel: 'email' },
        { contact: 'gerente@empresa.com.br', channel: 'email' },
        { contact: 'ti@empresa.com.br', channel: 'email' },
      ]}
    />
  ),
};

/** Cap atingido — input desabilitado com aviso. */
export const CapAtingido: Story = {
  render: () => (
    <Controlled
      channel="whatsapp"
      label="WhatsApp (com DDI)"
      max={3}
      initial={[
        { contact: '5511917747429', channel: 'whatsapp' },
        { contact: '5511974869142', channel: 'whatsapp' },
        { contact: '5511994327713', channel: 'whatsapp' },
      ]}
    />
  ),
};

/** Desabilitado — somente leitura. */
export const Desabilitado: Story = {
  render: () => (
    <Controlled
      channel="whatsapp"
      label="WhatsApp (com DDI)"
      disabled
      initial={[
        { contact: '5511917747429', channel: 'whatsapp' },
        { contact: '5511974869142', channel: 'whatsapp' },
      ]}
    />
  ),
};

/** Ambos os canais — como aparecem lado a lado num card de setor. */
export const DoisCanais: Story = {
  render: () => {
    const [wa, setWa] = useState<Recipient[]>([
      { contact: '5511917747429', channel: 'whatsapp' },
    ]);
    const [email, setEmail] = useState<Recipient[]>([]);
    return (
      <div className="w-80 space-y-4">
        <RecipientTagsInput
          value={wa}
          onChange={setWa}
          channel="whatsapp"
          label="WhatsApp (com DDI)"
        />
        <RecipientTagsInput
          value={email}
          onChange={setEmail}
          channel="email"
          label="E-mail (opcional — canal dual)"
        />
      </div>
    );
  },
};
