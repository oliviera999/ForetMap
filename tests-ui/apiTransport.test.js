import { describe, expect, test } from 'vitest';
import {
  gatewayUnavailableUserMessage,
  isGatewayStyleResponse,
  shouldRetryAfterHttpError,
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
});
