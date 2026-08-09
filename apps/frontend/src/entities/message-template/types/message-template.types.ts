// Biblioteca de mensagens do mercado (ADR 037).

export interface MessageTemplate {
  id: string;
  productCode: string;
  name: string;
  channel: string; // email | whatsapp
  subject: string | null;
  body: string;
  /** Posição na cadência (1 = primeiro toque). */
  step: number;
  active: boolean;
}

export interface AvisoDeTeste {
  gravidade: 'erro' | 'aviso';
  texto: string;
}

/** Resultado do teste: como a mensagem chega, mais o que está torto nela. */
export interface TemplatePreview {
  assunto: string | null;
  corpo: string;
  /** HTML do e-mail, gerado pelo mesmo render do envio. Null no WhatsApp. */
  html: string | null;
  avisos: AvisoDeTeste[];
}
