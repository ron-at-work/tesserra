import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const app = process.argv[2];
if (app !== 'landing' && app !== 'dashboard')
  throw new Error('Expected app name: landing or dashboard.');

const result = spawnSync(
  'corepack',
  ['pnpm', '--dir', resolve(process.cwd(), 'apps', app), 'run', 'dev'],
  {
    stdio: 'inherit'
  }
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
