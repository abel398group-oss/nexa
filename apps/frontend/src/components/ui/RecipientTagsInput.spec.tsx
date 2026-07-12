/**
 * RecipientTagsInput — unit tests
 * Coverage: add (Enter / button), remove, validation, cap, collapse/expand, legacy migration.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipientTagsInput, type Recipient } from './RecipientTagsInput';

// ── Helpers ───────────────────────────────────────────────────────────────────

function setup(
  props: Partial<React.ComponentProps<typeof RecipientTagsInput>> & {
    channel?: 'whatsapp' | 'email';
  } = {},
) {
  const onChange = vi.fn();
  const channel = props.channel ?? 'whatsapp';
  const value = props.value ?? [];
  render(
    <RecipientTagsInput
      value={value}
      onChange={onChange}
      channel={channel}
      label={channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'}
      {...props}
    />,
  );
  return { onChange };
}

const VALID_PHONE = '5511917747429';
const VALID_EMAIL = 'fiscal@empresa.com.br';

// ── Add via Enter ─────────────────────────────────────────────────────────────

describe('Adicionar contato via Enter', () => {
  it('adiciona telefone válido ao pressionar Enter', async () => {
    const { onChange } = setup({ channel: 'whatsapp' });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, VALID_PHONE);
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith([{ contact: VALID_PHONE, channel: 'whatsapp' }]);
  });

  it('adiciona e-mail válido ao pressionar Enter', async () => {
    const { onChange } = setup({ channel: 'email' });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, VALID_EMAIL);
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith([{ contact: VALID_EMAIL, channel: 'email' }]);
  });

  it('limpa o input após adicionar', async () => {
    setup({ channel: 'whatsapp' });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, VALID_PHONE);
    await userEvent.keyboard('{Enter}');
    expect(input).toHaveValue('');
  });
});

// ── Add via botão ─────────────────────────────────────────────────────────────

describe('Adicionar contato via botão', () => {
  it('adiciona via botão "+ Adicionar" (modo colapsado)', async () => {
    const initial: Recipient[] = [
      { contact: '5511111111111', channel: 'whatsapp' },
      { contact: '5511222222222', channel: 'whatsapp' },
      { contact: '5511333333333', channel: 'whatsapp' },
    ];
    const { onChange } = setup({ channel: 'whatsapp', value: initial });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, VALID_PHONE);
    const btn = screen.getByRole('button', { name: /adicionar/i });
    await userEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith([...initial, { contact: VALID_PHONE, channel: 'whatsapp' }]);
  });
});

// ── Remover ───────────────────────────────────────────────────────────────────

describe('Remover contato', () => {
  it('remove tag inline (< 3 contatos)', async () => {
    const initial: Recipient[] = [
      { contact: VALID_PHONE, channel: 'whatsapp' },
    ];
    const { onChange } = setup({ channel: 'whatsapp', value: initial });
    const removeBtn = screen.getByRole('button', { name: `Remover ${VALID_PHONE}` });
    await userEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('remove item da lista expandida (≥ 3 contatos)', async () => {
    const initial: Recipient[] = [
      { contact: '5511111111111', channel: 'whatsapp' },
      { contact: '5511222222222', channel: 'whatsapp' },
      { contact: '5511333333333', channel: 'whatsapp' },
    ];
    const { onChange } = setup({ channel: 'whatsapp', value: initial });
    // Expand first
    await userEvent.click(screen.getByRole('button', { name: /ver/i }));
    const removeBtn = screen.getByRole('button', { name: 'Remover 5511111111111' });
    await userEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith([
      { contact: '5511222222222', channel: 'whatsapp' },
      { contact: '5511333333333', channel: 'whatsapp' },
    ]);
  });
});

// ── Validação ─────────────────────────────────────────────────────────────────

describe('Validação', () => {
  it('rejeita telefone sem DDI (< 12 dígitos)', async () => {
    setup({ channel: 'whatsapp' });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '11999999999'); // 11 dígitos
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toMatch(/inválido/i);
  });

  it('rejeita telefone com letras', async () => {
    setup({ channel: 'whatsapp' });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '5511abc999999');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('rejeita e-mail sem @', async () => {
    setup({ channel: 'email' });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'emailsemarroba.com');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('rejeita duplicado', async () => {
    const initial: Recipient[] = [{ contact: VALID_PHONE, channel: 'whatsapp' }];
    setup({ channel: 'whatsapp', value: initial });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, VALID_PHONE);
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('alert').textContent).toMatch(/já adicionado/i);
  });

  it('não chama onChange quando inválido', async () => {
    const { onChange } = setup({ channel: 'whatsapp' });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'invalido');
    await userEvent.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ── Cap ───────────────────────────────────────────────────────────────────────

describe('Cap máximo', () => {
  it('exibe mensagem de cap atingido quando value.length === max', () => {
    const initial: Recipient[] = Array.from({ length: 3 }, (_, i) => ({
      contact: `551199999999${i}`,
      channel: 'whatsapp' as const,
    }));
    setup({ channel: 'whatsapp', value: initial, max: 3 });
    expect(screen.getByText(/máximo de 3 contato/i)).toBeInTheDocument();
  });

  it('não renderiza input de adição quando cap atingido', () => {
    const initial: Recipient[] = Array.from({ length: 3 }, (_, i) => ({
      contact: `551199999999${i}`,
      channel: 'whatsapp' as const,
    }));
    setup({ channel: 'whatsapp', value: initial, max: 3 });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

// ── Colapso / expansão ────────────────────────────────────────────────────────

describe('Colapso e expansão', () => {
  const threeContacts: Recipient[] = [
    { contact: '5511111111111', channel: 'whatsapp' },
    { contact: '5511222222222', channel: 'whatsapp' },
    { contact: '5511333333333', channel: 'whatsapp' },
  ];

  it('colapsa automaticamente com 3 contatos', () => {
    setup({ channel: 'whatsapp', value: threeContacts });
    expect(screen.getByText(/3 contatos configurados/i)).toBeInTheDocument();
    // Tags inline should NOT be visible
    expect(screen.queryByText('5511111111111')).not.toBeInTheDocument();
  });

  it('não colapsa com 2 contatos', () => {
    setup({ channel: 'whatsapp', value: threeContacts.slice(0, 2) });
    expect(screen.queryByText(/contatos configurados/i)).not.toBeInTheDocument();
    // Tags should be visible
    expect(screen.getByText('5511111111111')).toBeInTheDocument();
  });

  it('expande ao clicar no botão de sumário', async () => {
    setup({ channel: 'whatsapp', value: threeContacts });
    expect(screen.queryByText('5511111111111')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /ver/i }));
    expect(screen.getByText('5511111111111')).toBeInTheDocument();
  });

  it('fecha ao clicar novamente (toggle)', async () => {
    setup({ channel: 'whatsapp', value: threeContacts });
    const toggleBtn = screen.getByRole('button', { name: /ver/i });
    await userEvent.click(toggleBtn);
    expect(screen.getByText('5511111111111')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /ocultar/i }));
    expect(screen.queryByText('5511111111111')).not.toBeInTheDocument();
  });
});

// ── Disabled ──────────────────────────────────────────────────────────────────

describe('Disabled', () => {
  it('desabilita input no modo inline quando disabled=true', () => {
    setup({ channel: 'whatsapp', disabled: true });
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
  });
});

// ── Escape limpa input ────────────────────────────────────────────────────────

describe('Tecla Escape', () => {
  it('limpa o input ao pressionar Escape', async () => {
    setup({ channel: 'whatsapp' });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'alguma coisa');
    await userEvent.keyboard('{Escape}');
    expect(input).toHaveValue('');
  });
});
