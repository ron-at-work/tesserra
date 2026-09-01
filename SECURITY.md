# Security policy

## Project status and supported source

ATTEST is an unreleased reference implementation. The repository has no published package distribution or supported production release. Security fixes are made against the current default branch; use a pinned commit when evaluating source and do not rely on unreleased code for production security decisions.

The [release guide](docs/release.md) describes controls required before a release candidate can be published. A GitHub release workflow or changelog entry is not a claim that a release is available or supported.

## Report a vulnerability

Please do not open a public issue for a suspected vulnerability. Use the repository's private security-advisory reporting channel:

1. Open the repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Include the affected commit, reproduction steps, impact, and any proposed mitigation.

If private reporting is unavailable, contact the repository maintainer through the owner profile and request a private reporting channel. Do not include credentials, private keys, raw nonces, or sensitive production data in a report.

Maintainers will acknowledge reports, assess impact, coordinate remediation, and discuss disclosure timing through the private channel. This project makes no response-time or bounty commitments.

## In scope

Useful reports include protocol parsing or canonicalization differentials, signature and key handling, trust configuration, delegation attenuation, replay or revocation behavior, local API exposure, dependency supply-chain exposure, and leakage of secrets or private-key material.

ATTEST verifies signed evidence against configured local policy. It does not guarantee signer honesty, safe code, correct execution, an uncompromised runtime, global freshness while offline, or availability. Please include the relevant trust and deployment assumptions when reporting a problem in those areas.
