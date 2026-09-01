import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixturePath = new URL('../tests/conformance/v1/cases/positive-two-hop.json', import.meta.url);
const corePath = new URL('../packages/core/dist/src/index.js', import.meta.url);
const iterations = Number.parseInt(process.env.BENCHMARK_ITERATIONS ?? '1000', 10);
const warmup = Number.parseInt(process.env.BENCHMARK_WARMUP ?? '100', 10);

if (
  !Number.isSafeInteger(iterations) ||
  iterations < 1 ||
  !Number.isSafeInteger(warmup) ||
  warmup < 0
) {
  throw new Error(
    'BENCHMARK_ITERATIONS must be at least 1 and BENCHMARK_WARMUP must be at least 0.'
  );
}

let verifyArtifacts;
try {
  ({ verifyArtifacts } = await import(corePath.href));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`Build @agent-proof/core before benchmarking: ${message}`);
}

const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const context = fixture.verification_context;
const input = {
  artifacts: fixture.artifacts,
  trustSnapshot: fixture.trust_snapshot,
  context: {
    audience: context.audience,
    action: context.action,
    resource: context.resource,
    task: context.task,
    expectedSigner: context.expected_signer,
    expectedPayloadDigest: context.expected_payload_digest,
    expectedTaskContextDigest: context.expected_task_context_digest,
    replayRequired: context.replay_required
  },
  now: new Date(fixture.verifier_now),
  replayMode: fixture.replay_mode
};

function verifyOnce() {
  const result = verifyArtifacts(input);
  if (!result.valid) throw new Error(`Benchmark fixture did not verify: ${result.code}`);
}

for (let index = 0; index < warmup; index += 1) verifyOnce();
const started = performance.now();
for (let index = 0; index < iterations; index += 1) verifyOnce();
const elapsedMs = performance.now() - started;

console.log(
  JSON.stringify(
    {
      benchmark: 'delegated-request-verification',
      status: 'measured',
      fixture: 'tests/conformance/v1/cases/positive-two-hop.json',
      operations: iterations,
      warmupOperations: warmup,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      operationsPerSecond: Number(((iterations * 1000) / elapsedMs).toFixed(2)),
      runtime: process.version,
      platform: process.platform,
      architecture: process.arch,
      commit: process.env.GITHUB_SHA ?? 'working-tree',
      sourceRoot: root
    },
    null,
    2
  )
);
