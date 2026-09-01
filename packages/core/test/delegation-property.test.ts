import assert from 'node:assert/strict';
import fc from 'fast-check';
import { test } from 'vitest';

interface Constraint {
  readonly capabilities: readonly string[];
  readonly resources: readonly { readonly type: 'opaque'; readonly value: string }[];
  readonly tasks: readonly string[];
  readonly audiences: readonly string[];
  readonly not_before: string;
  readonly expires_at: string;
  readonly remaining_depth: number;
}

const baseTime = Date.parse('2026-09-01T00:00:00Z');
const timestamp = (seconds: number): string =>
  new Date(baseTime + seconds * 1000).toISOString().replace('.000Z', 'Z');
const action = fc.constantFrom('read', 'invoice.read', 'report.export');
const opaque = fc.constantFrom('ledger', 'invoice', 'report');
const task = fc.constantFrom(
  '0198e1f8-0000-7000-8000-000000000001',
  '0198e1f8-0000-7000-8000-000000000002',
  '0198e1f8-0000-7000-8000-000000000003'
);
const audience = fc.constantFrom('api.example.invalid', 'worker.example.invalid');
const subset = <T>(items: readonly T[]): fc.Arbitrary<readonly T[]> =>
  fc.subarray([...items], { minLength: 1 });
const root = fc
  .record({
    capabilities: fc.uniqueArray(action, { minLength: 1 }),
    resources: fc
      .uniqueArray(opaque, { minLength: 1 })
      .map((values) => values.map((value) => ({ type: 'opaque' as const, value }))),
    tasks: fc.uniqueArray(task, { minLength: 1 }),
    audiences: fc.uniqueArray(audience, { minLength: 1 }),
    start: fc.integer({ min: 0, max: 100 }),
    duration: fc.integer({ min: 2, max: 200 }),
    depth: fc.integer({ min: 1, max: 8 })
  })
  .map((value): Constraint => ({
    capabilities: value.capabilities,
    resources: value.resources,
    tasks: value.tasks,
    audiences: value.audiences,
    not_before: timestamp(value.start),
    expires_at: timestamp(value.start + value.duration),
    remaining_depth: value.depth
  }));

const childOf = (parent: Constraint): fc.Arbitrary<Constraint> =>
  fc
    .tuple(
      subset(parent.capabilities),
      subset(parent.resources),
      subset(parent.tasks),
      subset(parent.audiences),
      fc.integer({ min: 0, max: parent.remaining_depth - 1 }),
      fc.integer({
        min: 0,
        max: Math.floor((Date.parse(parent.expires_at) - Date.parse(parent.not_before)) / 1000)
      })
    )
    .map(([capabilities, resources, tasks, audiences, depth, offset]) => {
      const start = Date.parse(parent.not_before) / 1000 + offset;
      const end = Date.parse(parent.expires_at) / 1000;
      return {
        capabilities,
        resources,
        tasks,
        audiences,
        not_before: new Date(start * 1000).toISOString().replace('.000Z', 'Z'),
        expires_at: new Date(Math.max(start, end) * 1000).toISOString().replace('.000Z', 'Z'),
        remaining_depth: depth
      };
    });

function includes<T>(parent: readonly T[], children: readonly T[]): boolean {
  return children.every((child) =>
    parent.some((item) => JSON.stringify(item) === JSON.stringify(child))
  );
}

test('fast-check: attenuated child constraints never expand any authority dimension', () => {
  fc.assert(
    fc.property(root, (parent) => {
      fc.assert(
        fc.property(childOf(parent), (child) => {
          assert.equal(includes(parent.capabilities, child.capabilities), true);
          assert.equal(includes(parent.resources, child.resources), true);
          assert.equal(includes(parent.tasks, child.tasks), true);
          assert.equal(includes(parent.audiences, child.audiences), true);
          assert.ok(Date.parse(child.not_before) >= Date.parse(parent.not_before));
          assert.ok(Date.parse(child.expires_at) <= Date.parse(parent.expires_at));
          assert.ok(child.remaining_depth < parent.remaining_depth);
        }),
        { numRuns: 20 }
      );
    }),
    { numRuns: 50 }
  );
});
