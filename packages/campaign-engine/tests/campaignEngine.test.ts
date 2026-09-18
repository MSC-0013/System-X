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
  quorumNodeRequirement: 3, // policy-derived: 3-node cluster for W+R>N quorum
  raftMinNodes: 3,          // policy-derived: 3 nodes for f=1 Raft fault tolerance
};

const LIMITED_CAPABILITIES: QuorumCapabilityMatrix = {
  supportedReadConsistency: ['ONE', 'EVENTUAL'],
  supportedWriteAckPolicies: ['ONE'],
  supportedConflictStrategies: ['LAST_WRITE_WINS'],
  supportedFaultTypes: ['NONE', 'DELAY'],
  maxConcurrency: 10,
  minNodeCount: 1,
  // No quorumNodeRequirement / raftMinNodes — leaderless async, N=1 valid
};

/** A 2-node async capability: supports QUORUM reads but quorumNodeRequirement=2 */
const TWO_NODE_ASYNC_CAPABILITIES: QuorumCapabilityMatrix = {
  supportedReadConsistency: ['ONE', 'QUORUM', 'EVENTUAL'],
  supportedWriteAckPolicies: ['ONE', 'QUORUM'],
  supportedConflictStrategies: ['LAST_WRITE_WINS'],
  supportedFaultTypes: ['NONE'],
  maxConcurrency: 20,
  minNodeCount: 2,
  quorumNodeRequirement: 2, // 2-node quorum is valid for this topology
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
): CampaignSpec {
  return {
    campaignId: 'campaign-test-001',
    consistencyDimensions: consistencyDims,
    faultDimensions: faultDims,
    loadDimensions: loadDims,
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

  it('QUORUM policy validation uses quorumNodeRequirement (policy-derived, not blanket N≥3)', () => {
    // 2-node cluster with quorumNodeRequirement=2 should ACCEPT QUORUM cells.
    const spec = makeSpec(TWO_NODE_ASYNC_CAPABILITIES);
    const plan = generateCampaignPlan(spec);

    // QUORUM cells should pass because quorumNodeRequirement=2 and minNodeCount=2.
    const quorumCells = plan.cells.filter(
      (c) => c.consistency.readConsistency === 'QUORUM',
    );
    expect(quorumCells.length).toBeGreaterThan(0);
  });

  it('rejects QUORUM policy when minNodeCount < quorumNodeRequirement', () => {
    const strictCaps: QuorumCapabilityMatrix = {
      ...FULL_CAPABILITIES,
      minNodeCount: 2,
      quorumNodeRequirement: 3, // requires 3 but only 2 available
    };
    const spec = makeSpec(strictCaps);
    const plan = generateCampaignPlan(spec);
    const excluded = plan.excludedCells.filter((e) =>
      e.reason.includes('quorumNodeRequirement'),
    );
    expect(excluded.length).toBeGreaterThan(0);
  });

  it('fault fraction check excludes cells that would fault all nodes', () => {
    const singleNodeCaps: QuorumCapabilityMatrix = {
      ...LIMITED_CAPABILITIES,
      minNodeCount: 1,
    };
    const specWithFullFault: CampaignSpec = {
      campaignId: 'campaign-fault',
      consistencyDimensions: [
        { readConsistency: 'ONE', writeAckPolicy: 'ONE', conflictStrategy: 'LAST_WRITE_WINS' },
      ],
      faultDimensions: [
        { faultType: 'DELAY', targetFraction: 1.0, durationMs: 1000 }, // 100% = 1/1 nodes faulted
      ],
      loadDimensions: [
        { operationCount: 100, concurrency: 1, targetThroughputOpsSec: 10 },
      ],
      quorumCapabilities: singleNodeCaps,
    };
    const plan = generateCampaignPlan(specWithFullFault);
    expect(plan.excludedCells.length).toBeGreaterThan(0);
    expect(plan.excludedCells[0]!.reason).toContain('healthy');
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
