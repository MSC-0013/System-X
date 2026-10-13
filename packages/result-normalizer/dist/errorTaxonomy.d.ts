/**
 * I4 — Result Normalizer: Error taxonomy mapping.
 *
 * Translates system-specific error codes to the unified UnifiedErrorClass.
 */
import type { UnifiedErrorClass } from './types.js';
/**
 * Classify a QUORUM LAB error code into the unified taxonomy.
 */
export declare function classifyQuorumError(errorCode: string | undefined): UnifiedErrorClass;
/**
 * Classify a BLACKBOX-X error code into the unified taxonomy.
 */
export declare function classifyBlackboxError(errorCode: string | undefined): UnifiedErrorClass;
//# sourceMappingURL=errorTaxonomy.d.ts.map