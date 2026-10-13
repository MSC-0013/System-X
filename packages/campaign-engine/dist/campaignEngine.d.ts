/**
 * I7 — Research Campaign Engine: Main campaign planner.
 *
 * Generates a full CampaignPlan from a CampaignSpec by:
 *  1. Computing the Cartesian product of all dimensions.
 *  2. Validating each cell against the QUORUM capability matrix.
 *  3. Separating valid cells from excluded cells (with reasons).
 *  4. Computing the effective per-cell alpha from the multiple-comparison policy.
 *
 * IMPORTANT: Pure function — NO I/O performed here.
 */
import type { CampaignSpec, CampaignPlan, MultipleComparisonPolicy } from './types.js';
/**
 * Generate a campaign plan from a CampaignSpec.
 */
export declare function generateCampaignPlan(spec: CampaignSpec): CampaignPlan;
/**
 * Return a human-readable summary of a campaign plan.
 */
export declare function summarizeCampaignPlan(plan: CampaignPlan): string;
/**
 * Compute the effective per-cell alpha for the given policy.
 *
 * NONE:             effectiveAlpha = baseAlpha
 * BONFERRONI:       effectiveAlpha = baseAlpha / numCells  (pre-experiment)
 * HOLM:             effectiveAlpha = baseAlpha  (adjustment applied post-hoc per result)
 * BENJAMINI_HOCHBERG: effectiveAlpha = baseAlpha  (FDR applied post-hoc per result)
 *
 * For HOLM and BH, the effectiveAlpha reported here is the nominal base alpha.
 * The actual step-down or BH adjustment is applied when processing ordered p-values
 * after all cell results are collected (post-hoc, not per-cell pre-experiment).
 */
export declare function computeEffectiveAlpha(baseAlpha: number, numCells: number, policy: MultipleComparisonPolicy): number;
//# sourceMappingURL=campaignEngine.d.ts.map