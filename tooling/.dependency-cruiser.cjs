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
    },
    {
      name: 'apps-cannot-reach-operational-internals',
      comment:
        'Dashboard and landing are separate UI surfaces. They may use API contracts/client but never core, service, crypto, storage, host, server, or adapters.',
      severity: 'error',
      from: { path: '^apps/[^/]+/src/' },
      to: {
        path: '^packages/(core|crypto-local|storage-sqlite|service|api-server|host-local|adapter-[^/]+)/src/'
      }
    },
    {
      name: 'landing-is-static-public-surface',
      comment: 'The landing surface may not import workspace package internals.',
      severity: 'error',
      from: { path: '^apps/landing/src/' },
      to: { path: '^packages/' }
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
