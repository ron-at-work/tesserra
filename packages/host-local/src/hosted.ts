import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createConcreteLocalHost } from './index.js';

/**
 * Hosted entrypoint for public deployment (Render, Railway, etc.).
 *
 * When SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are both set, the server binds
 * 0.0.0.0 and requires a valid Supabase access token on every request. When they
 * are absent, it falls back to the loopback-only trust model so local dev is safe.
 */
async function main(): Promise<void> {
  const dataDir = process.env['DATA_DIR'] ?? '.data';
  const port = Number(process.env['PORT'] ?? '8080');
  const supabaseUrl = process.env['SUPABASE_URL'];
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  const keyPassphrase = process.env['KEY_PASSPHRASE'];

  if (keyPassphrase === undefined || keyPassphrase.length === 0)
    throw new Error('KEY_PASSPHRASE environment variable is required to protect signing keys.');

  const authEnabled = supabaseUrl !== undefined && serviceRoleKey !== undefined;
  const auth = authEnabled ? { supabaseUrl: supabaseUrl, serviceRoleKey } : undefined;
  const bindHost = authEnabled ? '0.0.0.0' : '127.0.0.1';

  await mkdir(dataDir, { recursive: true });

  const host = await createConcreteLocalHost({
    keyDirectory: join(dataDir, 'keys'),
    keyPassphrase: new TextEncoder().encode(keyPassphrase),
    storagePath: join(dataDir, 'state.sqlite'),
    host: bindHost,
    port,
    ...(auth === undefined ? {} : { auth })
  });

  await host.start();
  console.log(
    `Hosted API server listening on ${bindHost}:${port}` +
      (authEnabled ? ' (Supabase auth enabled)' : ' (loopback only, no auth)')
  );

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await host.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
