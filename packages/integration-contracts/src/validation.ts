import type {
  IntegratedExperiment,
  IntegratedWorkload,
  IntegratedConsistency,
  IntegratedFaultSchedule,
  IntegratedSlo,
  SemanticOutcomeCategory,
  OperationTraceEntry,
  KsCertificationCriteria,
  KsCertificationEvaluation
} from './types.js';

export class ValidationError extends Error {
  public readonly errors: string[];

  constructor(message: string, errors: string[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateWorkload(workload: IntegratedWorkload): string[] {
  const errors: string[] = [];

  if (!Number.isInteger(workload.operationCount) || workload.operationCount < 1) {
    errors.push(`operationCount must be an integer >= 1, got ${workload.operationCount}`);
  }

  if (!Number.isInteger(workload.concurrency) || workload.concurrency < 1 || workload.concurrency > 1000) {
    errors.push(`concurrency must be an integer between 1 and 1000, got ${workload.concurrency}`);
  }

  if (workload.distribution !== 'UNIFORM' && workload.distribution !== 'ZIPFIAN') {
    errors.push(`distribution must be 'UNIFORM' or 'ZIPFIAN', got '${workload.distribution}'`);
  }

  if (workload.distribution === 'ZIPFIAN') {
    if (workload.zipfianTheta === undefined || workload.zipfianTheta < 0.1 || workload.zipfianTheta > 2.0) {
      errors.push(
        `zipfianTheta must be between 0.1 and 2.0 for ZIPFIAN distribution, got ${workload.zipfianTheta}`
      );
    }
  }

  if (!workload.keyRange || typeof workload.keyRange !== 'object') {
    errors.push('keyRange must be defined as { min, max }');
  } else {
    if (workload.keyRange.min < 0) {
      errors.push(`keyRange.min must be >= 0, got ${workload.keyRange.min}`);
    }
    if (workload.keyRange.max < workload.keyRange.min) {
      errors.push(`keyRange.max (${workload.keyRange.max}) cannot be less than keyRange.min (${workload.keyRange.min})`);
    }
  }

  const ratioSum = workload.readRatio + workload.writeRatio;
  if (Math.abs(ratioSum - 1.0) > 1e-6) {
    errors.push(`readRatio (${workload.readRatio}) + writeRatio (${workload.writeRatio}) must equal 1.0 (sum: ${ratioSum})`);
  }
  if (workload.readRatio < 0 || workload.readRatio > 1.0) {
    errors.push(`readRatio must be between 0.0 and 1.0, got ${workload.readRatio}`);
  }
  if (workload.writeRatio < 0 || workload.writeRatio > 1.0) {
    errors.push(`writeRatio must be between 0.0 and 1.0, got ${workload.writeRatio}`);
  }

  if (workload.targetThroughputOpsSec !== undefined && workload.targetThroughputOpsSec <= 0) {
    errors.push(`targetThroughputOpsSec must be > 0, got ${workload.targetThroughputOpsSec}`);
  }

  if (workload.valueSizeBytes !== undefined && (workload.valueSizeBytes < 1 || workload.valueSizeBytes > 10485760)) {
    errors.push(`valueSizeBytes must be between 1 and 10MB, got ${workload.valueSizeBytes}`);
  }

  return errors;
}

export function validateConsistency(consistency: IntegratedConsistency): string[] {
  const errors: string[] = [];

  const validEngines = ['LEADERLESS', 'LEADER', 'RAFT'];
  if (!validEngines.includes(consistency.replicationEngine)) {
    errors.push(`Invalid replicationEngine: '${consistency.replicationEngine}'`);
  }

  const validReadConsistencies = ['ONE', 'QUORUM', 'ALL', 'EVENTUAL', 'CAUSAL', 'SESSION'];
  if (!validReadConsistencies.includes(consistency.readConsistency)) {
    errors.push(`Invalid readConsistency: '${consistency.readConsistency}'`);
  }

  const validWritePolicies = ['ONE', 'QUORUM', 'ALL'];
  if (!validWritePolicies.includes(consistency.writeAckPolicy)) {
    errors.push(`Invalid writeAckPolicy: '${consistency.writeAckPolicy}'`);
  }

  const validDurabilities = ['MEMORY_ONLY', 'BATCHED_FSYNC', 'SYNC_FSYNC'];
  if (!validDurabilities.includes(consistency.durability)) {
    errors.push(`Invalid durability: '${consistency.durability}'`);
  }

  const validConflictStrategies = ['LAST_WRITE_WINS', 'VERSION_VECTOR', 'MULTI_VALUE', 'CUSTOM_MERGE'];
  if (!validConflictStrategies.includes(consistency.conflictStrategy)) {
    errors.push(`Invalid conflictStrategy: '${consistency.conflictStrategy}'`);
  }

  return errors;
}

export function validateFaultSchedule(schedule?: IntegratedFaultSchedule): string[] {
  const errors: string[] = [];
  if (!schedule) return errors;

  if (!Array.isArray(schedule.faults)) {
    errors.push('faultSchedule.faults must be an array');
    return errors;
  }

  const validFaultTypes = ['PARTITION', 'DELAY', 'LOSS', 'CLOCK_SKEW', 'CRASH', 'RESTART', 'RECOVER'];

  for (let i = 0; i < schedule.faults.length; i++) {
    const fault = schedule.faults[i]!;
    if (!fault.id || typeof fault.id !== 'string') {
      errors.push(`Fault [${i}]: id must be a non-empty string`);
    }
    if (!validFaultTypes.includes(fault.type)) {
      errors.push(`Fault [${i}]: invalid fault type '${fault.type}'`);
    }
    if (!Array.isArray(fault.targetNodes) || fault.targetNodes.length === 0) {
      errors.push(`Fault [${i}]: targetNodes must be a non-empty array of node IDs`);
    }
    if (typeof fault.offsetMs !== 'number' || fault.offsetMs < 0) {
      errors.push(`Fault [${i}]: offsetMs must be >= 0, got ${fault.offsetMs}`);
    }
    if (typeof fault.durationMs !== 'number' || fault.durationMs <= 0) {
      errors.push(`Fault [${i}]: durationMs must be > 0, got ${fault.durationMs}`);
    }

    if (fault.parameters) {
      if (fault.type === 'DELAY' && fault.parameters.delayMs !== undefined && fault.parameters.delayMs <= 0) {
        errors.push(`Fault [${i}]: parameters.delayMs must be > 0`);
      }
      if (fault.type === 'LOSS' && fault.parameters.lossRate !== undefined) {
        if (fault.parameters.lossRate < 0.0 || fault.parameters.lossRate > 1.0) {
          errors.push(`Fault [${i}]: parameters.lossRate must be between 0.0 and 1.0`);
        }
      }
      if (fault.type === 'RESTART' && fault.parameters.recoveryTimeoutMs !== undefined && fault.parameters.recoveryTimeoutMs <= 0) {
        errors.push(`Fault [${i}]: parameters.recoveryTimeoutMs must be > 0`);
      }
    }
  }

  return errors;
}

export function validateSlo(slo?: IntegratedSlo): string[] {
  const errors: string[] = [];
  if (!slo) return errors;

  if (typeof slo.targetP99Ms !== 'number' || slo.targetP99Ms <= 0) {
    errors.push(`slo.targetP99Ms must be > 0, got ${slo.targetP99Ms}`);
  }
  if (typeof slo.maxErrorRate !== 'number' || slo.maxErrorRate < 0.0 || slo.maxErrorRate > 1.0) {
    errors.push(`slo.maxErrorRate must be between 0.0 and 1.0, got ${slo.maxErrorRate}`);
  }
  if (slo.maxStaleReadRate !== undefined && (slo.maxStaleReadRate < 0.0 || slo.maxStaleReadRate > 1.0)) {
    errors.push(`slo.maxStaleReadRate must be between 0.0 and 1.0, got ${slo.maxStaleReadRate}`);
  }
  if (slo.minThroughputOpsSec !== undefined && slo.minThroughputOpsSec <= 0) {
    errors.push(`slo.minThroughputOpsSec must be > 0, got ${slo.minThroughputOpsSec}`);
  }

  return errors;
}

export function validateIntegratedExperiment(spec: unknown): ValidationResult {
  const errors: string[] = [];

  if (!spec || typeof spec !== 'object') {
    return { valid: false, errors: ['Experiment specification must be a non-null object'] };
  }

  const exp = spec as Partial<IntegratedExperiment>;

  if (!exp.id || typeof exp.id !== 'string') {
    errors.push('id must be a non-empty string');
  }

  if (!exp.name || typeof exp.name !== 'string') {
    errors.push('name must be a non-empty string');
  }

  if (exp.contractVersion !== '1.0.0') {
    errors.push(`contractVersion must be '1.0.0', got '${exp.contractVersion}'`);
  }

  if (typeof exp.masterSeed !== 'number' || !Number.isFinite(exp.masterSeed)) {
    errors.push(`masterSeed must be a valid number, got ${exp.masterSeed}`);
  }

  if (!exp.workload) {
    errors.push('workload is required');
  } else {
    errors.push(...validateWorkload(exp.workload));
  }

  if (!exp.consistency) {
    errors.push('consistency is required');
  } else {
    errors.push(...validateConsistency(exp.consistency));
  }

  if (exp.faultSchedule) {
    errors.push(...validateFaultSchedule(exp.faultSchedule));
  }

  if (exp.slo) {
    errors.push(...validateSlo(exp.slo));
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function assertValidIntegratedExperiment(spec: unknown): asserts spec is IntegratedExperiment {
  const result = validateIntegratedExperiment(spec);
  if (!result.valid) {
    throw new ValidationError(`Experiment validation failed:\n - ${result.errors.join('\n - ')}`, result.errors);
  }
}

export function validateOperationTraceEntry(entry: OperationTraceEntry): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(entry.sequence) || entry.sequence < 0) {
    errors.push(`entry.sequence must be a non-negative integer, got ${entry.sequence}`);
  }
  if (!Number.isInteger(entry.logicalClientId) || entry.logicalClientId < 0) {
    errors.push(`entry.logicalClientId must be a non-negative integer, got ${entry.logicalClientId}`);
  }
  if (!['GET', 'PUT', 'DELETE'].includes(entry.operation)) {
    errors.push(`entry.operation must be GET, PUT, or DELETE, got '${entry.operation}'`);
  }
  if (!entry.key || typeof entry.key !== 'string') {
    errors.push('entry.key must be a non-empty string');
  }
  if (entry.scheduledOffsetUs !== undefined && (typeof entry.scheduledOffsetUs !== 'number' || entry.scheduledOffsetUs < 0)) {
    errors.push(`entry.scheduledOffsetUs must be a non-negative number, got ${entry.scheduledOffsetUs}`);
  }
  return errors;
}

/**
 * Evaluates KS distribution compatibility using both statistical hypothesis testing and engineering bounds.
 */
export function evaluateKsCertification(
  ksPValue: number,
  ksStatistic: number,
  p99Mape: number,
  throughputMape: number,
  criteria: KsCertificationCriteria = {
    alpha: 0.05,
    maxEngineeringDks: 0.05,
    maxP99Mape: 0.15,
    maxThroughputMape: 0.10
  }
): KsCertificationEvaluation {
  const hypothesisAccepted = ksPValue >= criteria.alpha;
  const dKsWithinEngineeringLimit = ksStatistic <= criteria.maxEngineeringDks;
  const p99MapeWithinLimit = p99Mape <= criteria.maxP99Mape;
  const throughputMapeWithinLimit = throughputMape <= criteria.maxThroughputMape;

  const passed =
    hypothesisAccepted &&
    dKsWithinEngineeringLimit &&
    p99MapeWithinLimit &&
    throughputMapeWithinLimit;

  const reasons: string[] = [];
  if (!hypothesisAccepted) {
    reasons.push(`KS p-value (${ksPValue.toFixed(4)}) < significance level alpha (${criteria.alpha})`);
  }
  if (!dKsWithinEngineeringLimit) {
    reasons.push(`KS statistic D (${ksStatistic.toFixed(4)}) > max engineering limit (${criteria.maxEngineeringDks})`);
  }
  if (!p99MapeWithinLimit) {
    reasons.push(`p99 MAPE (${(p99Mape * 100).toFixed(1)}%) > max limit (${(criteria.maxP99Mape * 100).toFixed(1)}%)`);
  }
  if (!throughputMapeWithinLimit) {
    reasons.push(`Throughput MAPE (${(throughputMape * 100).toFixed(1)}%) > max limit (${(criteria.maxThroughputMape * 100).toFixed(1)}%)`);
  }

  return {
    passed,
    hypothesisAccepted,
    dKsWithinEngineeringLimit,
    p99MapeWithinLimit,
    throughputMapeWithinLimit,
    ...(reasons.length > 0 ? { reason: reasons.join('; ') } : {})
  };
}

/**
 * Maps native QUORUM LAB and BLACKBOX error codes to normalized semantic categories.
 */
export function mapNativeErrorToSemanticOutcome(errorCode?: string): SemanticOutcomeCategory {
  if (!errorCode) return 'SUCCESS';

  switch (errorCode.toUpperCase()) {
    case 'STATUS_CODE_FENCED':
      return 'LEADERSHIP_SAFETY_FAILURE';
    case 'NOT_LEADER':
    case 'STATUS_CODE_NOT_LEADER':
    case 'NOTLEADERERROR':
      return 'ROUTING_RETRYABLE_FAILURE';
    case 'UNSAFE_LEADER':
    case 'UNSAFELEADERERROR':
      return 'COORDINATION_LEASE_EXPIRED';
    case 'QUORUM_WRITE_FAILURE':
    case 'QUORUMWRITEERROR':
      return 'WRITE_AVAILABILITY_FAILURE';
    case 'QUORUM_READ_FAILURE':
    case 'QUORUMREADERROR':
      return 'READ_AVAILABILITY_FAILURE';
    case 'STATUS_CODE_STALE_MEMBERSHIP':
    case 'MEMBERSHIP_MISMATCH':
      return 'MEMBERSHIP_SAFETY_FAILURE';
    case 'CAUSAL_CONSISTENCY_ERROR':
    case 'CAUSAL_ANOMALY':
      return 'CONSISTENCY_REQUIREMENT_FAILURE';
    case 'STORAGE_CORRUPTION':
    case 'WAL_IO_ERROR':
      return 'INTERNAL_STORAGE_FAILURE';
    default:
      return 'ROUTING_RETRYABLE_FAILURE';
  }
}
