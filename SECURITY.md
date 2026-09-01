# Security policy

## Supported versions

This repository is an unreleased reference implementation. Only the current default branch receives security fixes. Do not rely on unreleased code for production security decisions.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use the repository's private security-advisory reporting channel instead:

1. Open the repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Include affected revision, reproduction steps, impact, and any proposed mitigation.

If private reporting is unavailable, contact the repository maintainers through the repository owner profile and request a private reporting channel. Do not include credentials, private keys, or sensitive production data in a report.

We will acknowledge reports, assess impact, coordinate remediation, and request disclosure timing through the private channel. We do not make response-time or bounty commitments for this unreleased project.

## Scope

Useful reports include protocol parsing/canonicalization issues, signature or key handling, authorization attenuation, replay or revocation behavior, trust configuration, dependency supply-chain exposure, and leakage of secrets or private key material.
