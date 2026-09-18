export { generateCampaignPlan, summarizeCampaignPlan } from './campaignEngine.js';
export { validateCellCapability } from './capabilityValidator.js';
export type {
  CampaignSpec,
  CampaignPlan,
  CampaignCell,
  ExcludedCell,
  ConsistencyDimension,
  FaultDimension,
  LoadDimension,
  CampaignDimension,
  QuorumCapabilityMatrix,
} from './types.js';
