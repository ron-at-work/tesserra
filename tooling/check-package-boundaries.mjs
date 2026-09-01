import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const packageRoot = resolve(root, 'packages');
const appRoot = resolve(root, 'apps');
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
const expectedApps = ['dashboard', 'landing'];

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
  [
    'cli',
    new Set([
      'protocol',
      'core',
      'crypto-local',
      'storage-sqlite',
      'sdk',
      'api-contract',
      'api-client'
    ])
  ],
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
const allowedAppDependencies = new Map([
  ['dashboard', new Set(['api-client', 'api-contract', 'protocol'])],
  ['landing', new Set()]
]);

function workspaceNames(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(resolve(directory, entry.name, 'package.json')))
    .map((entry) => entry.name)
    .sort();
}

function readManifest(directory, name) {
  return JSON.parse(readFileSync(resolve(directory, name, 'package.json'), 'utf8'));
}

function dependencies(manifest) {
  return Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies
  });
}

function workspaceDependencies(manifest) {
  return dependencies(manifest)
    .filter(([, version]) => typeof version === 'string' && version.startsWith('workspace:'))
    .map(([name]) => name);
}

function checkPackage(packageName, errors) {
  const manifest = readManifest(packageRoot, packageName);
  if (manifest.type !== 'module')
    errors.push(`packages/${packageName}: package.json must set "type": "module"`);
  if (typeof manifest.scripts?.typecheck !== 'string')
    errors.push(`packages/${packageName}: package.json must define a real typecheck script`);
  if (typeof manifest.scripts?.test !== 'string')
    errors.push(`packages/${packageName}: package.json must define a test script`);
  if (typeof manifest.exports !== 'object' || manifest.exports === null)
    errors.push(`packages/${packageName}: package.json must define explicit ESM exports`);

  const allowed = allowedDependencies.get(packageName);
  for (const dependency of workspaceDependencies(manifest)) {
    const name = dependency.startsWith('@agent-proof/')
      ? dependency.slice('@agent-proof/'.length)
      : dependency;
    if (expectedPackages.includes(name) && !allowed?.has(name))
      errors.push(`packages/${packageName}: forbidden workspace dependency ${dependency}`);
  }
}

function checkApp(appName, errors) {
  const manifest = readManifest(appRoot, appName);
  if (manifest.type !== 'module')
    errors.push(`apps/${appName}: package.json must set "type": "module"`);
  for (const script of ['build', 'typecheck', 'test']) {
    if (typeof manifest.scripts?.[script] !== 'string')
      errors.push(`apps/${appName}: package.json must define a ${script} script`);
  }
  for (const [dependency, version] of dependencies(manifest)) {
    if (typeof version === 'string' && version === 'latest')
      errors.push(
        `apps/${appName}: dependency ${dependency} must be pinned through the workspace catalog`
      );
  }
  const allowed = allowedAppDependencies.get(appName);
  for (const dependency of workspaceDependencies(manifest)) {
    const name = dependency.startsWith('@agent-proof/')
      ? dependency.slice('@agent-proof/'.length)
      : dependency;
    if (!allowed?.has(name))
      errors.push(`apps/${appName}: forbidden workspace dependency ${dependency}`);
  }
}

const packages = workspaceNames(packageRoot);
const apps = workspaceNames(appRoot);
const errors = [];

for (const appName of apps) {
  const directory = resolve(appRoot, appName);
  for (const forbidden of ['package-lock.json', 'pnpm-lock.yaml']) {
    if (existsSync(resolve(directory, forbidden)))
      errors.push(`apps/${appName}: nested ${forbidden} is forbidden; use the root pnpm lockfile`);
  }
  const buildInfo = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsbuildinfo'))
    .map((entry) => entry.name);
  for (const file of buildInfo)
    errors.push(`apps/${appName}: generated ${file} must not be committed or retained`);
}

for (const packageName of packages) {
  if (!expectedPackages.includes(packageName))
    errors.push(`packages/${packageName}: unknown package directory`);
  else checkPackage(packageName, errors);
}
for (const appName of apps) {
  if (!expectedApps.includes(appName))
    errors.push(`apps/${appName}: unknown application directory`);
  else checkApp(appName, errors);
}
for (const expected of expectedPackages) {
  if (!packages.includes(expected))
    errors.push(`packages/${expected}: expected workspace package is missing`);
}
for (const expected of expectedApps) {
  if (!apps.includes(expected)) errors.push(`apps/${expected}: expected application is missing`);
}

if (errors.length > 0) {
  console.error('Package-boundary check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(
  `Package-boundary check passed for ${packages.length} package(s) and ${apps.length} app(s).`
);

const result = spawnSync(
  resolve(root, 'node_modules', '.bin', 'depcruise'),
  [
    '--config',
    'tooling/.dependency-cruiser.cjs',
    '--output-type',
    'err',
    ...packages.map((packageName) => `packages/${packageName}/src`),
    ...apps.map((appName) => `apps/${appName}/src`)
  ],
  { cwd: root, stdio: 'inherit' }
);
if (result.error) {
  console.error(`Could not run dependency-cruiser: ${result.error.message}`);
  process.exitCode = 1;
} else if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
