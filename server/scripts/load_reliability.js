#!/usr/bin/env node

/**
 * Lightweight reliability load test for Soul server APIs.
 *
 * Defaults:
 * - base URL: http://127.0.0.1:3100
 * - users: 100 and 200
 * - loops per user per scenario: 3
 *
 * Usage:
 *   node scripts/load_reliability.js
 *   BASE_URL=http://127.0.0.1:3000 node scripts/load_reliability.js
 *   USERS=100,200 LOOPS=5 node scripts/load_reliability.js
 */

const { performance } = require('node:perf_hooks');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3100';
const LOOPS = Number(process.env.LOOPS || 3);
const USERS = (process.env.USERS || '100,200')
  .split(',')
  .map((n) => Number(n.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

const TEST_USER_ID = process.env.TEST_USER_ID || 'f00f00f0-0000-0000-0000-000000000002';

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function summarizeResults(name, userCount, loopCount, durationMs, samples) {
  const total = samples.length;
  const ok = samples.filter((s) => s.ok).length;
  const failed = total - ok;
  const statusCounts = new Map();
  const errorCounts = new Map();
  const latencies = samples.map((s) => s.ms).sort((a, b) => a - b);

  for (const s of samples) {
    if (typeof s.status === 'number') {
      statusCounts.set(s.status, (statusCounts.get(s.status) || 0) + 1);
    } else if (s.error) {
      errorCounts.set(s.error, (errorCounts.get(s.error) || 0) + 1);
    }
  }

  const avg = latencies.length
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;

  return {
    scenario: name,
    users: userCount,
    loopsPerUser: loopCount,
    totalRequests: total,
    okRequests: ok,
    failedRequests: failed,
    successRate: total ? (ok / total) * 100 : 0,
    durationMs,
    throughputRps: durationMs > 0 ? (total * 1000) / durationMs : 0,
    latencyMs: {
      min: latencies[0] ?? null,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies[latencies.length - 1] ?? null,
      avg,
    },
    statuses: Object.fromEntries([...statusCounts.entries()].sort((a, b) => a[0] - b[0])),
    errors: Object.fromEntries([...errorCounts.entries()].sort((a, b) => b[1] - a[1])),
  };
}

function printSummary(summary) {
  const l = summary.latencyMs;
  console.log(`\n[${summary.scenario}] users=${summary.users}, loops=${summary.loopsPerUser}`);
  console.log(
    `  req=${summary.totalRequests}, ok=${summary.okRequests}, fail=${summary.failedRequests}, success=${summary.successRate.toFixed(2)}%`
  );
  console.log(
    `  duration=${summary.durationMs.toFixed(0)}ms, throughput=${summary.throughputRps.toFixed(2)} req/s`
  );
  console.log(
    `  latency(ms): min=${(l.min ?? 0).toFixed(1)} p50=${(l.p50 ?? 0).toFixed(1)} p95=${(l.p95 ?? 0).toFixed(1)} p99=${(l.p99 ?? 0).toFixed(1)} max=${(l.max ?? 0).toFixed(1)} avg=${(l.avg ?? 0).toFixed(1)}`
  );
  console.log(`  statuses=${JSON.stringify(summary.statuses)}`);
  if (Object.keys(summary.errors).length > 0) {
    console.log(`  errors=${JSON.stringify(summary.errors)}`);
  }
}

async function requestJson(path, { method = 'GET', headers = {}, body } = {}) {
  const start = performance.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body,
    });
    const ms = performance.now() - start;
    return { ok: res.ok, status: res.status, ms };
  } catch (error) {
    const ms = performance.now() - start;
    return {
      ok: false,
      ms,
      error: error?.name || 'NetworkError',
    };
  }
}

async function runScenario(name, userCount, loopsPerUser, makeRequest) {
  const started = performance.now();
  const tasks = [];

  for (let userIndex = 0; userIndex < userCount; userIndex++) {
    tasks.push((async () => {
      const samples = [];
      for (let i = 0; i < loopsPerUser; i++) {
        const sample = await makeRequest(userIndex, i);
        samples.push(sample);
      }
      return samples;
    })());
  }

  const nested = await Promise.all(tasks);
  const samples = nested.flat();
  const durationMs = performance.now() - started;
  return summarizeResults(name, userCount, loopsPerUser, durationMs, samples);
}

function getScenarios() {
  return [
    {
      name: 'health_root',
      run: (_u, _i) => requestJson('/'),
    },
    {
      name: 'users_search',
      run: (_u, _i) =>
        requestJson('/api/users/search?query=sh', {
          headers: { 'x-user-id': TEST_USER_ID },
        }),
    },
    {
      name: 'connections_list',
      run: (_u, _i) =>
        requestJson('/api/connections', {
          headers: { 'x-user-id': TEST_USER_ID },
        }),
    },
    {
      name: 'messages_sync',
      run: (_u, _i) => requestJson(`/api/messages/sync?userId=${encodeURIComponent(TEST_USER_ID)}`),
    },
    {
      name: 'media_presign_download',
      run: (_u, i) =>
        requestJson('/api/media/presign-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: `uploads/load-test-${i % 20}.jpg` }),
        }),
    },
  ];
}

async function main() {
  console.log(`BASE_URL=${BASE_URL}`);
  console.log(`USERS=${USERS.join(',')} LOOPS=${LOOPS}`);

  const scenarios = getScenarios();
  const allSummaries = [];

  for (const users of USERS) {
    console.log(`\n=== Running batch for ${users} concurrent users ===`);
    for (const scenario of scenarios) {
      const summary = await runScenario(scenario.name, users, LOOPS, scenario.run);
      allSummaries.push(summary);
      printSummary(summary);
    }
  }

  const hardFailures = allSummaries.filter(
    (s) => s.successRate < 99 || (s.latencyMs.p95 != null && s.latencyMs.p95 > 1000)
  );

  console.log('\n=== Verdict ===');
  if (hardFailures.length === 0) {
    console.log('PASS: no scenario breached failure threshold (success < 99% or p95 > 1000ms).');
  } else {
    console.log(`FAIL: ${hardFailures.length} scenario batches breached thresholds.`);
    for (const f of hardFailures) {
      console.log(
        `  - ${f.scenario} @ users=${f.users}: success=${f.successRate.toFixed(2)}%, p95=${(f.latencyMs.p95 ?? 0).toFixed(1)}ms`
      );
    }
  }
}

main().catch((err) => {
  console.error('Load test execution failed:', err);
  process.exit(1);
});

