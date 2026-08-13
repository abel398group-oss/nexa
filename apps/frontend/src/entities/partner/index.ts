// Barrel público da entity "partner" (FSD).
// Importe SEMPRE por aqui: `@/entities/partner`. Nunca alcance o interior.
export type { Partner, PartnerInput } from './types/partner.types';

export {
  listPartners,
  createPartner,
  updatePartner,
  togglePartnerActive,
  deletePartner,
  recordPartnerConsent,
  shareLeadWithPartner,
} from './api/partner.api';
