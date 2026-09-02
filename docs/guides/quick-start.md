# Quick start: local identity and delegated-request verification

This guide uses the real Phase 1 CLI for isolated fixture identity/trust state, then runs the frozen positive two-hop request verification fixture. The fixture proves the deterministic verifier accepts a signed request linked to an attenuated delegation chain under its pinned snapshot. It is not a production issuer setup and does not make a network call.

## 1. Install and build

```sh
git clone https://github.com/ron-at-work/app.git
cd app
corepack enable
node --version # v24.11.1
corepack pnpm install --frozen-lockfile
corepack pnpm build
```

## 2. Create isolated local fixture state

Keep local state outside the repository and supply the passphrase through a secret manager or protected file in real use. This shell example uses an environment variable only to make the walkthrough self-contained.

```sh
export AGENTCTL_HOME="$(mktemp -d)"
export AGENTCTL_PASSPHRASE='replace-this-demo-value'

corepack pnpm --filter @agent-proof/cli exec agentctl init --json
IDENTITY_JSON="$(corepack pnpm --filter @agent-proof/cli exec agentctl identity create \
  --agent agid:v1:example.test/quick-start \
  --dev-self-issue --expires-in 1h --json)"
printf '%s\n' "$IDENTITY_JSON"
```

`--dev-self-issue` is intentionally noisy: it creates only a local fixture identity and leaves it untrusted. Trust is a local policy decision, never a side effect of issuance.

## 3. Add the explicit fixture trust anchor

Extract the credential ID with a JSON tool and add it only to this temporary local state:

```sh
IDENTITY_ID="$(printf '%s' "$IDENTITY_JSON" | node -e 'let s=""; process.stdin.on("data", d => s += d).on("end", () => console.log(JSON.parse(s).credential.id))')"
corepack pnpm --filter @agent-proof/cli exec agentctl trust add \
  --identity "$IDENTITY_ID" --dev-self-issue --json
corepack pnpm --filter @agent-proof/cli exec agentctl trust list --json
```

For a production integration, configure a policy-approved issuer and trust snapshot. The CLI deliberately refuses to self-issue without `--dev-self-issue`.

## 4. Verify real delegation/request evidence

The repository ships a complete positive conformance case containing a root credential, two attenuating delegations, and a signed request. The CLI can create and locally inspect a one-hop development delegation and request after explicit trust is added; the local API can persist a complete valid delegation chain when evidence persistence is configured. Rotation and revocation publication remain explicitly unavailable in the default local profile. Run the core conformance test to verify the shipped evidence:

```sh
corepack pnpm --filter @agent-proof/core test
```

The test loads every `tests/conformance/v1/cases/*.json` fixture, including `positive-two-hop.json`, and compares the full deterministic result with the frozen expected result. Inspect the evidence directly:

```sh
node -e 'const f=require("./tests/conformance/v1/cases/positive-two-hop.json"); console.log({ artifacts: f.artifacts.map(a => ({ kind: a.kind, id: a.id })), expected: f.expected_result })'
```

## 5. Measure the actual operation

```sh
corepack pnpm benchmark
```

This repeats only verified delegated-request verification using `positive-two-hop.json`. It prints measured local results and environment metadata; it does not publish a benchmark number or compare systems.

## Next steps

- Learn the intended [delegation and request lifecycle](delegation-and-requests.md).
- Use the stable [CLI reference](../api/cli.md), [local API reference](../api/local-api.md), and [SDK reference](../api/sdk.md).
- Read the [protocol RFC](../rfcs/0001-tesserra-v1-wire-protocol.md) for normative wire semantics and the [threat model](../security/threat-model.md) before connecting authority to a real tool.
