# Benchmarking

`pnpm benchmark` measures a real operation only: verification of the checked-in `positive-two-hop.json` delegated request. It loads the built core package, warms it, repeats verification, and fails if the fixture is not valid.

```sh
corepack pnpm build
BENCHMARK_WARMUP=100 BENCHMARK_ITERATIONS=1000 corepack pnpm benchmark
```

The JSON output records the operation, fixture, warmup/measurement counts, elapsed time, operations per second, Node runtime, platform, architecture, and commit value. Keep the raw output with any report.

Do not compare results across machines or publish capacity/security claims without documenting CPU model, operating system, Node/pnpm versions, commit, fixture shape, configuration, sample policy, and raw data. Future measurements for credential verification, rotation, status lookup, provenance reconstruction, and adapter overhead are blocked until those operations are implemented.
