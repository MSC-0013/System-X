import { describe, it, expect } from 'vitest';
import {
  generateCampaignPlan,
  summarizeCampaignPlan,
  validateCellCapability,
} from '../src/index.js';
import type {
  CampaignSpec,
  CampaignCell,
  QuorumCapabilityMatrix,
  ConsistencyDimension,
  FaultDimension,
  LoadDimension,
} from '../src/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FULL_CAPABILITIES: QuorumCapabilityMatrix = {
  supportedReadConsistency: ['ONE', 'QUORUM', 'ALL', 'EVENTUAL', 'CAUSAL', 'SESSION'],
  supportedWriteAckPolicies: ['ONE', 'QUORUM', 'ALL'],
  supportedConflictStrategies: ['LAST_WRITE_WINS', 'VERSION_VECTOR', 'MULTI_VALUE', 'CUSTOM_MERGE'],
  supportedFaultTypes: ['NONE', 'PARTITION', 'DELAY', 'LOSS', 'CLOCK_SKEW', 'CRASH', 'RESTART', 'RECOVER'],
  maxConcurrency: 100,
  minNodeCount: 3,
};

const LIMITED_CAPABILITIES: QuorumCapabilityMatrix = {
  supportedReadConsistency: ['ONE', 'EVENTUAL'],
  supportedWriteAckPolicies: ['ONE'],
  supportedConflictStrategies: ['LAST_WRITE_WINS'],
  supportedFaultTypes: ['NONE', 'DELAY'],
  maxConcurrency: 10,
  minNodeCount: 1,
};

const consistencyDims: ConsistencyDimension[] = [
  { readConsistency: 'QUORUM', writeAckPolicy: 'QUORUM', conflictStrategy: 'LAST_WRITE_WINS' },
  { readConsistency: 'ONE', writeAckPolicy: 'ONE', conflictStrategy: 'LAST_WRITE_WINS' },
];

const faultDims: FaultDimension[] = [
  { faultType: 'NONE', targetFraction: 0, durationMs: 0 },
  { faultType: 'PARTITION', targetFraction: 0.33, durationMs: 5000 },
];

const loadDims: LoadDimension[] = [
  { operationCount: 1000, concurrency: 5, targetThroughputOpsSec: 100 },
  { operationCount: 5000, concurrency: 20, targetThroughputOpsSec: 500 },
];

function makeSpec(
  caps: QuorumCapabilityMatrix = FULL_CAPABILITIES,
  extraConsistency: ConsistencyDimension[] = [],
  extraFault: FaultDimension[] = [],
  extraLoad: LoadDimension[] = [],
): CampaignSpec {
  return {
    campaignId: 'campaign-test-001',
    consistencyDimensions: [...consistencyDims, ...extraConsistency],
    faultDimensions: [...faultDims, ...extraFault],
    loadDimensions: [...loadDims, ...extraLoad],
    quorumCapabilities: caps,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('I7: Campaign Engine', () => {
  it('generates correct Cartesian product size', () => {
    const spec = makeSpec();
    // 2 consistency × 2 fault × 2 load = 8 cells
    const plan = generateCampaignPlan(spec);
    expect(plan.totalCells).toBe(8);
  });

  it('all cells are valid with full capabilities', () => {
    const spec = makeSpec(FULL_CAPABILITIES);
    const plan = generateCampaignPlan(spec);
    expect(plan.cells).toHaveLength(plan.totalCells);
    expect(plan.excludedCells).toHaveLength(0);
  });

  it('excludes cells with unsupported read consistency', () => {
    const spec = makeSpec(LIMITED_CAPABILITIES);
    const plan = generateCampaignPlan(spec);

    // QUORUM read consistency is not in LIMITED_CAPABILITIES.
    const excluded = plan.excludedCells.filter((e) =>
      e.reason.includes('QUORUM'),
    );
    expect(excluded.length).toBeGreaterThan(0);
  });

  it('excludes cells when concurrency exceeds cluster max', () => {
    const capsWith10Max: QuorumCapabilityMatrix = {
      ...FULL_CAPABILITIES,
      maxConcurrency: 10,
    };
    const spec = makeSpec(capsWith10Max);
    // concurrency=20 should be excluded
    const plan = generateCampaignPlan(spec);
    const excluded = plan.excludedCells.filter((e) =>
      e.reason.includes('maxConcurrency') || e.reason.includes('20'),
    );
    expect(excluded.length).toBeGreaterThan(0);
  });

  it('excludes QUORUM policy when minNodeCount < 3', () => {
    const lowNodeCaps: QuorumCapabilityMatrix = {
      ...FULL_CAPABILITIES,
      minNodeCount: 1,
    };
    const spec = makeSpec(lowNodeCaps);
    const plan = generateCampaignPlan(spec);

    const quorumExcluded = plan.excludedCells.filter((e) =>
      e.reason.includes('minNodeCount'),
    );
    expect(quorumExcluded.length).toBeGreaterThan(0);
  });

  it('cell IDs are unique', () => {
    const spec = makeSpec();
    const plan = generateCampaignPlan(spec);
    const allCells = [...plan.cells, ...plan.excludedCells.map((e) => e.cell)];
    const ids = new Set(allCells.map((c) => c.cellId));
    expect(ids.size).toBe(allCells.length);
  });

  it('campaignId is propagated to the plan', () => {
    const spec = makeSpec();
    const plan = generateCampaignPlan(spec);
    expect(plan.campaignId).toBe('campaign-test-001');
  });

  it('validateCellCapability returns valid for supported cell', () => {
    const cell: CampaignCell = {
      cellId: 'c-0',
      consistency: { readConsistency: 'QUORUM', writeAckPolicy: 'QUORUM', conflictStrategy: 'LAST_WRITE_WINS' },
      fault: { faultType: 'NONE', targetFraction: 0, durationMs: 0 },
      load: { operationCount: 1000, concurrency: 5, targetThroughputOpsSec: 100 },
    };
    const result = validateCellCapability(cell, FULL_CAPABILITIES);
    expect(result.valid).toBe(true);
  });

  it('validateCellCapability returns invalid for unsupported fault type', () => {
    const cell: CampaignCell = {
      cellId: 'c-1',
      consistency: { readConsistency: 'ONE', writeAckPolicy: 'ONE', conflictStrategy: 'LAST_WRITE_WINS' },
      fault: { faultType: 'PARTITION', targetFraction: 0.5, durationMs: 3000 },
      load: { operationCount: 1000, concurrency: 5, targetThroughputOpsSec: 100 },
    };
    const result = validateCellCapability(cell, LIMITED_CAPABILITIES);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('PARTITION');
  });

  it('summarizeCampaignPlan includes cell counts', () => {
    const spec = makeSpec(FULL_CAPABILITIES);
    const plan = generateCampaignPlan(spec);
    const summary = summarizeCampaignPlan(plan);
    expect(summary).toContain('campaign-test-001');
    expect(summary).toContain('Valid cells');
    expect(summary).toContain('8');
  });
});
