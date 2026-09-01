# API and SDK reference

The product has three intentionally separate developer surfaces:

- [CLI](cli.md): local operator interface and structured automation output.
- [Local API](local-api.md): typed loopback HTTP contract consumed through the client package.
- [SDK](sdk.md): deterministic offline identity verification and the typed local API client.

Current availability is explicitly marked in each reference: **Implemented** is backed by current source and repository tests; **Partial** is a bounded surface or evidence whose phase gate is incomplete; **Planned** has no supported public release. Planned delegation, request, lifecycle, and provenance endpoints are not a compatibility commitment until their implementation phase ships.

For runnable evidence, see the [examples index](../../examples/README.md) and [delegated request verification](../../examples/delegated-request/README.md). For source status and release posture, see the [roadmap](../guides/roadmap.md) and [release guide](../release.md).
