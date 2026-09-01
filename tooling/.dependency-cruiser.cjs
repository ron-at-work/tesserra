/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular-dependencies',
      severity: 'error',
      from: {},
      to: { circular: true }
    },
    {
      name: 'no-cross-package-source-imports',
      comment:
        'TypeScript packages communicate through declared package exports, not source paths. Transitional JavaScript CLI sources are checked by their package manifest.',
      severity: 'error',
      from: { path: '^packages/([^/]+)/src/' },
      to: { path: '^packages/([^/]+)/src/', pathNot: '^packages/$1/src/' }
    },
    {
      name: 'protocol-has-no-operational-dependencies',
      comment:
        'Protocol may use standards-compliant Node cryptography for canonical ID derivation, but must not depend on other workspace packages, adapters, applications, or operational Node APIs.',
      severity: 'error',
      from: { path: '^packages/protocol/src/' },
      to: {
        path: '^(packages/(?!protocol/)|apps/|node:(?!crypto$))',
        pathNot: '^packages/protocol/src/'
      }
    }
  ],
  options: {
    doNotFollow: { path: '(^|/)(node_modules|dist|coverage)(/|$)' },
    tsConfig: { fileName: 'tsconfig.json' },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/[^/]+', theme: { graph: { splines: 'ortho' } } }
    }
  }
};
