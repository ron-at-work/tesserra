# Delegated request verification example

This example intentionally uses frozen, complete evidence rather than pretending the planned delegation/request issuance commands are already released. `positive-two-hop.json` contains a root credential, two attenuating delegations, and a request with expected verification context.

```sh
corepack pnpm build
corepack pnpm --filter @agent-proof/core test
corepack pnpm benchmark
```

The core test executes every conformance case and checks the full expected deterministic result. The benchmark repeatedly verifies the positive two-hop operation and records local environment metadata. Inspect the fixture without copying it into a mutable integration:

```sh
node -e 'const f=require("../../tests/conformance/v1/cases/positive-two-hop.json"); console.log(f.artifacts.map(({ kind, id }) => ({ kind, id })))'
```

Use the [quick start](../../docs/guides/quick-start.md), [delegation/request guide](../../docs/guides/delegation-and-requests.md), and [RFC](../../docs/rfcs/0001-attest-v1-wire-protocol.md) before relying on this evidence model.
