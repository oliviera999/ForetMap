'use strict';

/**
 * Contrôle du fixture versionné `sql/fixtures/foretmap-anonymise.sql.gz`.
 *
 * C'est le filet qui rend acceptable le versionnement d'une copie de la base : il relit
 * l'archive **telle qu'elle est committée**, sans faire confiance au script qui l'a produite.
 * Si un jour quelqu'un régénère le fixture depuis une base mal anonymisée, ou committe un
 * dump brut sous ce nom, la CI tombe ici.
 *
 * Le test se saute de lui-même quand le fixture est absent (dépôt fraîchement cloné sans
 * fixture, ou branche qui l'a retiré) — il n'a alors rien à contrôler.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const readline = require('node:readline');

const FIXTURE = path.join(__dirname, '..', 'sql', 'fixtures', 'foretmap-anonymise.sql.gz');
const DOMAINE_ANON = 'exemple.invalid';

/** Adresse réelle = une adresse dont le domaine n'est pas celui de l'anonymisation. */
const EMAIL_REEL = new RegExp(
  `[A-Za-z0-9._%+-]+@(?!${DOMAINE_ANON.replace(/\./g, '\\.')})[A-Za-z0-9-]+\\.[A-Za-z]{2,}`,
);
const BCRYPT = /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g;

/**
 * Lecture ligne à ligne de l'archive décompressée : le fixture pèse ~9 Mo une fois détendu,
 * on ne le charge pas en mémoire d'un bloc.
 */
async function analyserFixture() {
  const lecteur = readline.createInterface({
    input: fs.createReadStream(FIXTURE).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });

  const resultat = { lignes: 0, adressesReelles: [], hachages: new Set() };
  for await (const ligne of lecteur) {
    resultat.lignes += 1;
    const adresse = ligne.match(EMAIL_REEL);
    if (adresse && resultat.adressesReelles.length < 5) {
      // On retient l'adresse tronquée : de quoi localiser la fuite sans la recopier en clair
      // dans la sortie de la CI.
      resultat.adressesReelles.push(`${adresse[0].slice(0, 3)}…@…(ligne ${resultat.lignes})`);
    }
    for (const hachage of ligne.match(BCRYPT) || []) resultat.hachages.add(hachage);
  }
  return resultat;
}

test('fixture anonymisé : aucune donnée personnelle dans l’archive versionnée', async (t) => {
  if (!fs.existsSync(FIXTURE)) {
    t.skip('fixture absent du dépôt — rien à contrôler');
    return;
  }

  const analyse = await analyserFixture();

  assert.ok(
    analyse.lignes > 100,
    `archive trop courte (${analyse.lignes} lignes) — export tronqué ?`,
  );

  assert.deepStrictEqual(
    analyse.adressesReelles,
    [],
    `adresse(s) hors du domaine ${DOMAINE_ANON} : ${analyse.adressesReelles.join(', ')}`,
  );

  // Un hachage unique est le résultat attendu : l'anonymiseur attribue le même mot de passe à
  // tous les comptes. Plusieurs valeurs distinctes signifient que des hachages d'origine ont
  // survécu — donc que la base exportée n'avait pas été anonymisée.
  assert.ok(
    analyse.hachages.size <= 1,
    `${analyse.hachages.size} hachages bcrypt distincts — l’anonymisation attend un mot de passe unique`,
  );
});
