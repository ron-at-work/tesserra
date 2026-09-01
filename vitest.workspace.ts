import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      include: ['test/**/*.test.ts', 'test/**/*.test.js'],
      exclude: ['**/dist/**', '**/node_modules/**']
    }
  }
]);
