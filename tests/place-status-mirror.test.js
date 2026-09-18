'use strict';

/**
 * Le vocabulaire des statuts de traitement existe deux fois : côté serveur
 * (`lib/placeMessages.js`, qui valide les écritures et porte la migration 264) et côté front
 * (`src/shared/place-messages/placeStatus.js`, qui les affiche dans la console **et** sur le
 * plan des personnels).
 *
 * Un miroir sans garde-fou dérive : un statut ajouté d'un seul côté donne soit une écriture
 * refusée, soit une pastille sans libellé. La charte du dépôt demande qu'un noyau partagé
 * arrive avec sa vérification (`docs/AUDIT_STRATEGIE_PLATEFORME_2026-09.md` §7, point 6) —
 * c'est ce test.
 */

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

const { PLACE_STATUSES, SETTABLE_PLACE_STATUSES } = require('../lib/placeMessages');

let front;

describe('Statuts d’un message de lieu : serveur et front disent la même chose', () => {
  before(async () => {
    front = await import(
      pathToFileURL(join(__dirname, '../src/shared/place-messages/placeStatus.js')).href
    );
  });

  it('les statuts que le front propose sont exactement ceux que le serveur accepte', () => {
    assert.deepEqual([...front.SETTABLE_PLACE_STATUSES], [...SETTABLE_PLACE_STATUSES]);
  });

  it('chaque statut connu du serveur a un libellé des deux côtés', () => {
    for (const status of PLACE_STATUSES) {
      assert.ok(
        front.PLACE_STATUS_LABELS[status],
        `libellé console manquant pour « ${status || '(nouveau)'} »`,
      );
      assert.ok(
        front.PLACE_STATUS_AUTHOR_LABELS[status],
        `libellé auteur manquant pour « ${status || '(nouveau)'} »`,
      );
    }
  });

  it('la chaîne vide est le point de départ, jamais un statut qu’on repose', () => {
    assert.ok(PLACE_STATUSES.includes(''));
    assert.ok(!SETTABLE_PLACE_STATUSES.includes(''));
    assert.ok(front.isOpenPlaceStatus(''));
    assert.ok(!front.isOpenPlaceStatus('traite'));
  });

  it('la classe CSS d’un statut suit sa valeur serveur', () => {
    assert.equal(front.placeStatusClass(''), 'place-status place-status--nouveau');
    for (const status of SETTABLE_PLACE_STATUSES) {
      assert.equal(front.placeStatusClass(status), `place-status place-status--${status}`);
    }
  });
});
