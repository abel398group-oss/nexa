// Cliente (tenant) que o platform admin esta "operando". Persistido em localStorage
// para sobreviver a reloads e lido pelo interceptor do axios em cada request.
const KEY = 'nexa_acting_tenant';

export function getActingTenantId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActingTenantId(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
