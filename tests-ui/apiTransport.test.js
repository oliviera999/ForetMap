import { describe, expect, test } from 'vitest';
import {
  assertJsonApiBody,
  gatewayUnavailableUserMessage,
  isGatewayStyleResponse,
  isParsedApiJsonObject,
  parseApiBody,
  shouldRetryAfterHttpError,
  tryParseJsonText,
} from '../src/services/apiTransport.js';

function mockRes(status, contentType) {
  return {
    status,
    headers: {
      get: (name) => (String(name).toLowerCase() === 'content-type' ? contentType : null),
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
    expect(isGatewayStyleResponse(res, {
      error: 'Service en redémarrage',
      code: 'SERVICE_RESTARTING',
    })).toBe(true);
  });

  test('shouldRetryAfterHttpError pour POST sur passerelle HTML', () => {
    const res = mockRes(503, 'text/html');
    const body = { raw: '<html></html>' };
    expect(shouldRetryAfterHttpError('POST', null, res, body, 0, 4)).toBe(true);
    expect(shouldRetryAfterHttpError('POST', null, res, body, 3, 4)).toBe(false);
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
    expect(() => assertJsonApiBody({ raw: '<!DOCTYPE html>' }, { ok: true }))
      .toThrow(/Impossible de charger le contenu/i);
  });
});
