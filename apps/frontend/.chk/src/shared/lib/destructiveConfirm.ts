// Ponte para o dialogo de confirmacao da quebra de vidro (break-glass).
// O ConfirmProvider registra aqui o confirm "bonito" do app; o interceptor do
// axios (que roda fora do React) chama confirmDestructive(). Fallback: window.confirm.
let handler: ((message: string) => Promise<boolean>) | null = null;

export function setDestructiveConfirmHandler(h: ((message: string) => Promise<boolean>) | null) {
  handler = h;
}

export function confirmDestructive(message: string): Promise<boolean> {
  if (handler) return handler(message);
  return Promise.resolve(typeof window !== 'undefined' ? window.confirm(message) : false);
}
