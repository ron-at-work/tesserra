import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allowedDashboardHosts, localApiProxyTarget } from '../src/devConfig';
import { App } from '../src/App';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function response(payload: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 503, json: async () => payload } as Response;
}
const agent = {
  id: 'agent-record',
  createdAt: '2026-09-01T00:00:00Z',
  credential: {
    subject: { id: 'agent:local:builder' },
    credential_purpose: 'agent-root-authority',
    expires_at: '2027-01-01T00:00:00Z',
    key_id: 'kid-local'
  }
};

afterEach(() => cleanup());
beforeEach(() => {
  window.location.hash = '#overview';
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(response(url.endsWith('/v1/agents') ? { items: [] } : { snapshot: {} }))
  );
});

describe('dashboard', () => {
  it('renders truthful empty API states and route navigation', async () => {
    render(<App />);
    expect(await screen.findByText('No operations recorded')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Agents' })[0]!);
    expect(await screen.findByText('No agents yet')).toBeTruthy();
  });

  it('shows an API error rather than fabricated agent data', async () => {
    fetchMock.mockRejectedValue(new TypeError('network error'));
    window.location.hash = '#agents';
    render(<App />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('No agents yet')).toBeNull();
  });

  it('does not infer graph links from returned agent evidence', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(response(url.endsWith('/v1/agents') ? { items: [agent] } : { snapshot: {} }))
    );
    window.location.hash = '#provenance';
    render(<App />);
    expect(await screen.findByText('Graph relationships unavailable')).toBeTruthy();
    expect(screen.getByText('Evidence list')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Select agent/i })).toBeNull();
    expect(document.querySelector('.graph-lines line')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /agent:local:builder/i }));
    expect(screen.getByText('Selected evidence')).toBeTruthy();
  });

  it('allows only loopback and the exact configured preview host', () => {
    expect(allowedDashboardHosts()).toEqual(['localhost', '127.0.0.1', '::1']);
    expect(allowedDashboardHosts('be2xs7pn2dcm.preview.us1.vorflux.com')).toEqual([
      'localhost',
      '127.0.0.1',
      '::1',
      'be2xs7pn2dcm.preview.us1.vorflux.com'
    ]);
    expect(() => allowedDashboardHosts('https://preview.example')).toThrow('hostname');
    expect(localApiProxyTarget()).toBe('http://127.0.0.1:4318');
    expect(localApiProxyTarget('http://api.test:4318')).toBe('http://api.test:4318');
  });
});
