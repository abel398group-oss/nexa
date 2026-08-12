// Função pura de acesso ao relatório comercial (FSD — sem React).
import { api } from '@/shared/lib/api';
import type { RelatorioComercial } from '../types/report.types';

export async function getRelatorio(productCode?: string): Promise<RelatorioComercial> {
  const r = await api.get('/telemarketing/report', {
    params: productCode ? { productCode } : {},
  });
  return r.data;
}
