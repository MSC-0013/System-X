import { verifyLineageCompleteness, computeRecordHash } from './artifactIntegrity.js';
// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
/**
 * Evaluate all certification criteria and produce an immutable CertificationRecord.
 *
 * @param integrationRunId   Correlation ID.
 * @param experimentSpecHash Reproducibility identity hash.
 * @param comparison         ComparisonReport from I5.
 * @param lineage            Full artifact lineage (from I8 upload step).
 * @param requireVersionId   If true, all artifacts must have a versionId (zero-mock check).
 * @param certifiedAt        Optional ISO timestamp (defaults to current time).
 * @param environmentOverride Optional environment provenance (defaults to current process info).
 */
export function evaluateCertification(integrationRunId, experimentSpecHash, comparison, lineage, requireVersionId = true, certifiedAt, environmentOverride) {
    const failures = [];
    const reasons = [];
    // --- Gate 1: Comparison must be certified.
    if (!comparison.certified) {
        failures.push(`Comparison not certified: ${comparison.verdict}`);
        reasons.push('COMPARISON_NOT_CERTIFIED');
    }
    // --- Gate 2: Lineage must be complete.
    const { complete, missingArtifacts } = verifyLineageCompleteness(lineage);
    if (!complete) {
        failures.push(`Lineage incomplete: missing ${missingArtifacts.join(', ')}`);
        reasons.push('LINEAGE_INCOMPLETE');
    }
    // --- Gate 3: All artifact SHA-256 must be 64 hex chars.
    const allArtifacts = [
        lineage.workloadTrace,
        lineage.faultTimeline,
        lineage.quorumResults,
        lineage.blackboxResults,
        lineage.comparisonReport,
        ...(lineage.calibrationResult ? [lineage.calibrationResult] : []),
        ...(lineage.validationReport ? [lineage.validationReport] : []),
    ];
    for (const artifact of allArtifacts) {
        if (!/^[0-9a-f]{64}$/.test(artifact.sha256)) {
            failures.push(`Invalid SHA-256 for artifact '${artifact.name}': ${artifact.sha256}`);
            reasons.push('CHECKSUM_MISMATCH');
        }
    }
    // --- Gate 4: Zero-mock verification (versionId required).
    if (requireVersionId) {
        for (const artifact of allArtifacts) {
            if (!artifact.versionId) {
                failures.push(`Artifact '${artifact.name}' has no versionId — not uploaded to S3 (zero-mock violation)`);
                reasons.push('ZERO_MOCK_VIOLATION');
            }
        }
    }
    const certified = failures.length === 0;
    const verdict = certified
        ? 'CERTIFIED: all end-to-end gates passed with zero-mock artifact lineage'
        : `NOT CERTIFIED: ${failures.join('; ')}`;
    const environment = environmentOverride ?? {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        contractVersion: '1.0.0',
        ...(process.env['GIT_COMMIT_SHA'] ? { gitSha: process.env['GIT_COMMIT_SHA'] } : {}),
    };
    const recordWithoutHash = {
        integrationRunId,
        experimentSpecHash,
        certified,
        verdict,
        lineage,
        environment,
        certifiedAt: certifiedAt ?? new Date().toISOString(),
    };
    const recordHash = computeRecordHash(recordWithoutHash);
    return { ...recordWithoutHash, recordHash };
}
//# sourceMappingURL=certificationGate.js.map