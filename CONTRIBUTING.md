# Contributing

Thank you for helping improve this reference implementation.

## Before you start

- Read the protocol RFC, architecture decisions, threat model, and requirements traceability in [`docs/`](docs/).
- Keep implementation work within the approved phase. Protocol semantics, canonical bytes, trust semantics, and decision precedence require an RFC amendment and corresponding conformance evidence.
- Keep the display name configurable through [`config/product.json`](config/product.json). Do not introduce it into wire identifiers, package namespaces, or domain types.
- Do not commit credentials, private keys, production artifacts, or sensitive fixture data.

## Development setup

This workspace requires the exact Node and pnpm versions declared in [`.node-version`](.node-version) and [`package.json`](package.json).

```sh
corepack pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Use `pnpm format` before submitting a change. `pnpm benchmark` intentionally fails until a capability has a measured benchmark and the required methodology metadata.

## Change expectations

1. Make focused changes with tests and conformance fixtures where behavior changes.
2. Preserve native ESM and strict TypeScript. Package source imports across boundaries are forbidden; use declared workspace dependencies and package exports.
3. Run the quality commands above from a clean install.
4. Explain security, compatibility, and documentation effects in the pull request.
5. Update relevant docs, threat controls, and traceability whenever a protocol or security behavior changes.

## Pull requests

Use clear, focused commits and pull requests. Maintainers may request independent reproduction evidence for canonicalization, cryptography, or verifier behavior. By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
