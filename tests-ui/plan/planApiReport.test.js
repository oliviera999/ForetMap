// @vitest-environment jsdom
//
// Le « Signaler ou proposer » du plan des personnels part sur la porte de **sa** surface
// (`POST /api/staff-plan/report`), pas sur `POST /api/context-comments` : ce dernier refuse
// les profils en lecture seule, dont `personnel` — le public même de proflyautey. Une
// régression sur cette URL redonnerait un bouton qui répond 403 à qui doit s'en servir.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { submitPlaceSuggestion } from '../../src/plan/planApi.js';
import { STAFF_PLAN_VARIANT } from '../../src/plan/utils/planVariants.js';

describe('planApi — signalement sur un lieu', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 201,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true, id: 'c-1' }),
      text: async () => '{"ok":true,"id":"c-1"}',
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('poste sur /api/staff-plan/report avec le lieu et le message', async () => {
    await submitPlaceSuggestion(
      { contextType: 'marker', contextId: 'm-1', body: 'Porte cassée' },
      { ...STAFF_PLAN_VARIANT, getToken: () => 'jeton' },
    );
    const [url, init] = global.fetch.mock.calls[0];
    expect(String(url)).toContain('/api/staff-plan/report');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      contextType: 'marker',
      contextId: 'm-1',
      body: 'Porte cassée',
    });
    expect(init.headers.Authorization).toBe('Bearer jeton');
  });

  it('sans variante fournie, retombe sur l’API du plan des personnels', async () => {
    await submitPlaceSuggestion({ contextType: 'zone', contextId: 'z-1', body: 'Portillon' });
    expect(String(global.fetch.mock.calls[0][0])).toContain('/api/staff-plan/report');
  });
});
