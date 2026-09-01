# Adapter boundaries

These packages are narrow, project-defined integration bindings. They do not replace their protocol’s identity, authorization, transport, or policy machinery. Every receiving helper invokes the shared deterministic core verifier and reports proof propagation failures separately from the underlying protocol outcome.

| Package                                    | Pinned source baseline                                                            | Boundary                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`@agent-proof/adapter-mcp`](mcp.md)       | MCP core and authorization `2026-07-28`; SDK `@modelcontextprotocol/sdk` `1.30.0` | Optional `_meta` proof binding beside MCP OAuth        |
| [`@agent-proof/adapter-spiffe`](spiffe.md) | SPIFFE `dc4e9d9b4eff8aa181a54cd330ff9f877186060e`; SPIRE `v1.15.3`                | Fixture-friendly Workload API identity/trust mapping   |
| [`@agent-proof/adapter-a2a`](a2a.md)       | A2A `v1.0.1` and `a2a.proto`                                                      | Negotiated extension binding beside A2A authentication |

An adapter is supported only for the package API and versions documented here. It makes no universal client, transport, server, or SPIRE compatibility claim.
