import type { IntegratedExperiment, IntegratedWorkload, IntegratedConsistency, IntegratedFaultSchedule, IntegratedSlo, SemanticOutcomeCategory, OperationTraceEntry, KsCertificationCriteria, KsCertificationEvaluation } from './types.js';
export declare class ValidationError extends Error {
    readonly errors: string[];
    constructor(message: string, errors?: string[]);
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
export declare function validateWorkload(workload: IntegratedWorkload): string[];
export declare function validateConsistency(consistency: IntegratedConsistency): string[];
export declare function validateFaultSchedule(schedule?: IntegratedFaultSchedule): string[];
export declare function validateSlo(slo?: IntegratedSlo): string[];
export declare function validateIntegratedExperiment(spec: unknown): ValidationResult;
export declare function assertValidIntegratedExperiment(spec: unknown): asserts spec is IntegratedExperiment;
export declare function validateOperationTraceEntry(entry: OperationTraceEntry): string[];
/**
 * Evaluates KS distribution compatibility using both statistical hypothesis testing and engineering bounds.
 */
export declare function evaluateKsCertification(ksPValue: number, ksStatistic: number, p99Mape: number, throughputMape: number, criteria?: KsCertificationCriteria): KsCertificationEvaluation;
/**
 * Maps native QUORUM LAB and BLACKBOX error codes to normalized semantic categories.
 */
export declare function mapNativeErrorToSemanticOutcome(errorCode?: string): SemanticOutcomeCategory;
//# sourceMappingURL=validation.d.ts.map