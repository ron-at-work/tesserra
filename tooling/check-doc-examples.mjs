import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const errors = [];

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const markdown = [
  resolve(root, 'README.md'),
  ...walk(resolve(root, 'docs')),
  ...walk(resolve(root, 'examples'))
].filter((path) => path.endsWith('.md'));

for (const path of markdown) {
  const body = readFileSync(path, 'utf8');
  for (const match of body.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (target === undefined || /^(https?:|mailto:|#)/.test(target)) continue;
    const local = target.split('#', 1)[0];
    if (local.length === 0) continue;
    if (!existsSync(resolve(path, '..', local)))
      errors.push(`${path}: missing linked file ${target}`);
  }
}

const required = [
  'CONTRIBUTING.md',
  'SECURITY.md',
  'LICENSE',
  'docs/README.md',
  'docs/guides/quick-start.md',
  'docs/guides/roadmap.md',
  'docs/api/README.md',
  'docs/api/cli.md',
  'docs/api/local-api.md',
  'docs/api/sdk.md',
  'docs/adapters/README.md',
  'docs/release.md',
  'examples/README.md',
  'examples/delegated-request/README.md',
  'apps/docs/package.json',
  'CHANGELOG.md'
];
for (const file of required)
  if (!existsSync(resolve(root, file))) errors.push(`missing required documentation: ${file}`);

const rfc = resolve(root, 'docs/rfcs/0001-tesserra-v1-wire-protocol.md');
if (existsSync(rfc)) {
  const body = readFileSync(rfc, 'utf8');
  for (const preimage of [
    'AGENT-PROOF-KEY-ID-V1\\0 || JCS(jwk)',
    'AGENT-PROOF-ARTIFACT-ID-V1\\0 || JCS(content)',
    'AGENT-PROOF-POLICY-HASH-V1\\0 || JCS(snapshot without policy_hash)',
    'AGENT-PROOF-STATUS-SNAPSHOT-V1\\0 || JCS(status_members)',
    'AGENT-PROOF-SIGN-V1\\0 || kind || \\0 || JCS(semantic)'
  ]) {
    if (!body.includes(preimage))
      errors.push(`${rfc}: missing exact normative preimage '${preimage}'`);
  }
}

const truthfulness = {
  'README.md': [
    'not a published package distribution or production-ready security service',
    'corepack pnpm --filter @agent-proof/core test',
    'The final command verifies every frozen conformance case',
    'It does **not** prove a signer is honest',
    'Rotation and revocation issuance return explicit fail-closed errors',
    'npm and Yarn cannot install this workspace',
    'corepack pnpm dev:docs',
    '[API index](docs/api/README.md)',
    '[examples](examples/README.md)'
  ],
  'SECURITY.md': [
    'no published package distribution or supported production release',
    'do not rely on unreleased code for production security decisions'
  ],
  'docs/release.md': [
    'no published package distribution or supported production release',
    'do not establish that a tag, package, application artifact, attestation, SBOM, or provenance statement has been published',
    'all three applications (landing, dashboard, and docs site)',
    'Landing, dashboard, and docs site build and deploy independently'
  ],
  'docs/guides/roadmap.md': [
    'No package distribution or supported production release is published',
    'Online exactly-one replay consumption and a complete operator workflow are incomplete',
    'Public landing, docs site, and release completion'
  ],
  'docs/api/README.md': [
    'examples index',
    'delegated request verification',
    '**Implemented** is backed by current source and repository tests'
  ],
  'docs/architecture/repository-architecture.md': [
    '`apps/docs`',
    'Dashboard, landing, and docs site are intentionally separate projects',
    'each builds and deploys independently'
  ],
  'docs/architecture/public-surfaces.md': [
    'Landing, dashboard, and docs site are separate applications',
    'each has an independent build, deployment policy, and test suite',
    'Landing/docs/release'
  ],
  'docs/api/cli.md': [
    'agentctl delegate create',
    'agentctl request sign',
    'agentctl provenance inspect',
    'LIFECYCLE_UNAVAILABLE',
    'STATUS_AUTHORITY_REQUIRED',
    'identity issuer is never treated as a status publisher'
  ],
  'docs/api/local-api.md': [
    '`POST /v1/delegations`',
    '`POST /v1/revocations`',
    '`GET /v1/events`',
    'There is no identity rotation route',
    'no request-signing route',
    'no `/v1/provenance` graph or export route',
    'can be constructed without an evidence store'
  ],
  'docs/guides/delegation-and-requests.md': [
    'agentctl delegate create',
    'agentctl request sign',
    'offline replay mode',
    'LIFECYCLE_UNAVAILABLE',
    'STATUS_AUTHORITY_REQUIRED',
    'no HTTP provenance graph/export route'
  ],
  'docs/requirements-traceability.md': [
    'Local CLI/API/SDK delegation evidence flow',
    'online exactly-one consumption remains incomplete',
    'distinct status authority',
    'Local SQLite provenance graph inspection/export'
  ]
};
for (const [file, assertions] of Object.entries(truthfulness)) {
  const path = resolve(root, file);
  if (!existsSync(path)) {
    errors.push(`missing truthfulness documentation: ${file}`);
    continue;
  }
  const body = readFileSync(path, 'utf8');
  for (const assertion of assertions)
    if (!body.includes(assertion))
      errors.push(`${path}: missing truthfulness assertion '${assertion}'`);
}

const landingVite = resolve(root, 'apps/landing/vite.config.ts');
if (existsSync(landingVite)) {
  const body = readFileSync(landingVite, 'utf8');
  for (const assertion of [
    "loadEnv(mode, process.cwd(), '')",
    'env.VITE_PREVIEW_HOST',
    'allowedHosts,',
    "fs: { allow: ['.'] }"
  ]) {
    if (!body.includes(assertion))
      errors.push(`${landingVite}: missing preview-hardening assertion '${assertion}'`);
  }
  if (body.includes('allowedHosts: true'))
    errors.push(`${landingVite}: must not allow every Vite host`);
}

const exampleReadme = resolve(root, 'examples/delegated-request/README.md');
if (existsSync(exampleReadme)) {
  const body = readFileSync(exampleReadme, 'utf8');
  for (const command of ['pnpm build', 'pnpm --filter @agent-proof/core test', 'pnpm benchmark']) {
    if (!body.includes(command))
      errors.push(`${exampleReadme}: expected checked command '${command}'`);
  }
}

if (errors.length > 0) {
  console.error('Documentation and example check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Documentation and example check passed for ${markdown.length} Markdown file(s).`);
}
