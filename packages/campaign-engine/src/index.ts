export { generateCampaignPlan, summarizeCampaignPlan, computeEffectiveAlpha } from './campaignEngine.js';
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
  MultipleComparisonPolicy,
} from './types.js';
