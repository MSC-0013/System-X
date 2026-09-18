/**
 * I8 — Certification Gate: Artifact integrity verification.
 *
 * Provides SHA-256 checksum computation and lineage verification.
 * These are pure functions — no I/O.
 */
import { createHash } from 'node:crypto';
import { canonicalJsonStringify } from '@system-x/integration-contracts';
import type { ArtifactRecord, CertificationLineage } from './types.js';

/**
 * Compute SHA-256 hex checksum of a string or Buffer.
 */
export function computeSha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Verify that an ArtifactRecord's checksum matches the provided content.
 * Returns true if the checksum matches.
 */
export function verifyArtifactChecksum(
  record: ArtifactRecord,
  content: string | Buffer,
): boolean {
  const computed = computeSha256(content);
  return computed === record.sha256;
}

/**
 * Verify that all required artifacts in the lineage are present and
 * have non-empty SHA-256 checksums (64 hex chars).
 */
export function verifyLineageCompleteness(
  lineage: CertificationLineage,
): { complete: boolean; missingArtifacts: string[] } {
  const required: Array<[string, ArtifactRecord | undefined]> = [
    ['workloadTrace', lineage.workloadTrace],
    ['faultTimeline', lineage.faultTimeline],
    ['quorumResults', lineage.quorumResults],
    ['blackboxResults', lineage.blackboxResults],
    ['comparisonReport', lineage.comparisonReport],
  ];

  const missing: string[] = [];
  for (const [name, artifact] of required) {
    if (!artifact || !artifact.sha256 || artifact.sha256.length !== 64) {
      missing.push(name);
    }
  }

  return { complete: missing.length === 0, missingArtifacts: missing };
}

/**
 * Compute the canonical hash of a CertificationRecord (excluding recordHash itself).
 * Used to self-verify the immutability of a record.
 */
export function computeRecordHash(record: Omit<import('./types.js').CertificationRecord, 'recordHash'>): string {
  const canonical = canonicalJsonStringify(record);
  return computeSha256(canonical);
}
