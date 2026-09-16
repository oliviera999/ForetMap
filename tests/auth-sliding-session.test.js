// Pas de `helpers/setup` : la règle de décision est pure (aucune base, aucun serveur).
const test = require('node:test');
const assert = require('node:assert');

const {
  RENEW_RATIO,
  resolveSessionStartedAt,
  shouldRenewAuthToken,
  carrySessionStart,
} = require('../lib/auth/slidingSession');

/**
 * Renouvellement glissant des sessions JWT (`lib/auth/slidingSession.js`).
 *
 * Tests purs : aucune base, aucun serveur — la règle de décision est isolée exprès pour
 * rester vérifiable sans horloge réelle (`now` injecté).
 */

const NOW = 1_800_000_000; // seconde epoch de référence, arbitraire mais fixe
const TTL = 5400; // défaut `security.jwt_ttl_base_seconds` (1 h 30)

/** Claims d'un jeton émis il y a `ageSeconds`, avec un début de session optionnel. */
function claimsAged(ageSeconds, { startedAt } = {}) {
  const iat = NOW - ageSeconds;
  return {
    iat,
    exp: iat + TTL,
    ...(startedAt === undefined ? {} : { sessionStartedAt: startedAt }),
  };
}

test('la fenêtre de renouvellement est bien le dernier tiers de la durée de vie', () => {
  assert.strictEqual(RENEW_RATIO, 1 / 3);
  // Jeton tout neuf : rien à faire.
  assert.strictEqual(shouldRenewAuthToken(claimsAged(0), { now: NOW }), false);
  // Juste avant le seuil (il reste un peu plus d'un tiers).
  assert.strictEqual(shouldRenewAuthToken(claimsAged(TTL * (2 / 3) - 60), { now: NOW }), false);
  // Juste après : on ré-émet.
  assert.strictEqual(shouldRenewAuthToken(claimsAged(TTL * (2 / 3) + 60), { now: NOW }), true);
});

test('un jeton déjà expiré n’est pas prolongé', () => {
  assert.strictEqual(shouldRenewAuthToken(claimsAged(TTL + 1), { now: NOW }), false);
});

test('un jeton sans iat/exp exploitables n’est pas prolongé', () => {
  assert.strictEqual(shouldRenewAuthToken(null, { now: NOW }), false);
  assert.strictEqual(shouldRenewAuthToken({}, { now: NOW }), false);
  // exp antérieur à iat : jeton incohérent, on ne devine pas de fenêtre.
  assert.strictEqual(shouldRenewAuthToken({ iat: NOW, exp: NOW - 10 }, { now: NOW }), false);
});

test('le plafond absolu arrête la prolongation d’une session trop ancienne', () => {
  const inWindow = TTL * (2 / 3) + 60;
  // Session ouverte il y a 2 h, plafond 12 h : on prolonge encore.
  const young = claimsAged(inWindow, { startedAt: NOW - 7200 });
  assert.strictEqual(shouldRenewAuthToken(young, { now: NOW, slidingMaxSeconds: 43200 }), true);
  // Session ouverte il y a 13 h : plafond dépassé, l’utilisateur se reconnectera.
  const old = claimsAged(inWindow, { startedAt: NOW - 46800 });
  assert.strictEqual(shouldRenewAuthToken(old, { now: NOW, slidingMaxSeconds: 43200 }), false);
  // Plafond à 0 = sans limite (réglage volontairement permissif).
  assert.strictEqual(shouldRenewAuthToken(old, { now: NOW, slidingMaxSeconds: 0 }), true);
});

test('un jeton antérieur au claim `sessionStartedAt` retombe sur son iat', () => {
  const legacy = claimsAged(TTL * (2 / 3) + 60);
  assert.strictEqual(resolveSessionStartedAt(legacy), legacy.iat);
  // Émis dans la fenêtre : il obtient au plus une prolongation supplémentaire.
  assert.strictEqual(shouldRenewAuthToken(legacy, { now: NOW, slidingMaxSeconds: 43200 }), true);
  // Émis il y a plus longtemps que le plafond : refusé.
  const veryOld = { iat: NOW - 50000, exp: NOW + 60 };
  assert.strictEqual(shouldRenewAuthToken(veryOld, { now: NOW, slidingMaxSeconds: 43200 }), false);
});

test('carrySessionStart reconduit le début de session sans muter la charge utile', () => {
  const payload = { userType: 'teacher', userId: 'u1' };
  const carried = carrySessionStart(payload, { sessionStartedAt: 123, iat: 456 });
  assert.strictEqual(carried.sessionStartedAt, 123);
  assert.strictEqual(payload.sessionStartedAt, undefined, 'la charge utile d’origine est intacte');
  // À défaut du claim dédié, l'iat du jeton présenté fait foi.
  assert.strictEqual(carrySessionStart(payload, { iat: 456 }).sessionStartedAt, 456);
  // Sans claims du tout : pas de repère inventé (le signataire en posera un neuf).
  assert.strictEqual(carrySessionStart(payload, null).sessionStartedAt, undefined);
});
