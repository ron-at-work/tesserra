import { apiVersion } from './index.js';

/**
 * Dependency-free OpenAPI input. This stays close to the public contract so a
 * selected Phase 1 generator can consume it without changing wire paths.
 */
export const openApiDocument = {
  openapi: '3.1.0',
  info: { title: 'Agent Proof local API', version: apiVersion },
  paths: {
    '/v1/identities': {
      post: { operationId: 'createIdentity', responses: { '201': { description: 'Created' } } }
    },
    '/v1/identities/{id}': {
      get: {
        operationId: 'getIdentity',
        responses: { '200': { description: 'Identity' }, '404': { description: 'Not found' } }
      }
    },
    '/v1/verifications/identity': {
      post: {
        operationId: 'verifyIdentity',
        responses: { '200': { description: 'Verification decision' } }
      }
    },
    '/v1/agents': {
      get: { operationId: 'listAgents', responses: { '200': { description: 'Agent page' } } }
    },
    '/v1/trust-anchors': {
      get: {
        operationId: 'readTrustSnapshot',
        responses: { '200': { description: 'Pinned local snapshot' } }
      }
    },
    '/v1/trust-snapshots:reload': {
      post: {
        operationId: 'reloadTrustSnapshot',
        responses: {
          '200': { description: 'Reloaded configured snapshot' },
          '403': { description: 'Local authorization required' }
        }
      }
    }
  }
} as const;
