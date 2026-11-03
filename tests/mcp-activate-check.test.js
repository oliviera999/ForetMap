'use strict';

/**
 * Contrôles unitaires du script d'activation MCP (fetch simulé).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'mcp-activate-check.mjs');

async function load() {
  return import(pathToFileURL(SCRIPT).href);
}

describe('mcp-activate-check', () => {
  it('détecte 404 (connecteur éteint)', async () => {
    const { runActivateChecks } = await load();
    const fetchImpl = async (url) => {
      if (String(url).endsWith('/mcp')) {
        return {
          status: 404,
          headers: { get: () => null },
          json: async () => ({}),
        };
      }
      return { status: 404, headers: { get: () => null }, json: async () => ({}) };
    };
    const r = await runActivateChecks('https://foretmap.example', { fetchImpl });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /404/.test(e) && /MCP_ENABLED/.test(e)));
  });

  it('passe quand 401 + métadonnées cohérentes', async () => {
    const { runActivateChecks } = await load();
    const base = 'https://foretmap.example';
    const prmUrl = `${base}/.well-known/oauth-protected-resource/mcp`;
    const fetchImpl = async (url, init) => {
      const u = String(url);
      if (u === `${base}/mcp` && init?.method === 'POST') {
        return {
          status: 401,
          headers: {
            get: (h) =>
              String(h).toLowerCase() === 'www-authenticate'
                ? `Bearer resource_metadata="${prmUrl}"`
                : null,
          },
        };
      }
      if (u === prmUrl) {
        return {
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            resource: `${base}/mcp`,
            authorization_servers: [base],
          }),
        };
      }
      if (u.includes('oauth-authorization-server')) {
        return {
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            issuer: base,
            authorization_endpoint: `${base}/oauth/authorize`,
            token_endpoint: `${base}/oauth/token`,
            registration_endpoint: `${base}/oauth/register`,
            code_challenge_methods_supported: ['S256'],
            client_id_metadata_document_supported: true,
          }),
        };
      }
      if (u.includes('.well-known/')) {
        return { status: 200, headers: { get: () => null }, json: async () => ({}) };
      }
      throw new Error(`fetch inattendu : ${u}`);
    };
    const r = await runActivateChecks(base, { fetchImpl });
    assert.equal(r.ok, true, r.errors.join('; '));
    assert.equal(r.resource, `${base}/mcp`);
  });

  it('signale un décalage MCP_PUBLIC_BASE_URL / resource', async () => {
    const { runActivateChecks } = await load();
    const base = 'https://foretmap.example';
    const prmUrl = `${base}/.well-known/oauth-protected-resource/mcp`;
    const fetchImpl = async (url, init) => {
      const u = String(url);
      if (u.endsWith('/mcp') && init?.method === 'POST') {
        return {
          status: 401,
          headers: {
            get: () => `Bearer resource_metadata="${prmUrl}"`,
          },
        };
      }
      if (u === prmUrl) {
        return {
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            resource: 'https://autre.example/mcp',
            authorization_servers: [base],
          }),
        };
      }
      return {
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          issuer: base,
          authorization_endpoint: `${base}/oauth/authorize`,
          token_endpoint: `${base}/oauth/token`,
          code_challenge_methods_supported: ['S256'],
        }),
      };
    };
    const r = await runActivateChecks(base, { fetchImpl });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /MCP_PUBLIC_BASE_URL/.test(e)));
  });
});
