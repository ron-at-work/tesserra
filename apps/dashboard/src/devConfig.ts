const localHosts = ['localhost', '127.0.0.1', '::1'] as const;

/** Accept loopback plus one explicitly configured preview hostname. */
export function allowedDashboardHosts(previewHost?: string): string[] {
  const host = previewHost?.trim();
  if (host === undefined || host === '') return [...localHosts];
  if (host.includes('://') || host.includes('/') || host.includes(':')) {
    throw new Error('VITE_PREVIEW_HOST must be a hostname without a scheme, port, or path.');
  }
  return [...localHosts, host];
}

/** Keep the reverse-proxy target configurable without exposing it to application code. */
export function localApiProxyTarget(configuredTarget?: string): string {
  return configuredTarget?.trim() || 'http://127.0.0.1:4318';
}
