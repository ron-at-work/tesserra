import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const packageRoot = resolve(root, 'packages');
const expectedPackages = [
  'protocol',
  'core',
  'crypto-local',
  'storage-sqlite',
  'service',
  'api-contract',
  'api-client',
  'api-server',
  'sdk',
  'cli',
  'adapter-mcp',
  'adapter-spiffe',
  'adapter-a2a',
  'host-local'
];

const allowedDependencies = new Map([
  ['protocol', new Set()],
  ['core', new Set(['protocol'])],
  ['crypto-local', new Set(['protocol', 'core'])],
  ['storage-sqlite', new Set(['protocol', 'core'])],
  ['service', new Set(['protocol', 'core'])],
  ['api-contract', new Set(['protocol'])],
  ['api-client', new Set(['api-contract', 'protocol'])],
  ['api-server', new Set(['api-contract', 'service', 'protocol'])],
  ['sdk', new Set(['protocol', 'core', 'api-contract', 'api-client'])],
  ['cli', new Set(['protocol', 'core', 'crypto-local', 'sdk', 'api-contract', 'api-client'])],
  ['adapter-mcp', new Set(['protocol', 'core', 'service'])],
  ['adapter-spiffe', new Set(['protocol', 'core', 'service'])],
  ['adapter-a2a', new Set(['protocol', 'core', 'service'])],
  [
    'host-local',
    new Set([
      'service',
      'crypto-local',
      'storage-sqlite',
      'api-server',
      'adapter-mcp',
      'adapter-spiffe',
      'adapter-a2a',
      'protocol'
    ])
  ]
]);

function workspacePackageNames() {
  if (!existsSync(packageRoot)) return [];

  return readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(resolve(packageRoot, entry.name, 'package.json')))
    .map((entry) => entry.name)
    .sort();
}

function readManifest(packageName) {
  const path = resolve(packageRoot, packageName, 'package.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

function workspaceDependencies(manifest) {
  return Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies
  })
    .filter(([, version]) => typeof version === 'string' && version.startsWith('workspace:'))
    .map(([name]) => name);
}

const packages = workspacePackageNames();
const errors = [];

for (const packageName of packages) {
  if (!expectedPackages.includes(packageName)) {
    errors.push(`packages/${packageName}: unknown package directory`);
    continue;
  }

  const manifest = readManifest(packageName);
  if (manifest.type !== 'module') {
    errors.push(`packages/${packageName}: package.json must set "type": "module"`);
  }
  if (typeof manifest.scripts?.typecheck !== 'string') {
    errors.push(`packages/${packageName}: package.json must define a real typecheck script`);
  }
  if (typeof manifest.scripts?.test !== 'string') {
    errors.push(`packages/${packageName}: package.json must define a test script`);
  }
  if (typeof manifest.exports !== 'object' || manifest.exports === null) {
    errors.push(`packages/${packageName}: package.json must define explicit ESM exports`);
  }

  const allowed = allowedDependencies.get(packageName);
  for (const dependency of workspaceDependencies(manifest)) {
    const dependencyName = dependency.startsWith('@agent-proof/')
      ? dependency.slice('@agent-proof/'.length)
      : dependency;
    if (!expectedPackages.includes(dependencyName)) continue;
    if (!allowed?.has(dependencyName)) {
      errors.push(`packages/${packageName}: forbidden workspace dependency ${dependency}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Package-boundary check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    packages.length === 0
      ? 'Package-boundary check passed: no implementation packages are present yet.'
      : `Package-boundary check passed for ${packages.length} package(s).`
  );
}

if (process.exitCode === 1) process.exit();

if (packages.length === 0) process.exit();

const result = spawnSync(
  resolve(root, 'node_modules', '.bin', 'depcruise'),
  [
    '--config',
    'tooling/.dependency-cruiser.cjs',
    '--output-type',
    'err',
    ...packages.map((packageName) => `packages/${packageName}/src`)
  ],
  { cwd: root, stdio: 'inherit' }
);

if (result.error) {
  console.error(`Could not run dependency-cruiser: ${result.error.message}`);
  process.exitCode = 1;
} else if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
