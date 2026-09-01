import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';

afterEach(cleanup);
beforeEach(() => {
  window.location.hash = '#/overview';
});

describe('documentation app rendering', () => {
  it('uses namespaced page routes and ignores section or unknown hashes', () => {
    window.location.hash = '#/rfc-0001';
    render(<App />);
    expect(screen.getByRole('heading', { name: 'RFC 0001: Agent Proof Protocol v1' })).toBeTruthy();
    window.location.hash = '#bytes-parsing-and-proof';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(
      screen.getByRole('link', { name: 'Bytes, parsing, and proof' }).getAttribute('href')
    ).toBe('#bytes-parsing-and-proof');
    expect(screen.getByRole('heading', { name: 'RFC 0001: Agent Proof Protocol v1' })).toBeTruthy();
    window.location.hash = '#unknown-anchor';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByRole('heading', { name: 'RFC 0001: Agent Proof Protocol v1' })).toBeTruthy();
  });

  it('renders a pnpm-only quick start', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'CODE' &&
          element.textContent?.includes('corepack pnpm install --frozen-lockfile') === true
      )
    ).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByText(/^npm$/i)).toBeNull();
  });

  it('traps and restores focus for dialogs', async () => {
    render(<App />);
    const trigger = screen.getByRole('button', { name: 'Search documentation' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Search documentation' });
    const input = within(dialog).getByRole('textbox');
    await waitFor(() => expect(document.activeElement).toBe(input));
    const resultButtons = within(dialog).getAllByRole('button');
    const lastResult = resultButtons[resultButtons.length - 1]!;
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastResult);
    lastResult.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Search documentation' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('announces a copied code block', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy quick start commands' }));
    expect(await screen.findByText('quick start commands copied to clipboard.')).toBeTruthy();
  });
});
