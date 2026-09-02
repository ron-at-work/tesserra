export type DocumentStatus = 'Implemented' | 'Partial' | 'Planned' | 'Draft';

export interface DocumentPage {
  readonly id: string;
  readonly group: string;
  readonly title: string;
  readonly eyebrow: string;
  readonly summary: string;
  readonly status: DocumentStatus;
  readonly source: string;
  readonly searchable: string;
  readonly sections: readonly DocumentSection[];
}

export interface DocumentSection {
  readonly title: string;
  readonly body: readonly string[];
  readonly code?: string;
  readonly table?: {
    readonly headings: readonly string[];
    readonly rows: readonly (readonly string[])[];
  };
}

export const quickStart = `git clone https://github.com/ron-at-work/app.git
cd app
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm --filter @agent-proof/core test`;

export const pages: readonly DocumentPage[] = [
  {
    id: 'overview',
    group: 'Start',
    title: 'Documentation overview',
    eyebrow: 'Agent Proof Protocol',
    summary:
      'A curated guide to current source capabilities, protocol evidence, and explicit release boundaries.',
    status: 'Partial',
    source: 'docs/README.md',
    searchable: 'start overview quick start core concepts documentation status normative protocol',
    sections: [
      {
        title: 'Read this site with the source',
        body: [
          'This documentation site is a static local index over repository documentation. Search filters this page index in the browser; it does not query a backend or claim complete repository search. The repository is source-available, with no published package distribution or supported production release.',
          'The protocol RFC, security model, schemas, and conformance fixtures define normative evidence. Guides describe current behavior and identify unavailable or future surfaces.'
        ]
      },
      {
        title: 'Status terms',
        body: [
          'Status is intentionally specific so a reference does not imply a released operational surface.'
        ],
        table: {
          headings: ['Term', 'Meaning'],
          rows: [
            ['Implemented', 'Current source and repository tests back the named capability.'],
            [
              'Partial',
              'A bounded implementation or evidence exists, but the phase gate or complete public workflow does not.'
            ],
            ['Planned', 'A future phase only; do not depend on it.'],
            ['Draft', 'Requires the review or acceptance named in its source document.']
          ]
        }
      }
    ]
  },
  {
    id: 'quick-start',
    group: 'Start',
    title: 'Quick start',
    eyebrow: 'Guide',
    summary:
      'Create isolated fixture identity and trust state, then verify the shipped deterministic delegation and request evidence.',
    status: 'Implemented',
    source: 'docs/guides/quick-start.md',
    searchable: 'quick start install build identity trust verification conformance offline cli',
    sections: [
      {
        title: 'Install and build',
        body: [
          'The local workflow uses the repository’s pinned Node and pnpm setup. Verification does not need a network call after installation.'
        ],
        code: quickStart
      },
      {
        title: 'What this demonstrates',
        body: [
          'The shipped conformance cases include a positive two-hop request. The verifier compares its full deterministic result with the frozen expected result.',
          'Fixture self-issuance is deliberately not trust. A production integration must configure an approved issuer and pinned trust snapshot.'
        ]
      }
    ]
  },
  {
    id: 'rfc-0001',
    group: 'Protocol',
    title: 'RFC 0001: Agent Proof Protocol v1',
    eyebrow: 'RFC 0001 · Protocol',
    summary:
      'Normative project objects and deterministic processing for identity, delegation, signed requests, trust, status, and provenance.',
    status: 'Partial',
    source: 'docs/rfcs/0001-tesserra-v1-wire-protocol.md',
    searchable:
      'rfc 0001 protocol wire bytes canonical json jcs ed25519 identity delegation trust status provenance verifier',
    sections: [
      {
        title: 'Dependencies, scope, and labels',
        body: [
          'Capitalized requirements use RFC 2119/8174. The profile depends on JSON, I-JSON, JCS, base64url, SHA-256, Ed25519, OKP JWK, RFC 3339 timestamps, and UUIDv7.',
          'TESSERRA is a replaceable display name and MUST NOT occur in signed or wire values. This is a project-defined profile, not an Internet standard or replacement for SPIFFE/SPIRE, OAuth/OIDC, MCP, A2A, PKI, an authorization server, or a policy engine.'
        ]
      },
      {
        title: 'Bytes, parsing, and proof',
        body: [
          'Receivers decode one BOM-free UTF-8 JSON value and reject malformed or ambiguous input. Ordinary JSON serialization and Unicode or URI normalization are forbidden.'
        ],
        code: `# Exact ASCII prefix, NUL, and JCS
key ID:      AGENT-PROOF-KEY-ID-V1\\0 || JCS(jwk)
artifact ID: AGENT-PROOF-ARTIFACT-ID-V1\\0 || JCS(content)
proof:       AGENT-PROOF-SIGN-V1\\0 || kind || \\0 || JCS(semantic)`
      },
      {
        title: 'Identity, constraints, and selectors',
        body: [
          'Every artifact is agent-proof/v1; unknown semantics fail closed. Principal types remain distinct, and action, audience, resource, and task matching is exact.',
          'Omission grants no authority. Globs, regexes, wildcards, deny rules, and policy languages are deferred from the mechanically decidable MVP selector semantics.'
        ]
      },
      {
        title: 'Trust, status, and provenance',
        body: [
          'A TrustSnapshot is authenticated local policy, never trust on first use. Signature validity alone does not establish authority.',
          'Provenance records evidence and immutable subject digests; it does not make a mutable name, URL, or graph edge an authorization decision.'
        ]
      },
      {
        title: 'Ordered verification',
        body: [
          'Implementations use one frozen pipeline and stable primary and secondary decision codes.'
        ],
        code: 'PARSE → VERSION → CRYPTO → TIME → TRUST → CHAIN → STATUS → BINDING → REPLAY'
      }
    ]
  },
  {
    id: 'wire-schemas',
    group: 'Protocol',
    title: 'Wire schemas',
    eyebrow: 'Protocol artifacts',
    summary:
      'JSON schemas for protocol artifacts, case envelopes, trust snapshots, and verification results.',
    status: 'Partial',
    source: 'docs/protocol/',
    searchable: 'wire schema json artifact case envelope common trust snapshot verification',
    sections: [
      {
        title: 'Versioned artifacts',
        body: [
          'Schemas are versioned protocol artifacts. They constrain document structure; the RFC remains the normative source for canonical bytes, semantic checks, and ordered decisions.',
          'The current schema set includes artifact, case-envelope, common, trust-snapshot, and verification schemas.'
        ]
      }
    ]
  },
  {
    id: 'security-model',
    group: 'Protocol',
    title: 'Threat model',
    eyebrow: 'Security evidence',
    summary:
      'Assets, trust boundaries, attacker capabilities, mitigations, non-guarantees, and planned tests for the MVP profile.',
    status: 'Draft',
    source: 'docs/security/threat-model.md',
    searchable:
      'security threat model trust boundaries replay revocation privacy canonicalization parser threats',
    sections: [
      {
        title: 'What a valid proof does not prove',
        body: [
          'A valid signature shows that the holder of a resolved private key signed prescribed bytes. It does not, alone, prove trust, honesty, authorization, an uncompromised runtime, freshness, or that an asserted action happened.',
          'The model explicitly covers parser and canonicalization differentials, algorithm/key confusion, chain splicing, nonce races, status rollback, clock manipulation, adapter stripping, denial of service, and privacy/linkability.'
        ]
      },
      {
        title: 'Deployment boundaries',
        body: [
          'Offline verification cannot establish globally current revocation or globally one-time replay prevention. External identity, authorization, workload, transport, and policy systems retain their own semantics.'
        ]
      }
    ]
  },
  {
    id: 'delegation-guide',
    group: 'Build',
    title: 'Delegation and requests',
    eyebrow: 'Guide',
    summary:
      'How exact authority attenuation and request context binding work in the current protocol profile.',
    status: 'Partial',
    source: 'docs/guides/delegation-and-requests.md',
    searchable:
      'delegation signed request attenuation capabilities resource task audience request binding',
    sections: [
      {
        title: 'Attenuation is a verifier property',
        body: [
          'A child delegation must be a strict subset of its parent and root authority ceiling across capability, resource, task, audience, validity, and remaining depth.',
          'The verifier rejects expansion, cycles, duplicate IDs, ambiguous or missing parents, mixed trust roots, and invalid intermediates.'
        ]
      }
    ]
  },
  {
    id: 'cli',
    group: 'Build',
    title: 'CLI reference',
    eyebrow: 'CLI · agentctl',
    summary:
      'Stable local commands for identity, explicit trust, inspection, and deterministic verification.',
    status: 'Implemented',
    source: 'docs/api/cli.md',
    searchable: 'cli agentctl identity trust delegate request revoke provenance command local',
    sections: [
      {
        title: 'Shipped command surface',
        body: [
          'The configurable fallback command name is agentctl. It never prints passphrases or private-key material. Use --json for machine output.'
        ],
        code: `agentctl init [--product-name <name>]
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
agentctl provenance export [--id <artifact-id>] --output <file>`
      },
      {
        title: 'Unavailable lifecycle operations',
        body: [
          'Rotation and revocation command names return stable actionable failures in the default local profile rather than creating partial state. An identity issuer is never treated as a status publisher.'
        ]
      }
    ]
  },
  {
    id: 'sdk',
    group: 'Build',
    title: 'SDK reference',
    eyebrow: 'TypeScript SDK',
    summary:
      'Deterministic offline verification and typed local API boundary for TypeScript consumers.',
    status: 'Implemented',
    source: 'docs/api/sdk.md',
    searchable: 'sdk typescript verify identity request delegation local api client offline',
    sections: [
      {
        title: 'Offline verification',
        body: [
          'The SDK exposes deterministic verification and requires complete artifacts, a pinned trust snapshot, and expected context. A success is evidence passed under supplied policy, not a universal assertion about signer or execution trustworthiness.'
        ],
        code: `import { verifyIdentity, verifyRequest } from '@agent-proof/sdk';

const identityResult = verifyIdentity({ credential, trustSnapshot });
const requestResult = verifyRequest({ artifacts, trustSnapshot, context, replayMode: 'offline' });`
      }
    ]
  },
  {
    id: 'local-api',
    group: 'Build',
    title: 'Local API',
    eyebrow: 'Reference',
    summary: 'Loopback-first local API availability and typed transport contracts.',
    status: 'Implemented',
    source: 'docs/api/local-api.md',
    searchable: 'api local loopback http typed routes service',
    sections: [
      {
        title: 'Local-first boundary',
        body: [
          'The local API documents served routes and typed error behavior. Remote exposure, lifecycle management, and incomplete surfaces are not implied by the local client boundary.'
        ]
      }
    ]
  },
  {
    id: 'mcp',
    group: 'Build',
    title: 'MCP adapter',
    eyebrow: 'Adapter boundary',
    summary:
      'Optional project-defined proof metadata that binds verified evidence to parsed tool calls without replacing MCP authorization.',
    status: 'Partial',
    source: 'docs/adapters/mcp.md',
    searchable: 'mcp adapter tool call metadata oauth proof carrier authorization',
    sections: [
      {
        title: 'Preserve protocol ownership',
        body: [
          'Complete normal MCP and OAuth authorization first. The adapter then derives exact local bindings and verifies the optional project proof if endpoint policy requires it.',
          'It does not replace OAuth access tokens, discover trust from MCP metadata, or claim arbitrary client or transport compatibility.'
        ]
      }
    ]
  },
  {
    id: 'spiffe',
    group: 'Build',
    title: 'SPIFFE / SPIRE adapter',
    eyebrow: 'Adapter boundary',
    summary:
      'Workload identity mapping that consumes validated SVID material without collapsing workload and logical-agent identities.',
    status: 'Partial',
    source: 'docs/adapters/spiffe.md',
    searchable: 'spiffe spire workload api svid identity provider trust provider runtime',
    sections: [
      {
        title: 'Runtime evidence is not delegation',
        body: [
          'The adapter selects configured, trusted X.509-SVID material for channel identity and returns a workload principal plus runtime observation.',
          'It does not implement Workload API, validation, bundle distribution, node attestation, federation, or map a SPIFFE ID to logical agent authority, task, or delegation.'
        ]
      }
    ]
  },
  {
    id: 'a2a',
    group: 'Build',
    title: 'A2A adapter',
    eyebrow: 'Adapter boundary',
    summary:
      'A negotiated extension helper that carries project proof separately from HTTP, OAuth, mTLS, and A2A task semantics.',
    status: 'Partial',
    source: 'docs/adapters/a2a.md',
    searchable: 'a2a adapter extension negotiation task proof carrier oauth mtls',
    sections: [
      {
        title: 'Explicit negotiation',
        body: [
          'A sender emits the project proof only after a peer explicitly negotiates the extension. Receivers recompute exact parsed-message and task bindings before verification.',
          'Unsupported peers have an explicit outcome; ordinary A2A task success is not treated as verified evidence.'
        ]
      }
    ]
  },
  {
    id: 'roadmap',
    group: 'Project',
    title: 'Roadmap and implementation status',
    eyebrow: 'Project',
    summary:
      'Current phase-by-phase implementation state, with clear boundaries between code, fixtures, and future operational gates.',
    status: 'Partial',
    source: 'docs/guides/roadmap.md',
    searchable:
      'roadmap phases implementation status identity delegation requests revocation provenance dashboard landing',
    sections: [
      {
        title: 'Current status',
        body: [
          'Phase 1 is implemented. Phases 2 through 10, including the Phase 9 local operations dashboard, remain partial and retain their documented gates.',
          'Status describes this repository branch, not standards endorsement or a release-date commitment.'
        ]
      },
      {
        title: 'Read partial precisely',
        body: [
          'Partial means code or fixtures exist but the listed phase gate is incomplete. Do not infer a production-ready workflow from it.'
        ]
      }
    ]
  },
  {
    id: 'architecture',
    group: 'Project',
    title: 'Architecture',
    eyebrow: 'Project architecture',
    summary:
      'Repository, data, public-surface, quality, and release boundaries for the reference implementation.',
    status: 'Partial',
    source: 'docs/architecture/',
    searchable: 'architecture repository data public surfaces quality release packages boundaries',
    sections: [
      {
        title: 'Explicit boundaries',
        body: [
          'Adapters and transports call the same core verifier; web applications do not host crypto or storage internals. The architecture records package and operational boundaries rather than collapsing protocol roles.'
        ]
      }
    ]
  },
  {
    id: 'standards',
    group: 'Project',
    title: 'Standards and mappings',
    eyebrow: 'Research evidence',
    summary:
      'Dated capability matrix, source pins, and adapter boundaries for related standards and projects.',
    status: 'Partial',
    source: 'docs/standards/',
    searchable: 'standards capability matrix oauth oidc mcp spiffe a2a source register mapping',
    sections: [
      {
        title: 'Use and non-use',
        body: [
          'The research register distinguishes reuse, mapping, avoided reimplementation, and project-defined gaps. A draft is not called a standard, and adapter boundaries do not claim replacement or endorsement.'
        ]
      }
    ]
  },
  {
    id: 'decisions',
    group: 'Project',
    title: 'Architecture decisions',
    eyebrow: 'ADRs',
    summary:
      'Accepted implementation and protocol choices, including runtime, canonicalization, storage, surfaces, and the documentation gate.',
    status: 'Partial',
    source: 'docs/decisions/',
    searchable:
      'decisions adr runtime canonicalization storage sqlite api cli sdk web testing release',
    sections: [
      {
        title: 'Decision record index',
        body: [
          'The decision set freezes the relevant architecture choices at their approved scope and records why each choice was made. Wire semantics remain governed by the RFC and amendment process.'
        ]
      }
    ]
  }
];

export const navigation = ['Start', 'Protocol', 'Build', 'Project'] as const;
