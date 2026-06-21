// Cliente (tenant) que o platform admin esta "operando".
// Persistido em sessionStorage (limpa ao fechar a aba — FE-SEC-001 fix).
// Lido pelo interceptor do axios em cada request via header x-acting-tenant.
const KEY = 'nexa_acting_tenant';

export function getActingTenantId(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActingTenantId(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(KEY, id);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
