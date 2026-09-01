import { describe, expect, test } from 'vitest';
import { isSocketAuthRejection } from '../../src/utils/realtimeAuthRejection.js';

describe('isSocketAuthRejection', () => {
  test('reconnaît les refus d’authentification du middleware Socket.IO', () => {
    expect(isSocketAuthRejection(new Error('unauthorized'))).toBe(true);
    expect(isSocketAuthRejection(new Error('Unauthorized'))).toBe(true);
    expect(isSocketAuthRejection('forbidden')).toBe(true);
  });

  test('une base momentanément injoignable n’est PAS un refus : la reconnexion continue', () => {
    // `unavailable` est renvoyé quand l'hydratation échoue (panne BDD) : le serveur va
    // revenir, couper la reconnexion priverait l'utilisateur du temps réel sans raison.
    expect(isSocketAuthRejection(new Error('unavailable'))).toBe(false);
  });

  test('les échecs réseau ordinaires ne coupent pas la reconnexion', () => {
    expect(isSocketAuthRejection(new Error('xhr poll error'))).toBe(false);
    expect(isSocketAuthRejection(new Error('timeout'))).toBe(false);
    expect(isSocketAuthRejection(undefined)).toBe(false);
    expect(isSocketAuthRejection(null)).toBe(false);
  });
});
