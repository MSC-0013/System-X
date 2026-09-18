/**
 * I7 — Research Campaign Engine: Main campaign planner.
 *
 * Generates a full CampaignPlan from a CampaignSpec by:
 *  1. Computing the Cartesian product of all dimensions.
 *  2. Validating each cell against the QUORUM capability matrix.
 *  3. Separating valid cells from excluded cells (with reasons).
 *
 * IMPORTANT: Pure function — NO I/O performed here.
 */
import type {
  CampaignSpec,
  CampaignPlan,
  CampaignCell,
  ExcludedCell,
} from './types.js';
import { validateCellCapability } from './capabilityValidator.js';

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a campaign plan from a CampaignSpec.
 */
export function generateCampaignPlan(spec: CampaignSpec): CampaignPlan {
  const validCells: CampaignCell[] = [];
  const excludedCells: ExcludedCell[] = [];

  let cellIndex = 0;

  for (const consistency of spec.consistencyDimensions) {
    for (const fault of spec.faultDimensions) {
      for (const load of spec.loadDimensions) {
        const cellId = `${spec.campaignId}-cell-${cellIndex++}`;
        const cell: CampaignCell = { cellId, consistency, fault, load };

        const validation = validateCellCapability(cell, spec.quorumCapabilities);
        if (validation.valid) {
          validCells.push(cell);
        } else {
          excludedCells.push({ cell, reason: validation.reason ?? 'Unknown reason' });
        }
      }
    }
  }

  return {
    campaignId: spec.campaignId,
    totalCells: validCells.length + excludedCells.length,
    cells: validCells,
    excludedCells,
  };
}

/**
 * Return a human-readable summary of a campaign plan.
 */
export function summarizeCampaignPlan(plan: CampaignPlan): string {
  const lines: string[] = [
    `Campaign: ${plan.campaignId}`,
    `Total matrix size: ${plan.totalCells} cells`,
    `Valid cells: ${plan.cells.length}`,
    `Excluded cells: ${plan.excludedCells.length}`,
  ];

  if (plan.excludedCells.length > 0) {
    lines.push('Exclusion reasons:');
    const reasons = new Map<string, number>();
    for (const exc of plan.excludedCells) {
      reasons.set(exc.reason, (reasons.get(exc.reason) ?? 0) + 1);
    }
    for (const [reason, count] of reasons.entries()) {
      lines.push(`  - ${reason} (${count}x)`);
    }
  }

  return lines.join('\n');
}
