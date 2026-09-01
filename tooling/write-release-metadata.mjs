import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const root = process.cwd();
const output = resolve(root, process.argv[2] ?? 'release');
mkdirSync(output, { recursive: true });

function manifestComponents(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifest = resolve(root, directory, entry.name, 'package.json');
      try {
        const value = JSON.parse(readFileSync(manifest, 'utf8'));
        return [
          {
            type: 'library',
            name: value.name,
            version: value.version,
            properties: [
              { name: 'agent-proof:workspace-path', value: `${directory}/${entry.name}` }
            ]
          }
        ];
      } catch {
        return [];
      }
    });
}

const generatedAt = new Date().toISOString();
const subject = {
  name: 'agent-proof-workspace',
  version: process.env.GITHUB_REF_NAME ?? 'unreleased',
  commit: process.env.GITHUB_SHA ?? 'working-tree'
};
const components = [...manifestComponents('packages'), ...manifestComponents('apps')];

writeFileSync(
  resolve(output, 'sbom.cdx.json'),
  `${JSON.stringify(
    {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      serialNumber: `urn:uuid:${randomUUID()}`,
      version: 1,
      metadata: { timestamp: generatedAt, component: { type: 'application', ...subject } },
      components
    },
    null,
    2
  )}\n`
);
writeFileSync(
  resolve(output, 'provenance.intoto.jsonl'),
  `${JSON.stringify({
    _type: 'https://in-toto.io/Statement/v1',
    subject: [],
    predicateType: 'https://slsa.dev/provenance/v1',
    predicate: {
      buildDefinition: {
        buildType: 'https://github.com/ron-at-work/app/.github/workflows/release.yml',
        externalParameters: subject,
        internalParameters: {},
        resolvedDependencies: []
      },
      runDetails: {
        builder: { id: 'https://github.com/actions' },
        metadata: { invocationId: process.env.GITHUB_RUN_ID ?? 'local' }
      }
    }
  })}\n`
);
