import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { Modal } from './Modal';

/**
 * O foco.
 *
 * O diálogo manda o cursor para o primeiro campo ao abrir — certo, e exigido pela
 * WCAG. O defeito era ele fazer isso DE NOVO a cada render: `onClose` estava nas
 * dependências do efeito, e quase todo chamador passa uma arrow nova a cada render
 * do pai. Digitar o nome do mercado ficou impossível — a cada tecla o cursor pulava
 * do campo para o primeiro elemento do diálogo. Visto em 18/08/2026.
 *
 * O teste imita o chamador de verdade: `onClose={() => ...}` inline, sem memo.
 */
function ModalDeTeste({ onClose = () => {} }: { onClose?: () => void }) {
  const [texto, setTexto] = useState('');
  return (
    <Modal open onClose={onClose} title="Teste">
      <input aria-label="primeiro" />
      <input aria-label="nome" value={texto} onChange={(e) => setTexto(e.target.value)} />
    </Modal>
  );
}

describe('Modal — foco', () => {
  it('ao abrir, o cursor vai para o primeiro campo', () => {
    render(<ModalDeTeste />);
    expect(document.activeElement).toBe(screen.getByLabelText('primeiro'));
  });

  // O teste que importa: digitar re-renderiza, e re-renderizar não pode roubar o foco.
  it('digitar não tira o cursor do campo', () => {
    render(<ModalDeTeste onClose={() => {}} />);
    const nome = screen.getByLabelText('nome');

    nome.focus();
    for (const t of ['A', 'Ag', 'Aga']) {
      fireEvent.change(nome, { target: { value: t } });
      expect(document.activeElement).toBe(nome);
    }
    expect((nome as HTMLInputElement).value).toBe('Aga');
  });

  // A causa direta: `onClose` novo a cada render não pode refazer o efeito de foco.
  it('onClose trocando de referência não devolve o foco ao primeiro campo', () => {
    const { rerender } = render(<ModalDeTeste onClose={() => {}} />);
    const nome = screen.getByLabelText('nome');
    nome.focus();

    rerender(<ModalDeTeste onClose={() => {}} />);

    expect(document.activeElement).toBe(nome);
  });

  it('Esc fecha, mesmo com o onClose trocando a cada render', () => {
    const fechar = vi.fn();
    const { rerender } = render(<ModalDeTeste onClose={fechar} />);
    // Re-render antes do Esc: com o handler preso na primeira referência, um efeito
    // que não se refaz chamaria a versão velha — a ref existe para evitar isso.
    rerender(<ModalDeTeste onClose={fechar} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(fechar).toHaveBeenCalledTimes(1);
  });
});
