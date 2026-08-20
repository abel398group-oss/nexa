// Barrel público da entity "message-template" (FSD).
export type { MessageTemplate, TemplatePreview, AvisoDeTeste } from './types/message-template.types';
export type { RascunhoDeModelo } from './api/message-template.api';

export {
  listTemplates,
  createTemplate,
  updateTemplate,
  archiveTemplate,
  approveTemplate,
  unapproveTemplate,
  previewTemplate,
  sendTemplateTest,
  rascunharModelos,
} from './api/message-template.api';
