import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(root, 'src/App.tsx'), 'utf8');
const styles = await readFile(resolve(root, 'src/styles.css'), 'utf8');
const vite = await readFile(resolve(root, 'vite.config.ts'), 'utf8');

describe('documentation website', () => {
  it('includes local-index search, mobile navigation, and copy controls', () => {
    expect(source).toContain('Filters the local page index');
    expect(source).toContain('aria-label="Open documentation navigation"');
    expect(source).toContain('navigator.clipboard.writeText');
    expect(source).toContain('aria-label="On this page"');
  });

  it('uses responsive, reduced-motion, and shared palette semantics', () => {
    expect(styles).toContain('@media (max-width: 760px)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('.drawer');
    expect(styles).toContain('--charcoal: #10110f;');
    expect(styles).toContain('--paper: #f3f0e8;');
    expect(styles).toContain('--moss: #3f594c;');
    expect(styles).toContain('--copper: #b97955;');
    expect(styles).toContain('--clay: #bc7169;');
  });

  it('allows only an exact configured Vite preview host', () => {
    expect(vite).toContain("loadEnv(mode, process.cwd(), '')");
    expect(vite).toContain('env.VITE_PREVIEW_HOST');
    expect(vite).toContain('allowedHosts');
    expect(vite).not.toContain('allowedHosts: true');
  });
});
