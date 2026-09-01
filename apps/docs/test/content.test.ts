import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pages } from '../src/content';

const root = resolve(import.meta.dirname, '../../..');
const allowedStatuses = new Set(['Implemented', 'Partial', 'Planned', 'Draft']);

describe('documentation content truthfulness', () => {
  it('uses canonical statuses and existing source targets', () => {
    for (const page of pages) {
      expect(allowedStatuses.has(page.status)).toBe(true);
      expect(existsSync(resolve(root, page.source))).toBe(true);
    }
  });

  it('states source-release boundaries and Phase 9 as partial', () => {
    const overview = pages.find((page) => page.id === 'overview')!;
    const roadmap = pages.find((page) => page.id === 'roadmap')!;
    expect(overview.sections.flatMap((section) => section.body).join(' ')).toContain(
      'no published package distribution'
    );
    expect(roadmap.status).toBe('Partial');
    expect(roadmap.sections.flatMap((section) => section.body).join(' ')).toContain('Phase 9');
  });

  it('keeps the docs CLI listing comprehensive and labels lifecycle limits', () => {
    const cli = pages.find((page) => page.id === 'cli')!;
    const commands = cli.sections[0]!.code!;
    for (const command of [
      'identity rotate',
      'delegate create',
      'request sign',
      'revoke',
      'revoked',
      'provenance export'
    ])
      expect(commands).toContain(command);
    expect(cli.sections.flatMap((section) => section.body).join(' ')).toContain('failures');
  });
});
