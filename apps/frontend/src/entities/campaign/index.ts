// Barrel público da entity "campaign" (FSD).
// Importe SEMPRE por aqui: `@/entities/campaign`. Nunca alcance o interior.
export type {
  Campaign,
  CampaignDetail,
  CampaignCreateResult,
  SenderNumber,
  SenderSettings,
  CampaignMedia,
} from './types/campaign.types';

export {
  listCampaigns,
  getCampaign,
  createWhatsappCampaign,
  createEmailCampaign,
  updateCampaign,
  startCampaign,
  pauseCampaign,
  retryFailedTargets,
  deleteCampaign,
  removeCampaignTarget,
  bulkDeleteCampaigns,
  setCampaignsArchived,
  uploadCampaignMedia,
  listSenderNumbers,
  getSenderSettings,
  saveSenderSettings,
} from './api/campaign.api';
