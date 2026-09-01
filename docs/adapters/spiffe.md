# SPIFFE/SPIRE adapter

**Pinned baseline:** SPIFFE specifications at `dc4e9d9b4eff8aa181a54cd330ff9f877186060e`; SPIRE `v1.15.3`. See S-01 through S-06 in the [source register](../standards/source-register.md#source-register).

`@agent-proof/adapter-spiffe` exposes fixture-friendly `WorkloadApiClient`, `IdentityProvider`, and `TrustProvider` interfaces. A deployment connects these to a SPIFFE Workload API client that has already performed the native SVID/bundle validation. The adapter does not implement Workload API, X.509 validation, JWT verification, bundle distribution, workload/node attestation, SPIRE registration, or federation.

`createSpiffeIdentityProvider` selects a configured, trusted **X.509-SVID** for channel identity. `jwtWorkloadIdentity` is explicit and requires a nonempty audience. Both return a `workload` principal plus a serializable runtime observation. Neither maps a SPIFFE ID to an Agent Proof logical agent, human/service authority, OAuth client, task, delegation, or authorization grant. SVID rotation changes runtime-evidence freshness only; it does not alter Agent Proof chains.

Tests use only in-memory fixtures, so no live SPIRE service is required or implied. A real SPIRE compatibility claim requires a hermetic version-pinned fixture and deployment validation.
