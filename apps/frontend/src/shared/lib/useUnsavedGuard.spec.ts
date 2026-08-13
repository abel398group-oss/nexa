import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUnsavedGuard } from './useUnsavedGuard';

/**
 * O risco deste hook não é ele deixar de avisar — é ele avisar DEMAIS. Um site
 * que pergunta "tem certeza que quer sair?" quando não há nada a perder ensina
 * o usuário a clicar "sair" no automático, e aí o aviso não vale nada no dia em
 * que houver texto de verdade na tela. Por isso metade destes testes é sobre
 * NÃO registrar o listener.
 */
describe('useUnsavedGuard', () => {
  let add: ReturnType<typeof vi.spyOn>;
  let remove: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    add = vi.spyOn(window, 'addEventListener');
    remove = vi.spyOn(window, 'removeEventListener');
  });
  afterEach(() => vi.restoreAllMocks());

  const registrados = () => add.mock.calls.filter((c) => c[0] === 'beforeunload').length;
  const removidos = () => remove.mock.calls.filter((c) => c[0] === 'beforeunload').length;

  it('formulário limpo: não registra nada', () => {
    renderHook(() => useUnsavedGuard(false));
    expect(registrados()).toBe(0);
  });

  it('formulário sujo: registra o aviso', () => {
    renderHook(() => useUnsavedGuard(true));
    expect(registrados()).toBe(1);
  });

  // Salvou → o formulário volta a limpo → o aviso tem que sumir sozinho, sem
  // ninguém precisar lembrar de desligá-lo.
  it('ao salvar, o aviso some sozinho', () => {
    const { rerender } = renderHook(({ sujo }) => useUnsavedGuard(sujo), {
      initialProps: { sujo: true },
    });
    expect(registrados()).toBe(1);

    rerender({ sujo: false });
    expect(removidos()).toBe(1);
  });

  it('ao sair da tela, o listener é removido', () => {
    const { unmount } = renderHook(() => useUnsavedGuard(true));
    unmount();
    expect(removidos()).toBe(1);
  });

  // É o preventDefault que faz o navegador perguntar. `returnValue` fica para os
  // navegadores antigos, que ignoram o primeiro.
  it('o handler pede a confirmação do jeito que o navegador entende', () => {
    renderHook(() => useUnsavedGuard(true));
    const handler = add.mock.calls.find((c) => c[0] === 'beforeunload')![1] as EventListener;

    const evento = { preventDefault: vi.fn(), returnValue: undefined } as any;
    handler(evento);

    expect(evento.preventDefault).toHaveBeenCalled();
    expect(evento.returnValue).toBe('');
  });
});
