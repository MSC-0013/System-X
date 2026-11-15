import { S3Client } from '@aws-sdk/client-s3';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { evaluateCertification, computeSha256, verifyArtifactChecksum, verifyLineageCompleteness, buildArtifactUri, buildObjectKey, uploadArtifact, } from '../src/index.js';
// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const STORE_CONFIG = {
    endpoint: 'http://localhost:9000',
    bucketName: 'system-x-artifacts',
    region: 'us-east-1',
    forcePathStyle: true,
    retentionDays: 365,
};
function makeArtifact(name, withVersionId = true) {
    return {
        name,
        uri: `s3://system-x-artifacts/runs/run-001/${name}`,
        sha256: 'a'.repeat(64),
        mediaType: 'application/json',
        sizeBytes: 100,
        ...(withVersionId ? { versionId: 'ver-001' } : {}),
        objectLockMode: 'COMPLIANCE',
        objectLockRetainUntil: '2027-01-01T00:00:00.000Z',
        uploadedAt: '2026-09-18T00:00:00.000Z',
    };
}
function makeLineage(withVersionId = true) {
    return {
        integrationRunId: 'run-001',
        experimentSpecHash: 'e'.repeat(64),
        workloadTrace: makeArtifact('workloadTrace', withVersionId),
        faultTimeline: makeArtifact('faultTimeline', withVersionId),
        quorumResults: makeArtifact('quorumResults', withVersionId),
        blackboxResults: makeArtifact('blackboxResults', withVersionId),
        comparisonReport: makeArtifact('comparisonReport', withVersionId),
    };
}
function makeCertifiedComparison() {
    return {
        experimentSpecHash: 'e'.repeat(64),
        integrationRunId: 'run-001',
        latencyKs: { dStatistic: 0.05, pValue: 0.4, rejected: false, alpha: 0.05 },
        latencyWasserstein: { distance: 1.5 },
        throughputMape: { mapePercent: 5 },
        p99LatencyMape: { mapePercent: 8 },
        simulation: { sampleCount: 100, p50Ms: 20, p95Ms: 40, p99Ms: 45, throughputOpsSec: 950, successRate: 0.98 },
        real: { sampleCount: 100, p50Ms: 22, p95Ms: 43, p99Ms: 50, throughputOpsSec: 1000, successRate: 0.99 },
        certified: true,
        verdict: 'CERTIFIED',
    };
}
// ---------------------------------------------------------------------------
// Tests: artifact integrity
// ---------------------------------------------------------------------------
describe('I8: Certification Gate — artifact integrity', () => {
    it('computeSha256 produces 64-char hex string', () => {
        const hash = computeSha256('hello world');
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
    it('computeSha256 is deterministic', () => {
        expect(computeSha256('test')).toBe(computeSha256('test'));
    });
    it('verifyArtifactChecksum returns true for matching content', () => {
        const content = 'artifact content';
        const sha256 = computeSha256(content);
        const record = makeArtifact('test');
        const corrected = { ...record, sha256 };
        expect(verifyArtifactChecksum(corrected, content)).toBe(true);
    });
    it('verifyArtifactChecksum returns false for mismatched content', () => {
        const record = makeArtifact('test'); // sha256 = 'a'.repeat(64)
        expect(verifyArtifactChecksum(record, 'different content')).toBe(false);
    });
    it('verifyLineageCompleteness returns complete for valid lineage', () => {
        const result = verifyLineageCompleteness(makeLineage());
        expect(result.complete).toBe(true);
        expect(result.missingArtifacts).toHaveLength(0);
    });
    it('verifyLineageCompleteness detects invalid sha256', () => {
        const lineage = makeLineage();
        const corrupted = {
            ...lineage,
            workloadTrace: { ...lineage.workloadTrace, sha256: 'short' },
        };
        const result = verifyLineageCompleteness(corrupted);
        expect(result.complete).toBe(false);
        expect(result.missingArtifacts).toContain('workloadTrace');
    });
});
// ---------------------------------------------------------------------------
// Tests: artifact store utilities
// ---------------------------------------------------------------------------
describe('I8: Certification Gate — artifact store utilities', () => {
    it('buildObjectKey produces correct key pattern', () => {
        const key = buildObjectKey('run-001', 'workloadTrace.json');
        expect(key).toBe('runs/run-001/workloadTrace.json');
    });
    it('buildArtifactUri produces correct S3 URI', () => {
        const uri = buildArtifactUri(STORE_CONFIG, 'run-001', 'comparisonReport.json');
        expect(uri).toBe('s3://system-x-artifacts/runs/run-001/comparisonReport.json');
    });
    it('uploads SHA-256 in S3 format and verifies retention on the exact version', async () => {
        const send = vi.spyOn(S3Client.prototype, 'send')
            .mockResolvedValueOnce({ VersionId: 'ver-abc' })
            .mockResolvedValueOnce({ Retention: { Mode: 'COMPLIANCE', RetainUntilDate: new Date('2035-01-01T00:00:00Z') } });
        const record = await uploadArtifact('test payload', 'run-001', 'workloadTrace.json', 'application/json', STORE_CONFIG);
        expect(record.versionId).toBe('ver-abc');
        expect(record.sha256).toBe(computeSha256('test payload'));
        expect(send.mock.calls[0][0].input.ChecksumSHA256).toBe(Buffer.from(record.sha256, 'hex').toString('base64'));
        expect(send.mock.calls[1][0].input.VersionId).toBe('ver-abc');
        expect(record.objectLockMode).toBe('COMPLIANCE');
        expect(record.uri).toContain('s3://system-x-artifacts');
    });
    it('rejects a versioned upload without confirmed COMPLIANCE retention', async () => {
        vi.spyOn(S3Client.prototype, 'send')
            .mockResolvedValueOnce({ VersionId: 'ver-abc' })
            .mockResolvedValueOnce({ Retention: { Mode: 'GOVERNANCE', RetainUntilDate: new Date('2035-01-01T00:00:00Z') } });
        await expect(uploadArtifact('data', 'run-001', 'test.json', 'application/json', STORE_CONFIG)).rejects.toThrow(/COMPLIANCE/);
    });
    it('uploadArtifact throws ArtifactStoreError on 500', async () => {
        vi.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce(Object.assign(new Error('Internal server error'), { $metadata: { httpStatusCode: 500 } }));
        await expect(uploadArtifact('data', 'run-001', 'test.json', 'application/json', STORE_CONFIG)).rejects.toMatchObject({ statusCode: 500, retryable: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });
});
// ---------------------------------------------------------------------------
// Tests: evaluation
// ---------------------------------------------------------------------------
describe('I8: Certification Gate — evaluateCertification', () => {
    it('accepts comparison and lineage metadata but never certifies fabricated storage metadata', () => {
        const record = evaluateCertification('run-001', 'e'.repeat(64), makeCertifiedComparison(), makeLineage(true), true);
        expect(record.metadataEligible).toBe(true);
        expect(record.certified).toBe(false);
        expect(record.verdict).toContain('NOT CERTIFIED');
        expect(record.recordHash).toHaveLength(64);
    });
    it('fails when comparison is not certified', () => {
        const notCertified = { ...makeCertifiedComparison(), certified: false, verdict: 'NOT CERTIFIED: p99 fail' };
        const record = evaluateCertification('run-001', 'e'.repeat(64), notCertified, makeLineage(true), true);
        expect(record.certified).toBe(false);
        expect(record.verdict).toContain('NOT CERTIFIED');
    });
    it('fails zero-mock check when versionId is missing', () => {
        const record = evaluateCertification('run-001', 'e'.repeat(64), makeCertifiedComparison(), makeLineage(false), // no versionId
        true);
        expect(record.certified).toBe(false);
        expect(record.verdict).toContain('zero-mock violation');
    });
    it('allows metadata preflight without versionId but remains uncertified', () => {
        const record = evaluateCertification('run-001', 'e'.repeat(64), makeCertifiedComparison(), makeLineage(false), false);
        expect(record.metadataEligible).toBe(true);
        expect(record.certified).toBe(false);
    });
    it('recordHash changes when integrationRunId changes', () => {
        const r1 = evaluateCertification('run-001', 'e'.repeat(64), makeCertifiedComparison(), makeLineage(), false);
        const r2 = evaluateCertification('run-002', 'e'.repeat(64), makeCertifiedComparison(), makeLineage(), false);
        expect(r1.recordHash).not.toBe(r2.recordHash);
    });
});
