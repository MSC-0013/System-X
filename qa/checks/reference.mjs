// Statistical reference calculations intentionally do not import System-X analytics.
export function referenceMetrics(samples, latency, timestamp) {
  const sorted = samples.map(latency).sort((a, b) => a - b);
  const quantile = q => sorted[Math.ceil(q * sorted.length) - 1];
  const times = samples.map(timestamp);
  const span = Math.max(...times) - Math.min(...times);
  const successes = samples.filter(sample => sample.success).length;
  return {
    count: samples.length, successes, errors: samples.length - successes,
    errorRate: (samples.length - successes) / samples.length,
    p50: quantile(.5), p95: quantile(.95), p99: quantile(.99),
    throughput: span > 0 ? 1000 * samples.length / span : 0,
  };
}

export function referenceDistances(left, right) {
  const a = [...left].sort((x, y) => x - y);
  const b = [...right].sort((x, y) => x - y);
  const coordinates = [...new Set([...a, ...b])];
  const d = Math.max(...coordinates.map(x =>
    Math.abs(a.filter(y => y <= x).length / a.length - b.filter(y => y <= x).length / b.length)));
  // Discrete quantile coupling: ship integer units of probability mass.
  let i = 0, j = 0, remainingA = b.length, remainingB = a.length, massCost = 0;
  while (i < a.length && j < b.length) {
    const transfer = Math.min(remainingA, remainingB);
    massCost += transfer * Math.abs(a[i] - b[j]);
    remainingA -= transfer;
    remainingB -= transfer;
    if (!remainingA) { i++; remainingA = b.length; }
    if (!remainingB) { j++; remainingB = a.length; }
  }
  const x = d * Math.sqrt(a.length * b.length / (a.length + b.length));
  let pValue = 1;
  if (x > 0 && x < .8) {
    // Jacobi theta representation of the Kolmogorov CDF in the lower tail.
    const sum = Array.from({ length: 24 }, (_, i) => Math.exp(-(Math.PI ** 2) * (2 * i + 1) ** 2 / (8 * x * x))).reduce((a, b) => a + b, 0);
    pValue = 1 - Math.sqrt(2 * Math.PI) * sum / x;
  } else if (x >= .8) {
    // Sum positive/negative term pairs for the survival function.
    pValue = 2 * Array.from({ length: 24 }, (_, i) => {
      const odd = 2 * i + 1;
      return Math.exp(-2 * (odd * x) ** 2) - Math.exp(-2 * ((odd + 1) * x) ** 2);
    }).reduce((a, b) => a + b, 0);
  }
  return { d, pValue, wasserstein: massCost / (a.length * b.length), pValueMethod: 'asymptotic continuous-null reference; ties and dependence limit interpretation' };
}
