import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function previewHost(value: string | undefined): string[] {
  if (value === undefined || value.trim().length === 0) return [];
  const host = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    throw new Error(
      'VITE_PREVIEW_HOST must be one exact hostname without a scheme, port, or path.'
    );
  }
  return [host];
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const allowedHosts = previewHost(env.VITE_PREVIEW_HOST);

  return {
    plugins: [react()],
    server: { host: '0.0.0.0', allowedHosts, fs: { allow: ['.'] } },
    preview: { host: '0.0.0.0', allowedHosts },
    test: { environment: 'jsdom', setupFiles: ['./test/setup.ts'], globals: true }
  };
});
