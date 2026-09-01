import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { allowedDashboardHosts, localApiProxyTarget } from './src/devConfig.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const allowedHosts = allowedDashboardHosts(env.VITE_PREVIEW_HOST);
  const apiTarget = localApiProxyTarget(env.VITE_LOCAL_API_URL);

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      allowedHosts,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    // `0.0.0.0` is limited to the development server used by the local preview.
    preview: { allowedHosts },
    test: { environment: 'jsdom', setupFiles: ['./test/setup.ts'], globals: true }
  };
});
