import { validateCellCapability } from './capabilityValidator.js';
// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
/**
 * Generate a campaign plan from a CampaignSpec.
 */
export function generateCampaignPlan(spec) {
    const validCells = [];
    const excludedCells = [];
    let cellIndex = 0;
    for (const consistency of spec.consistencyDimensions) {
        for (const fault of spec.faultDimensions) {
            for (const load of spec.loadDimensions) {
                const cellId = `${spec.campaignId}-cell-${cellIndex++}`;
                const cell = { cellId, consistency, fault, load };
                const validation = validateCellCapability(cell, spec.quorumCapabilities);
                if (validation.valid) {
                    validCells.push(cell);
                }
                else {
                    excludedCells.push({ cell, reason: validation.reason ?? 'Unknown reason' });
                }
            }
        }
    }
    const policy = spec.multipleComparisonPolicy ?? 'BENJAMINI_HOCHBERG';
    const baseAlpha = spec.baseKsAlpha ?? 0.05;
    const effectiveAlphaPerCell = computeEffectiveAlpha(baseAlpha, validCells.length, policy);
    return {
        campaignId: spec.campaignId,
        totalCells: validCells.length + excludedCells.length,
        cells: validCells,
        excludedCells,
        multipleComparisonPolicy: policy,
        effectiveAlphaPerCell,
    };
}
/**
 * Return a human-readable summary of a campaign plan.
 */
export function summarizeCampaignPlan(plan) {
    const lines = [
        `Campaign: ${plan.campaignId}`,
        `Total matrix size: ${plan.totalCells} cells`,
        `Valid cells: ${plan.cells.length}`,
        `Excluded cells: ${plan.excludedCells.length}`,
        `Multiple-comparison policy: ${plan.multipleComparisonPolicy}`,
        `Effective alpha per cell: ${plan.effectiveAlphaPerCell.toFixed(6)}`,
    ];
    if (plan.excludedCells.length > 0) {
        lines.push('Exclusion reasons:');
        const reasons = new Map();
        for (const exc of plan.excludedCells) {
            reasons.set(exc.reason, (reasons.get(exc.reason) ?? 0) + 1);
        }
        for (const [reason, count] of reasons.entries()) {
            lines.push(`  - ${reason} (${count}x)`);
        }
    }
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// Internal: multiple-comparison alpha adjustment
// ---------------------------------------------------------------------------
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
export function computeEffectiveAlpha(baseAlpha, numCells, policy) {
    if (numCells <= 0)
        return baseAlpha;
    switch (policy) {
        case 'NONE':
            return baseAlpha;
        case 'BONFERRONI':
            return baseAlpha / numCells;
        case 'HOLM':
        case 'BENJAMINI_HOCHBERG':
            // Post-hoc corrections; effectiveAlpha reported is the nominal base.
            return baseAlpha;
        default:
            return baseAlpha;
    }
}
//# sourceMappingURL=campaignEngine.js.map