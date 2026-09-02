const localHosts = ['localhost', '127.0.0.1', '::1'] as const;

/** Development host allow-list plus one explicitly configured preview hostname. */
export function allowedDashboardHosts(previewHost?: string): string[] {
  const host = previewHost?.trim();
  if (host === undefined || host === '') return [...localHosts];
  if (host.includes('://') || host.includes('/') || host.includes(':')) {
    throw new Error('VITE_PREVIEW_HOST must be a hostname without a scheme, port, or path.');
  }
  return [...localHosts, host];
}

/** Default API base URL used for local development only. */
export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4318';

/** Keep the reverse-proxy target configurable without exposing it to application code. */
export function localApiProxyTarget(configuredTarget?: string): string {
  return configuredTarget?.trim() || DEFAULT_API_BASE_URL;
}

/**
 * Neutral, non-sensitive label for the configured API base URL. Loopback and
 * relative URLs collapse to a plain "Service" label so no host address is shown.
 */
export function apiDisplayLabel(baseUrl: string): string {
  try {
    const { hostname } = new URL(baseUrl);
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return 'Service';
    }
    return hostname;
  } catch {
    return 'Service';
  }
}
