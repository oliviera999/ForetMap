import { describe, expect, test } from 'vitest';
import {
  assertJsonApiBody,
  gatewayUnavailableUserMessage,
  isGatewayStyleResponse,
  isParsedApiJsonObject,
  parseApiBody,
  resolveMaxAttempts,
  resolveTransientRetryDelayMs,
  retryAfterDelayMs,
  shouldRetryAfterHttpError,
  shouldRetryAfterTimeout,
  transientRetryDelayMs,
  tryParseJsonText,
} from '../src/services/apiTransport.js';

function mockRes(status, contentType, extraHeaders = {}) {
  return {
    status,
    headers: {
      get: (name) => {
        const key = String(name).toLowerCase();
        if (key === 'content-type') return contentType;
        return extraHeaders[key] ?? null;
      },
    },
  };
}

describe('apiTransport', () => {
  test('isGatewayStyleResponse détecte HTML 503', () => {
    const res = mockRes(503, 'text/html; charset=utf-8');
    expect(isGatewayStyleResponse(res, { raw: '<html>503</html>' })).toBe(true);
  });

  test('isGatewayStyleResponse ignore 503 JSON métier', () => {
    const res = mockRes(503, 'application/json');
    expect(isGatewayStyleResponse(res, { error: 'Forum désactivé' })).toBe(false);
  });

  test('isGatewayStyleResponse accepte SERVICE_RESTARTING en JSON', () => {
    const res = mockRes(503, 'application/json');
    expect(
      isGatewayStyleResponse(res, {
        error: 'Service en redémarrage',
        code: 'SERVICE_RESTARTING',
      }),
    ).toBe(true);
  });

  test('isGatewayStyleResponse accepte SERVICE_UNAVAILABLE en JSON (503 hydratation auth)', () => {
    const res = mockRes(503, 'application/json');
    expect(
      isGatewayStyleResponse(res, {
        error: 'Service momentanément indisponible',
        code: 'SERVICE_UNAVAILABLE',
      }),
    ).toBe(true);
  });

  test('shouldRetryAfterHttpError pour POST sur passerelle HTML', () => {
    const res = mockRes(503, 'text/html');
    const body = { raw: '<html></html>' };
    expect(shouldRetryAfterHttpError('POST', null, res, body, 0, 4)).toBe(true);
    expect(shouldRetryAfterHttpError('POST', null, res, body, 3, 4)).toBe(false);
  });

  test('fenêtre longue (8 tentatives) réservée aux réponses passerelle', () => {
    expect(resolveMaxAttempts('GET', undefined)).toBe(8);
    expect(resolveMaxAttempts('POST', {})).toBe(8);
    const gateway = mockRes(503, 'text/html');
    const gatewayBody = { raw: '<html></html>' };
    expect(shouldRetryAfterHttpError('POST', null, gateway, gatewayBody, 6, 8)).toBe(true);
    expect(shouldRetryAfterHttpError('POST', null, gateway, gatewayBody, 7, 8)).toBe(false);
    // 503 JSON métier sur GET idempotent : fenêtre courte historique (4 tentatives max).
    const business = mockRes(503, 'application/json');
    const businessBody = { error: 'Forum désactivé' };
    expect(shouldRetryAfterHttpError('GET', undefined, business, businessBody, 2, 8)).toBe(true);
    expect(shouldRetryAfterHttpError('GET', undefined, business, businessBody, 3, 8)).toBe(false);
    // …et jamais de réessai métier pour une mutation.
    expect(shouldRetryAfterHttpError('POST', null, business, businessBody, 0, 8)).toBe(false);
  });

  test('transientRetryDelayMs couvre un redémarrage applicatif (~25 s cumulées)', () => {
    let total = 0;
    for (let attempt = 0; attempt < 7; attempt += 1) total += transientRetryDelayMs(attempt);
    expect(total).toBeGreaterThanOrEqual(23200);
  });

  test('retryAfterDelayMs lit et plafonne l’en-tête Retry-After', () => {
    expect(retryAfterDelayMs(mockRes(503, 'text/html', { 'retry-after': '2' }))).toBe(2000);
    expect(retryAfterDelayMs(mockRes(503, 'text/html', { 'retry-after': '9999' }))).toBe(10000);
    expect(retryAfterDelayMs(mockRes(503, 'text/html'))).toBe(0);
    expect(retryAfterDelayMs(mockRes(503, 'text/html', { 'retry-after': 'jeudi' }))).toBe(0);
  });

  test('resolveTransientRetryDelayMs ne descend pas sous Retry-After', () => {
    const res = mockRes(503, 'text/html', { 'retry-after': '3' });
    expect(resolveTransientRetryDelayMs(0, res)).toBeGreaterThanOrEqual(3000);
  });

  test('gatewayUnavailableUserMessage est actionnable', () => {
    expect(gatewayUnavailableUserMessage()).toMatch(/momentanément indisponible/i);
  });

  test('tryParseJsonText parse un objet JSON', () => {
    expect(tryParseJsonText('{"slug":"world"}')).toEqual({ slug: 'world' });
  });

  test('isParsedApiJsonObject distingue JSON parsé et enveloppe raw', () => {
    expect(isParsedApiJsonObject({ slug: 'world' })).toBe(true);
    expect(isParsedApiJsonObject({ raw: '{}' })).toBe(false);
    expect(isParsedApiJsonObject({ parseError: true, raw: 'x' })).toBe(false);
  });

  test('parseApiBody accepte JSON sans Content-Type application/json', async () => {
    const res = {
      status: 200,
      headers: { get: () => 'text/plain' },
      text: async () => '{"slug":"world","title":"Monde"}',
    };
    const body = await parseApiBody(res);
    expect(body).toEqual({ slug: 'world', title: 'Monde' });
    expect(() => assertJsonApiBody(body, { ok: true })).not.toThrow();
  });

  test('assertJsonApiBody rejette HTML en réponse ok', () => {
    expect(() => assertJsonApiBody({ raw: '<!DOCTYPE html>' }, { ok: true })).toThrow(
      /Impossible de charger le contenu/i,
    );
  });

  test('shouldRetryAfterTimeout : un GET idempotent obtient une seconde chance', () => {
    // Un serveur qui *pend* au lieu de couper ne doit pas échouer du premier coup…
    expect(shouldRetryAfterTimeout('GET', undefined, 0, 8)).toBe(true);
    // …mais pas huit fois : chaque tentative coûte déjà 40 s d'attente.
    expect(shouldRetryAfterTimeout('GET', undefined, 1, 8)).toBe(false);
    expect(shouldRetryAfterTimeout('GET', undefined, 5, 8)).toBe(false);
  });

  test('shouldRetryAfterTimeout : jamais pour une mutation (risque de doublon)', () => {
    // Un timeout ne dit pas si le serveur a traité la requête : rejouer un POST
    // pourrait créer deux fois la même donnée.
    expect(shouldRetryAfterTimeout('POST', { a: 1 }, 0, 8)).toBe(false);
    expect(shouldRetryAfterTimeout('DELETE', undefined, 0, 8)).toBe(false);
    // GET avec corps : pas idempotent au sens de cette politique.
    expect(shouldRetryAfterTimeout('GET', { q: 1 }, 0, 8)).toBe(false);
  });

  test('shouldRetryAfterTimeout : respecte le plafond global de tentatives', () => {
    expect(shouldRetryAfterTimeout('GET', undefined, 0, 1)).toBe(false);
  });
});
