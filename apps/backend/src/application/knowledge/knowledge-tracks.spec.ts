import { describe, it, expect } from 'vitest';
import {
  SALES_CATEGORIES, SUPPORT_CATEGORIES, categoriesFor, unmappedCategories,
} from './knowledge-tracks.const';

/**
 * Auditoria de 08/08/2026: a separação entre as trilhas era lista NEGRA de uma
 * categoria cada, contra 16 existentes na base. Toda categoria nova nascia visível
 * para as duas. Estes testes travam a inversão para lista branca.
 */
describe('trilhas de conhecimento', () => {
  it('nenhuma categoria comercial vaza para o suporte', () => {
    for (const c of ['comercial', 'precificacao', 'vendas']) {
      expect(SUPPORT_CATEGORIES).not.toContain(c);
    }
  });

  it('nenhuma categoria operacional vaza para vendas', () => {
    for (const c of ['suporte', 'cadastros', 'administracao', 'operacional', 'operacao', 'compras', 'frota', 'financeiro', 'primeiros-passos', 'equipes']) {
      expect(SALES_CATEGORIES).not.toContain(c);
    }
  });

  // Nem toda categoria é de uma trilha só: as que descrevem o produto servem às
  // duas — o suporte explica o módulo, o vendedor vende o módulo.
  it('categorias de produto são compartilhadas de propósito', () => {
    for (const c of ['produto', 'modulo', 'conceitos']) {
      expect(SALES_CATEGORIES).toContain(c);
      expect(SUPPORT_CATEGORIES).toContain(c);
    }
  });

  it('categoriesFor devolve a lista da trilha pedida', () => {
    expect(categoriesFor('sales')).toBe(SALES_CATEGORIES);
    expect(categoriesFor('support')).toBe(SUPPORT_CATEGORIES);
  });

  describe('unmappedCategories', () => {
    // O ponto cego da lista branca: categoria nova fica INVISÍVEL para a Lia. Sem
    // este aviso, alguém cadastra 200 artigos numa categoria nova e a Lia segue
    // respondendo como se eles não existissem.
    it('aponta categoria que não pertence a trilha nenhuma', () => {
      expect(unmappedCategories(['suporte', 'juridico', 'rh'])).toEqual(['juridico', 'rh']);
    });

    it('as 16 categorias reais da base do hipertms estão todas mapeadas', () => {
      const reais = [
        'suporte', 'produto', 'modulo', 'comercial', 'administracao', 'operacional',
        'cadastros', 'compras', 'conceitos', 'precificacao', 'equipes', 'financeiro',
        'operacao', 'vendas', 'frota', 'primeiros-passos',
      ];
      expect(unmappedCategories(reais)).toEqual([]);
    });

    it('ignora null e não repete', () => {
      expect(unmappedCategories(['juridico', null, 'juridico'])).toEqual(['juridico']);
    });
  });
});
