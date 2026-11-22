'use strict';

/**
 * Noms recopiés par le jeu Gnomes & Licornes dans le fixture anonymisé
 * (`sql/fixtures/foretmap-anonymise.sql.gz`).
 *
 * Le jeu recopie un nom au moment d'un geste — qui a découvert un feuillet
 * (`discovered_by_name`), qui a lancé un sort (`casters[].displayName` dans le JSON d'un
 * évènement). L'anonymiseur réécrit les comptes, pas ces copies : le flux de sortie de
 * `scripts/export-anonymized-fixture.js` les remplace par `joueur<id>`
 * (`scripts/lib/fixturePseudonymes.js`).
 *
 * Deux contrôles :
 *   1. l'archive versionnée ne porte, dans ces colonnes et ces champs JSON, que des valeurs
 *      au gabarit — relu indépendamment du module, puis en vérifiant que la règle n'a plus
 *      rien à y changer ;
 *   2. la règle du script traite bien ces champs, sur un faux dump construit à l'exécution
 *      (aucune valeur réelle ici : les faux noms sont tirés au hasard).
 */

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { Readable, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const {
  findInsertStatements,
  parseCreateTableColumns,
  splitValueTuples,
} = require('../scripts/lib/sqlDumpInserts');
const {
  GL_NAME_RULES,
  PERSON_NAME_KEY,
  GABARIT_PSEUDONYME,
  decodeSqlLiteral,
  encodeSqlString,
  creerPseudonymiseurGl,
} = require('../scripts/lib/fixturePseudonymes');

const FIXTURE = path.join(__dirname, '..', 'sql', 'fixtures', 'foretmap-anonymise.sql.gz');

/** Valeurs des clés de nom de personne d'un document JSON, à toute profondeur. */
function nomsDansJson(noeud, out = []) {
  if (Array.isArray(noeud)) noeud.forEach((x) => nomsDansJson(x, out));
  else if (noeud && typeof noeud === 'object') {
    for (const [k, v] of Object.entries(noeud)) {
      if (typeof v === 'string' && v !== '' && PERSON_NAME_KEY.test(k)) out.push(v);
      else nomsDansJson(v, out);
    }
  }
  return out;
}

test('fixture anonymisé : les noms recopiés par le jeu suivent le gabarit joueur<id>', async (t) => {
  if (!fs.existsSync(FIXTURE)) {
    t.skip('fixture absent du dépôt — rien à contrôler');
    return;
  }
  const sql = zlib.gunzipSync(fs.readFileSync(FIXTURE)).toString('utf8');

  // 1. Relecture indépendante, table par table.
  let vus = 0;
  let horsGabarit = 0;
  for (const [table, regle] of Object.entries(GL_NAME_RULES)) {
    const colonnes = parseCreateTableColumns(sql, table);
    if (!colonnes) continue;
    for (const insert of findInsertStatements(sql, table)) {
      for (const valeurs of splitValueTuples(insert.valuesText)) {
        for (const col of Object.keys(regle.columns || {})) {
          const i = colonnes.indexOf(col);
          const v = i < 0 ? null : decodeSqlLiteral(valeurs[i]);
          if (v == null || v === '') continue;
          vus += 1;
          if (!GABARIT_PSEUDONYME.test(v)) horsGabarit += 1;
        }
        for (const col of Object.keys(regle.json || {})) {
          const i = colonnes.indexOf(col);
          const v = i < 0 ? null : decodeSqlLiteral(valeurs[i]);
          if (v == null || v === '') continue;
          for (const nom of nomsDansJson(JSON.parse(v))) {
            vus += 1;
            if (!GABARIT_PSEUDONYME.test(nom)) horsGabarit += 1;
          }
        }
      }
    }
  }
  assert.ok(vus > 0, 'aucun nom recopié trouvé — tables renommées ou fixture tronqué ?');
  // Le message ne donne qu'un compte : jamais la valeur fautive dans la sortie de la CI.
  assert.strictEqual(horsGabarit, 0, `${horsGabarit} nom(s) recopié(s) hors gabarit joueur<id>`);

  // 2. La règle du script n'a plus rien à changer : l'archive en est un point fixe.
  const p = creerPseudonymiseurGl();
  let lignesChangees = 0;
  for (const ligne of sql.split('\n')) if (p.ligne(ligne) !== ligne) lignesChangees += 1;
  assert.strictEqual(
    p.stats.champs,
    vus,
    'la règle et la relecture ne voient pas les mêmes champs',
  );
  assert.strictEqual(p.stats.jsonIllisible, 0);
  assert.strictEqual(lignesChangees, 0, `${lignesChangees} ligne(s) encore à pseudonymiser`);
});

test('export du fixture : le flux de sortie pseudonymise les noms recopiés par le jeu', async () => {
  const { creerFluxSortie } = require('../scripts/export-anonymized-fixture');
  const faux = () => `X${crypto.randomBytes(5).toString('hex')}`;
  const [nomDecouverte, nomLanceur1, nomLanceur2, nomEvenement, nomHorsCible] = [
    faux(),
    faux(),
    faux(),
    faux(),
    faux(),
  ];
  const json = (o) => encodeSqlString(JSON.stringify(o));
  const sortilege = { spellCode: 'S1', spellName: 'Pluie fine', casters: [] };
  sortilege.casters.push({ playerId: 12, displayName: nomLanceur1, gems: 1 });
  sortilege.casters.push({ playerId: 34, displayName: nomLanceur2, gems: 0 });
  const decouverte = { feuilletCode: 'F1', titre: 'Écorce', discoveredBy: nomEvenement };

  const dump = [
    'CREATE TABLE `gl_player_feuillet_states` (',
    '  `player_id` int(10) unsigned NOT NULL,',
    '  `discovered_by_player_id` varchar(64) DEFAULT NULL,',
    '  `discovered_by_name` varchar(120) DEFAULT NULL,',
    ') ENGINE=InnoDB;',
    'CREATE TABLE `gl_game_events` (',
    '  `id` bigint(20) NOT NULL,',
    '  `actor_id` varchar(64) DEFAULT NULL,',
    '  `payload_json` longtext DEFAULT NULL,',
    ') ENGINE=InnoDB;',
    'CREATE TABLE `notes` (',
    '  `id` int(10) NOT NULL,',
    '  `payload_json` longtext DEFAULT NULL,',
    ') ENGINE=InnoDB;',
    'INSERT INTO `gl_player_feuillet_states` VALUES',
    `(1,'7',${encodeSqlString(nomDecouverte)}),`,
    '(2,NULL,NULL),',
    "(3,'8','joueur8');",
    'INSERT INTO `gl_game_events` VALUES',
    `(1,'5',${json(sortilege)}),`,
    `(2,'9',${json(decouverte)});`,
    'INSERT INTO `notes` VALUES',
    `(1,${json({ displayName: nomHorsCible, texte: 'forêt' })});`,
    '',
  ].join('\n');

  const sortie = creerFluxSortie();
  const morceaux = [];
  const octets = Buffer.from(dump, 'utf8');
  // Morceaux de 7 octets : des lignes ET des caractères multioctets coupés en deux.
  const entrees = [];
  for (let i = 0; i < octets.length; i += 7) entrees.push(octets.subarray(i, i + 7));
  await pipeline(
    Readable.from(entrees),
    sortie.flux,
    new Writable({
      write(chunk, _enc, done) {
        morceaux.push(chunk);
        done();
      },
    }),
  );
  const resultat = Buffer.concat(morceaux).toString('utf8');

  for (const nom of [nomDecouverte, nomLanceur1, nomLanceur2, nomEvenement]) {
    assert.ok(!resultat.includes(nom), 'un faux nom a traversé le flux');
  }
  assert.ok(resultat.includes("(1,'7','joueur7'),"), 'discovered_by_name → joueur<id>');
  assert.ok(resultat.includes('(2,NULL,NULL),'), 'NULL conservé');
  assert.ok(resultat.includes("(3,'8','joueur8');"), 'valeur déjà au gabarit inchangée');

  const evenements = findInsertStatements(resultat, 'gl_game_events');
  const lignes = splitValueTuples(evenements[0].valuesText);
  const sort = JSON.parse(decodeSqlLiteral(lignes[0][2]));
  assert.deepStrictEqual(
    sort.casters.map((c) => c.displayName),
    ['joueur12', 'joueur34'],
    'casters[].displayName → joueur<playerId>',
  );
  assert.strictEqual(sort.spellName, 'Pluie fine', 'un nom de contenu n’est pas visé');
  const dec = JSON.parse(decodeSqlLiteral(lignes[1][2]));
  assert.strictEqual(dec.discoveredBy, 'joueur9', 'discoveredBy → joueur<actor_id>');
  assert.strictEqual(dec.titre, 'Écorce');

  // Une table hors règle ressort à l'octet près, accents compris.
  assert.ok(resultat.includes(`(1,${json({ displayName: nomHorsCible, texte: 'forêt' })});`));
  assert.deepStrictEqual(sortie.compteurs(), { neutralisees: 0, pseudonymises: 4 });
});
