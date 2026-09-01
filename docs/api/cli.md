# `agentctl` CLI

`agentctl` is the configurable fallback command name. It never prints passphrases or private-key material. Use `--json` for machine output; known input or policy errors exit with code `2` and unexpected failures with `1`.

## Shipped commands

```text
agentctl init [--product-name <name>]
agentctl identity create --agent agid:v1:<authority>/<path> --dev-self-issue
  [--expires-in 30d] [--passphrase-file <path>]
agentctl identity inspect --id <credential-id>
agentctl identity rotate --id <credential-id>
agentctl delegate create --identity <credential-id> --delegate agid:v1:<authority>/<path>
  [--capability <action>] [--resource <uri>] [--task <uuidv7>] [--audience <audience>]
agentctl delegate inspect|verify --id <delegation-id>
agentctl request sign --identity <credential-id> --delegation <delegation-id>
  [--action <action>] [--resource <uri>] [--task <uuidv7>] [--audience <audience>]
agentctl request verify --id <request-id>
agentctl revoke --identity <credential-id> --type credential|key|delegation --target <id>
agentctl revoked --target <id>
agentctl trust add --identity <credential-id> --dev-self-issue
agentctl trust list
agentctl provenance inspect [--id <artifact-id>]
agentctl provenance export [--id <artifact-id>] --output <file>
```

Common global options are `--home <directory>` (or `AGENTCTL_HOME`), `--json`, and `--help`. `AGENTCTL_PASSPHRASE` or `--passphrase-file` supplies the local encryption passphrase. Do not put a real passphrase in shell history or committed files.

## Verification and local trust

- `delegate verify` uses core `verifyDelegationChain` and returns a closed protocol decision code. It verifies signed parent-linked delegation evidence without manufacturing a request.
- `request verify` uses the shared core request verifier.
- Fixture issuance requires `--dev-self-issue` and does **not** establish trust. Add the root explicitly with `trust add --dev-self-issue`.
- The local CLI profile is offline-inspection-only. It does not infer issuer or status-publisher trust from locally stored identities, and it reports offline-status warnings when status evidence is absent.

## Explicitly unavailable lifecycle operations

The command names are present so automation receives stable, actionable failures, but these operations do not create partial state in the local profile:

- `identity rotate` returns `LIFECYCLE_UNAVAILABLE` until it can atomically issue a new key-binding credential and preserve key-status history.
- `revoke` returns `STATUS_AUTHORITY_REQUIRED` until a separately configured status authority verifies and publishes the signed status stream. An identity issuer is never treated as a status publisher.

`revoked` only reports persisted local revocation records; in the default profile none can be created through `revoke`.

## Local provenance scope

`provenance inspect` and `provenance export` read or export the local SQLite provenance graph. They do not create provenance evidence, query a remote graph, redact a multi-user view, or make a graph edge an authorization decision.

## Examples

```sh
agentctl --home "$AGENTCTL_HOME" init --json
agentctl --home "$AGENTCTL_HOME" identity create \
  --agent agid:v1:example.test/build-agent --dev-self-issue --json
agentctl --home "$AGENTCTL_HOME" trust add --identity "$IDENTITY_ID" --dev-self-issue --json
agentctl --home "$AGENTCTL_HOME" trust list --json
```

See the [quick start](../guides/quick-start.md) for the local workflow.
