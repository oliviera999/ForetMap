'use strict';

/**
 * Ensemble unifié, PR 1b, étape 1.9 (L2) — lexique et sceaux.
 *
 * - la fin de chapitre s'appelle **le camp** (sorts « du camp ») ; le Seuil reste l'espace
 *   personnel de l'élève ;
 * - honneur Éclaireurs → **Avant-garde**, Passeurs → **Compagnons** ;
 * - sceau licorne Éclaireuses → **Révélatrices** (pages trouvées + zones révélées) ;
 * - badges Passeur de page → **Porte-page**, Passeur de seuil → **Grand voyageur**,
 *   Révélateur → **Voyant des fils** (pour ne pas doubler le sceau).
 *
 * Seuls les noms visibles changent : les clés techniques restent. Test pur, sans base.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { HONNEURS, SCEAUX, HONNEUR_LIBELLES, libelleHonneur } = require('../lib/glHonneurs');
const { FENETRES } = require('../lib/glSpellFenetres');
const { SORT_MOMENTS } = require('../lib/shared/glSortMomentsCore');
const { GL_REWARD_CATALOGUE } = require('../lib/glRewardsCatalog');
const { presentJournalEvent } = require('../lib/glJournalPresent');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');

const lire = (nom) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'gl', 'tenir', nom), 'utf8'));

/** Noms sortis du lexique : plus aucun libellé visible ne les porte. */
const ANCIENS = [
  /Éclaireurs/,
  /Passeurs\b/,
  /Éclaireuses/,
  /Passeur de page/i,
  /Passeur de seuil/i,
];

test('honneurs et sceaux : clés techniques inchangées, noms affichés renommés', () => {
  assert.deepEqual([...HONNEURS], ['eclaireurs', 'gardiens', 'passeurs', 'esprit']);
  assert.deepEqual(Object.keys(SCEAUX), ['eclaireuses', 'mains']);
  assert.equal(libelleHonneur('eclaireurs'), 'Avant-garde');
  assert.equal(libelleHonneur('passeurs'), 'Compagnons');
  assert.equal(libelleHonneur('eclaireuses'), 'Révélatrices');
  assert.equal(libelleHonneur('inconnu'), 'inconnu');
  for (const cle of [...HONNEURS, ...Object.keys(SCEAUX)]) {
    const nom = HONNEUR_LIBELLES[cle];
    assert.ok(nom, `nom affiché pour ${cle}`);
    assert.equal(findForbiddenString(nom), null);
    for (const ancien of ANCIENS) assert.doesNotMatch(nom, ancien);
  }
});

test('titres.json : libellés du catalogue alignés ; le sceau licorne compte pages trouvées et zones révélées', () => {
  const titres = lire('titres.json');
  assert.equal(titres.honneurs.eclaireurs.libelle, 'Avant-garde');
  assert.equal(titres.honneurs.passeurs.libelle, 'Compagnons');
  assert.equal(titres.sceaux_peuple.eclaireuses.libelle, 'Révélatrices');
  assert.match(titres.sceaux_peuple.eclaireuses.critere, /trouvé le plus de pages et révélé/);
  for (const cle of HONNEURS) {
    assert.equal(titres.honneurs[cle].libelle, HONNEUR_LIBELLES[cle], cle);
  }
  for (const cle of Object.keys(SCEAUX)) {
    assert.equal(titres.sceaux_peuple[cle].libelle, HONNEUR_LIBELLES[cle], cle);
  }
});

test('badges : Porte-page, Grand voyageur, Voyant des fils — clés inchangées', () => {
  const parCle = new Map(GL_REWARD_CATALOGUE.map((e) => [e.key, e.title]));
  assert.equal(parCle.get('lecture.tenues'), 'Porte-page');
  assert.equal(parCle.get('voyage.chapitres'), 'Grand voyageur');
  assert.equal(parCle.get('trame.alteree'), 'Voyant des fils');
  for (const titre of parCle.values()) {
    for (const ancien of ANCIENS) assert.doesNotMatch(titre, ancien);
    assert.notEqual(titre, 'Révélateur', 'ne double pas le sceau des Révélatrices');
  }
  const badges = lire('badges.json').badges;
  const noms = new Map(badges.map((b) => [b.code, b.nom]));
  assert.equal(noms.get('passeur_de_seuil'), 'Grand voyageur');
  assert.equal(noms.get('revelateur'), 'Voyant des fils');
});

test('le camp : fenêtres des sorts, moment de l’écran et journal ne parlent plus de « seuil »', () => {
  assert.equal(FENETRES.seuil.message, 'Ce sort se lance au camp (hors phase « jeu »).');
  assert.equal(
    FENETRES.seuil_veillee.message,
    'Ce sort se lance au camp ou en veillée (hors phase « jeu »).',
  );
  const moment = SORT_MOMENTS.find((m) => m.fenetres.includes('seuil'));
  assert.equal(moment.label, 'Au camp ou en veillée');
  const sorts = lire('sorts.json');
  assert.equal(sorts.vocabulaire.fenetre.seuil, 'au camp (clôture de partie)');
  assert.equal(sorts.vocabulaire.fenetre.seuil_veillee, 'au camp ou en veillée');
  const clos = presentJournalEvent(
    { eventType: 'seuil_clos', payload: {} },
    { teamsById: {}, forPlayer: true, tenir: true },
  );
  assert.equal(clos.title, 'Le camp');
  assert.doesNotMatch(`${clos.title} ${clos.body}`, /seuil/i);
});

test('journal : un honneur sans titre porte son nom affiché, jamais sa clé technique', () => {
  const ctx = { teamsById: { 3: { id: 3, name: 'Licornes A' } }, forPlayer: true, tenir: true };
  const sansTitre = presentJournalEvent(
    { eventType: 'honneur', teamId: 3, payload: { honneur: 'eclaireurs' } },
    ctx,
  );
  assert.match(sansTitre.body, /« Avant-garde »/);
  assert.doesNotMatch(sansTitre.body, /eclaireurs/);
  const avecTitre = presentJournalEvent(
    { eventType: 'honneur', teamId: 3, payload: { honneur: 'passeurs', titre: 'Porteurs d’Eau' } },
    ctx,
  );
  assert.match(avecTitre.body, /« Porteurs d’Eau »/);
});
