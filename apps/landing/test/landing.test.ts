import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(root, 'src/main.tsx'), 'utf8');
const styles = await readFile(resolve(root, 'src/styles.css'), 'utf8');
const vite = await readFile(resolve(root, 'vite.config.ts'), 'utf8');

describe('public landing page', () => {
  it('sources display configuration instead of hard-coding product links', () => {
    expect(source).toContain("import { productConfig } from './product'");
    expect(source).toContain('productConfig.displayName');
    expect(source).toContain('productConfig.links.repository');
    expect(source).toContain('productConfig.links.documentation');
  });

  it('includes accessible interactive details and copy controls', () => {
    expect(source).toContain('aria-label="Interactive provenance chain from human to resource"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-expanded={menuOpen}');
    expect(source).toContain('navigator.clipboard.writeText');
    expect(source).toContain('aria-label={`Copy ${label}`}');
  });

  it('has touch and reduced-motion accommodations', () => {
    expect(styles).toContain('@media (max-width: 620px)');
    expect(styles).toMatch(/\.detail-card\s*\{\s*top:\s*395px;\s*right:\s*20px;\s*left:\s*20px;/);
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toMatch(
      /\.reveal,\s*\.terminal pre\s*\{\s*opacity:\s*1;\s*transform:\s*none;\s*transition:\s*none;\s*\}/
    );
  });

  it('uses the shared accessible editorial palette and a readable compact type floor', () => {
    expect(styles).toContain('--ink: #10110f;');
    expect(styles).toContain('--paper: #e9e5dc;');
    expect(styles).toContain('--moss: #83a58b;');
    expect(styles).toContain('--copper: #b97955;');
    expect(styles).toContain('--clay: #bc7169;');
    expect(styles).toContain('--quiet: #8a8d85;');
    expect(styles).not.toMatch(/font:\s*(?:\d+\s+)?(?:8|9|10)px|font-size:\s*(?:8|9|10)px/);
  });

  it('allows only an exact env-supplied Vite preview host', () => {
    expect(vite).toContain("loadEnv(mode, process.cwd(), '')");
    expect(vite).toContain('env.VITE_PREVIEW_HOST');
    expect(vite).toContain('allowedHosts,');
    expect(vite).not.toContain('allowedHosts: true');
    expect(vite).toContain("fs: { allow: ['.'] }");
  });
});
