import type { ArtifactRecord, CertificationLineage } from './types.js';
/**
 * Compute SHA-256 hex checksum of a string or Buffer.
 */
export declare function computeSha256(content: string | Buffer): string;
/**
 * Verify that an ArtifactRecord's checksum matches the provided content.
 * Returns true if the checksum matches.
 */
export declare function verifyArtifactChecksum(record: ArtifactRecord, content: string | Buffer): boolean;
/**
 * Verify that all required artifacts in the lineage are present and
 * have non-empty SHA-256 checksums (64 hex chars).
 */
export declare function verifyLineageCompleteness(lineage: CertificationLineage): {
    complete: boolean;
    missingArtifacts: string[];
};
/**
 * Compute the canonical hash of a CertificationRecord (excluding recordHash itself).
 * Used to self-verify the immutability of a record.
 */
export declare function computeRecordHash(record: Omit<import('./types.js').CertificationRecord, 'recordHash'>): string;
//# sourceMappingURL=artifactIntegrity.d.ts.map