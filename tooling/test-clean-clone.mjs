import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const clone = mkdtempSync(join(tmpdir(), 'agent-proof-clean-clone-'));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: clone, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  cpSync(root, clone, {
    recursive: true,
    filter(source) {
      return !/(^|\/)(\.git|node_modules|dist|coverage|\.pnpm-store)(\/|$)|\.tsbuildinfo$/.test(
        source
      );
    }
  });

  run('node', ['tooling/verify-runtime.mjs']);
  run('corepack', ['pnpm', 'install', '--frozen-lockfile']);
  run('corepack', ['pnpm', 'lint']);
  run('corepack', ['pnpm', 'build']);
  run('corepack', ['pnpm', 'typecheck']);
  run('corepack', ['pnpm', 'test']);
} finally {
  rmSync(clone, { recursive: true, force: true });
}
