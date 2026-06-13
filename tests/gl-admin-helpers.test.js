'use strict';

// Tests no-DB de la logique pure extraite de routes/gl/admin.js (O10).
// Aucun accès base/réseau : on charge directement le module helper.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeBiomeSlugFilter,
  normalizePseudo,
  normalizePassword,
  parseOptionalBoolean,
  buildGeneratedPassword,
  PLAYER_EMAIL_RE,
  normalizePlayerEmail,
  ALLOWED_MODULE_SETTINGS,
  ALLOWED_GAMEPLAY_SETTINGS,
} = require('../lib/gl/adminRouteHelpers');

const { MODULE_KEYS } = require('../lib/glSettings');

describe('normalizeBiomeSlugFilter', () => {
  it('renvoie null pour null/undefined', () => {
    assert.equal(normalizeBiomeSlugFilter(null), null);
    assert.equal(normalizeBiomeSlugFilter(undefined), null);
  });
  it('trim et renvoie null pour chaîne vide', () => {
    assert.equal(normalizeBiomeSlugFilter('   '), null);
    assert.equal(normalizeBiomeSlugFilter('  foret  '), 'foret');
  });
  it('coerce les valeurs non-chaînes', () => {
    assert.equal(normalizeBiomeSlugFilter(42), '42');
  });
});

describe('normalizePseudo', () => {
  it('met en minuscule un pseudo trimé', () => {
    assert.equal(normalizePseudo('  Alice_01  '), 'alice_01');
  });
  it('renvoie null pour vide/blanc', () => {
    assert.equal(normalizePseudo('   '), null);
    assert.equal(normalizePseudo(null), null);
  });
});

describe('normalizePassword', () => {
  it('renvoie la chaîne trimée si présente', () => {
    assert.equal(normalizePassword('  secret  '), 'secret');
  });
  it('renvoie null pour vide/blanc/null', () => {
    assert.equal(normalizePassword('   '), null);
    assert.equal(normalizePassword(null), null);
  });
  it('ne met pas en minuscule (différent de normalizePseudo)', () => {
    assert.equal(normalizePassword('AbC'), 'AbC');
  });
});

describe('parseOptionalBoolean', () => {
  it('renvoie null pour null/undefined', () => {
    assert.equal(parseOptionalBoolean(null), null);
    assert.equal(parseOptionalBoolean(undefined), null);
  });
  it('passe les booléens tels quels', () => {
    assert.equal(parseOptionalBoolean(true), true);
    assert.equal(parseOptionalBoolean(false), false);
  });
  it('mappe les nombres 1/0', () => {
    assert.equal(parseOptionalBoolean(1), true);
    assert.equal(parseOptionalBoolean(0), false);
  });
  it('mappe les chaînes true/false/1/0 (insensible casse/espaces)', () => {
    assert.equal(parseOptionalBoolean(' TRUE '), true);
    assert.equal(parseOptionalBoolean('False'), false);
    assert.equal(parseOptionalBoolean('1'), true);
    assert.equal(parseOptionalBoolean('0'), false);
  });
  it('renvoie undefined pour valeurs invalides', () => {
    assert.equal(parseOptionalBoolean('oui'), undefined);
    assert.equal(parseOptionalBoolean(2), undefined);
    assert.equal(parseOptionalBoolean({}), undefined);
  });
});

describe('buildGeneratedPassword', () => {
  it('produit un mot de passe préfixé gl- et non vide', () => {
    const pwd = buildGeneratedPassword();
    assert.match(pwd, /^gl-[0-9a-z]+-[0-9a-z]+$/);
    assert.ok(pwd.length > 4);
  });
  it('produit des valeurs distinctes', () => {
    assert.notEqual(buildGeneratedPassword(), buildGeneratedPassword());
  });
});

describe('PLAYER_EMAIL_RE / normalizePlayerEmail', () => {
  it('valide les emails simples', () => {
    assert.ok(PLAYER_EMAIL_RE.test('a@b.co'));
    assert.equal(PLAYER_EMAIL_RE.test('invalide'), false);
    assert.equal(PLAYER_EMAIL_RE.test('a@b'), false);
  });
  it('normalizePlayerEmail met en minuscule et trim', () => {
    assert.equal(normalizePlayerEmail('  Foo@Bar.COM  '), 'foo@bar.com');
  });
  it('normalizePlayerEmail renvoie null pour vide', () => {
    assert.equal(normalizePlayerEmail('   '), null);
    assert.equal(normalizePlayerEmail(null), null);
  });
});

describe('ALLOWED_MODULE_SETTINGS', () => {
  it('est un Set construit à partir de MODULE_KEYS', () => {
    assert.ok(ALLOWED_MODULE_SETTINGS instanceof Set);
    assert.equal(ALLOWED_MODULE_SETTINGS.size, MODULE_KEYS.length);
    for (const key of MODULE_KEYS) {
      assert.ok(ALLOWED_MODULE_SETTINGS.has(key));
    }
  });
});

describe('ALLOWED_GAMEPLAY_SETTINGS', () => {
  it('contient les clés gameplay connues', () => {
    assert.ok(ALLOWED_GAMEPLAY_SETTINGS instanceof Set);
    assert.ok(ALLOWED_GAMEPLAY_SETTINGS.has('gameplay.turns_enabled'));
    assert.ok(ALLOWED_GAMEPLAY_SETTINGS.has('gameplay.lore_spoiler_max_level'));
    assert.equal(ALLOWED_GAMEPLAY_SETTINGS.has('gameplay.inexistant'), false);
  });
  it('compte 20 clés gameplay', () => {
    assert.equal(ALLOWED_GAMEPLAY_SETTINGS.size, 20);
  });
});
