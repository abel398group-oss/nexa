// Barrel público da entity "message-template" (FSD).
export type { MessageTemplate, TemplatePreview, AvisoDeTeste } from './types/message-template.types';

export {
  listTemplates,
  createTemplate,
  updateTemplate,
  archiveTemplate,
  previewTemplate,
  sendTemplateTest,
} from './api/message-template.api';
