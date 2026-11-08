'use strict';

/**
 * Prépare la base du banc : `npm run gl:sim:db [-- --db foretmap_sim --snapshot <fichier>]`.
 *
 * 1. garde-fou n° 10 (`_sim` / `_test`, jamais la production) ;
 * 2. `initSchema()` : schéma + migrations ;
 * 3. vidage des tables G&L (contenu et jeu : toutes les `gl_*` sauf `gl_settings`) et des
 *    comptes miroirs (`users.auth_provider = 'gl_bridge'`) ;
 * 4. chargement de l'instantané de contenu (`data/gl/sim/contenu-prod-*.json`, le plus récent
 *    par défaut) : seules les colonnes connues de la base cible sont écrites ;
 * 5. synchronisation forcée des catalogues `data/gl/tenir/*.json` (`lib/glTenirSync.js`) :
 *    zones de chasse (rang de case calculé sur les vraies cases), questions de lecture, sorts v2
 *    et ouvertures par chapitre, péripéties, titres, badges, Olu, parures, Passeur ;
 * 6. réglages de base de la mouture ;
 * 7. vérification : chapitres des plateaux 1 à 4, cases, zones prêtes, questions de lecture,
 *    sorts v2.
 */

const fs = require('node:fs');
const path = require('node:path');
const { preparerEnvironnement } = require('./env');
const { CONTENT_TABLES, verifierSnapshotSansNominatif, DEFAULT_OUT_DIR } = require('./snapshot');
const { REGLAGES_BASE, appliquerReglages } = require('./reglages');

const LOT = 200;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function parseArgs(argv) {
  const out = { db: null, snapshot: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--db') out.db = argv[++i];
    else if (a.startsWith('--db=')) out.db = a.slice(5);
    else if (a === '--snapshot') out.snapshot = argv[++i];
    else if (a.startsWith('--snapshot=')) out.snapshot = a.slice('--snapshot='.length);
  }
  return out;
}

/** Instantané le plus récent de `data/gl/sim/contenu-prod-*.json`. */
function trouverSnapshot(explicit = null) {
  if (explicit) return path.resolve(explicit);
  if (!fs.existsSync(DEFAULT_OUT_DIR)) return null;
  const files = fs
    .readdirSync(DEFAULT_OUT_DIR)
    .filter((f) => /^contenu-prod-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  return files.length ? path.join(DEFAULT_OUT_DIR, files[files.length - 1]) : null;
}

function valeurSql(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    if (ISO_RE.test(v)) return v.replace('T', ' ').replace('Z', '').slice(0, 23);
    if (v.startsWith('base64:')) return Buffer.from(v.slice(7), 'base64');
    return v;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/**
 * Tables de **jeu et de personnes** G&L (vidées à chaque préparation). Les dictionnaires semés
 * par les migrations (catégories de sorts, glossaires, tutoriels, mascottes…) sont conservés ;
 * les catalogues Tenir (`gl_chasse_zones`, `gl_tenir_*`) sont réécrits par la synchronisation.
 */
const TABLES_JEU_RE =
  /^(gl_games|gl_teams|gl_team_members|gl_team_scores|gl_game_.*|gl_players|gl_player_.*|gl_classes|gl_class_.*|gl_admins|gl_market_.*|gl_spell_cast_.*|gl_action_requests|gl_qcm_attempts|gl_qcm_presentation_uses|gl_learning_acknowledgements|gl_resource_gating_cooldowns|gl_resource_ledger|gl_voyageur_.*|gl_forum_.*|gl_tutorial_reads|gl_mascot_assignments)$/;

/** Tables à vider : contenu remplacé par l'instantané + jeu / personnes. */
async function listerTablesGl(db, dbName) {
  const rows = await db.queryAll(
    "SELECT TABLE_NAME AS t FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'gl\\_%' AND TABLE_TYPE = 'BASE TABLE'",
    [dbName],
  );
  return rows
    .map((r) => String(r.t))
    .filter((t) => t !== 'gl_settings' && (CONTENT_TABLES.includes(t) || TABLES_JEU_RE.test(t)));
}

async function colonnesDe(db, dbName, table) {
  const rows = await db.queryAll(
    'SELECT COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
    [dbName, table],
  );
  return rows.map((r) => String(r.c));
}

/** Vide les tables G&L et les comptes miroirs (connexion dédiée, FK désactivées). */
async function viderTablesGl(db, dbName) {
  const tables = await listerTablesGl(db, dbName);
  const conn = await db.pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of tables) await conn.query(`TRUNCATE TABLE \`${t}\``);
    await conn.query("DELETE FROM users WHERE auth_provider = 'gl_bridge'");
    await conn.query("DELETE FROM `groups` WHERE slug LIKE 'gl-class-%'");
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    conn.release();
  }
  return tables;
}

/** Charge l'instantané (colonnes communes seulement) ; renvoie les comptes par table. */
async function chargerSnapshot(db, dbName, snapshot) {
  const check = verifierSnapshotSansNominatif(snapshot);
  if (!check.ok) throw new Error(`Instantané refusé : ${check.erreurs.join(' ; ')}`);
  const comptes = {};
  const conn = await db.pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of CONTENT_TABLES) {
      const spec = snapshot.tables[table];
      if (!spec) continue;
      const cibles = await colonnesDe(db, dbName, table);
      if (!cibles.length) {
        comptes[table] = { skipped: 'table absente de la base cible' };
        continue;
      }
      const idx = spec.columns.map((c, i) => (cibles.includes(c) ? i : -1)).filter((i) => i >= 0);
      const cols = idx.map((i) => spec.columns[i]);
      let inseres = 0;
      for (let k = 0; k < spec.rows.length; k += LOT) {
        const lot = spec.rows.slice(k, k + LOT);
        const placeholders = lot.map(() => `(${cols.map(() => '?').join(', ')})`).join(', ');
        const params = [];
        for (const row of lot) for (const i of idx) params.push(valeurSql(row[i]));
        const [res] = await conn.query(
          `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES ${placeholders}`,
          params,
        );
        inseres += Number(res?.affectedRows) || 0;
      }
      comptes[table] = {
        lignes: spec.rows.length,
        inseres,
        colonnesIgnorees: spec.columns.length - cols.length,
      };
    }
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    conn.release();
  }
  return comptes;
}

/**
 * Instantané antérieur à la fusion des chapitres 4 et 5 (taïga → toundra, 4 plateaux) : le
 * chapitre de plateau 5 perd son plateau et ses feuillets passent au plateau 4, comme l'a fait
 * la migration de fusion en production. Sans cela, cinq zones de chasse du plateau 4 pointent
 * vers un feuillet « d'un autre plateau » et la synchronisation les écarte.
 */
async function adapterInstantaneAncien(db) {
  const out = { applique: false, fusion45: null, niveaux: null };
  const cinq = await db.queryAll('SELECT id FROM gl_chapters WHERE plateau_number = 5');
  if (cinq.length) {
    const feuillets = await db.execute(
      'UPDATE gl_lore_feuillets SET plateau_number = 4 WHERE plateau_number = 5',
    );
    await db.execute('UPDATE gl_chapters SET plateau_number = NULL WHERE plateau_number = 5');
    out.applique = true;
    out.fusion45 = { chapitres: cinq.length, feuillets: Number(feuillets?.affectedRows) || 0 };
  }
  // Niveaux des QCM : les cases filtrent `niveau IN ('base' | 'approfondissement')` ; un ancien
  // export étiquette encore `6ème` / `cycle 4` / `lycee` (aucune question ne sortirait du pool).
  const base = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_qcm_questions WHERE niveau = 'base'",
  );
  const casesBase = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_chapter_markers WHERE event_type = 'quiz' AND event_config_json LIKE '%\"base\"%'",
  );
  if (Number(base?.n) === 0 && Number(casesBase?.n) > 0) {
    const sixieme = await db.execute(
      "UPDATE gl_qcm_questions SET niveau = 'base' WHERE niveau = '6ème'",
    );
    const autres = await db.execute(
      "UPDATE gl_qcm_questions SET niveau = 'approfondissement' WHERE niveau NOT IN ('base', 'approfondissement')",
    );
    out.applique = true;
    out.niveaux = {
      base: Number(sixieme?.affectedRows) || 0,
      approfondissement: Number(autres?.affectedRows) || 0,
    };
  }
  return out;
}

/** Vérifie le contenu minimal du banc (plateaux 1-4). */
async function verifierContenu(db) {
  const chapitres = await db.queryAll(
    'SELECT id, slug, plateau_number FROM gl_chapters WHERE plateau_number BETWEEN 1 AND 4 ORDER BY plateau_number, id',
  );
  const zones = await db.queryAll(
    'SELECT plateau, COUNT(*) AS n, SUM(geometrie_prete = 1) AS pretes, SUM(rang_case IS NOT NULL) AS ranges FROM gl_chasse_zones WHERE actif = 1 GROUP BY plateau ORDER BY plateau',
  );
  const cases = await db.queryAll(
    'SELECT ch.plateau_number AS plateau, COUNT(*) AS n FROM gl_chapter_markers m INNER JOIN gl_chapters ch ON ch.id = m.chapter_id WHERE ch.plateau_number BETWEEN 1 AND 4 GROUP BY ch.plateau_number ORDER BY ch.plateau_number',
  );
  const lecture = await db.queryOne(
    'SELECT COUNT(*) AS n FROM gl_tenir_questions_lecture WHERE actif = 1',
  );
  const sorts = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_spells WHERE tenir_v2 = 1 AND statut = 'officiel'",
  );
  const rattachements = await db.queryAll(
    'SELECT ch.plateau_number AS plateau, COUNT(*) AS n FROM gl_chapter_spells cs INNER JOIN gl_chapters ch ON ch.id = cs.chapter_id INNER JOIN gl_spells s ON s.spell_code = cs.spell_code WHERE s.tenir_v2 = 1 AND ch.plateau_number BETWEEN 1 AND 4 GROUP BY ch.plateau_number ORDER BY ch.plateau_number',
  );
  const qcm = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_qcm_questions WHERE statut = 'actif'",
  );
  const feuillets = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_lore_feuillets WHERE statut = 'actif'",
  );
  const erreurs = [];
  for (const p of [1, 2, 3, 4]) {
    if (!chapitres.some((c) => Number(c.plateau_number) === p))
      erreurs.push(`aucun chapitre de plateau ${p}`);
    // Le catalogue livre 8/8/10/10 zones dont `cz-p2-08` inactive (C7) : au moins 7 prêtes.
    const z = zones.find((r) => Number(r.plateau) === p);
    if (!z || Number(z.pretes) < 7)
      erreurs.push(`plateau ${p} : moins de 7 zones de chasse prêtes`);
  }
  if (Number(lecture?.n) < 30) erreurs.push('questions de lecture insuffisantes');
  if (Number(sorts?.n) < 20) erreurs.push('sorts v2 insuffisants');
  return {
    ok: erreurs.length === 0,
    erreurs,
    chapitres: chapitres.map((c) => ({
      id: Number(c.id),
      slug: c.slug,
      plateau: Number(c.plateau_number),
    })),
    zones: zones.map((z) => ({
      plateau: Number(z.plateau),
      n: Number(z.n),
      pretes: Number(z.pretes),
      ranges: Number(z.ranges),
    })),
    cases: cases.map((c) => ({ plateau: Number(c.plateau), n: Number(c.n) })),
    questionsLecture: Number(lecture?.n) || 0,
    sortsV2: Number(sorts?.n) || 0,
    rattachements: rattachements.map((r) => ({ plateau: Number(r.plateau), n: Number(r.n) })),
    qcm: Number(qcm?.n) || 0,
    feuillets: Number(feuillets?.n) || 0,
  };
}

/**
 * Prépare la base (`process.env.DB_NAME` déjà posé par `preparerEnvironnement`).
 * @returns {Promise<object>} rapport
 */
async function preparerBaseSim({ snapshotPath = null, log = () => {} } = {}) {
  const dbName = process.env.DB_NAME;
  const db = require('../../database');
  const file = trouverSnapshot(snapshotPath);
  if (!file || !fs.existsSync(file)) {
    throw new Error(
      'Aucun instantané de contenu : lancer `npm run gl:sim:snapshot -- --from-db <base locale>`',
    );
  }
  log(`Base ${dbName} : schéma et migrations…`);
  await db.initSchema();
  log('Vidage des tables G&L…');
  const videes = await viderTablesGl(db, dbName);
  log(`Chargement de l'instantané ${path.basename(file)}…`);
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  const comptes = await chargerSnapshot(db, dbName, snapshot);
  const adaptation = await adapterInstantaneAncien(db);
  if (adaptation.applique) log('Instantané antérieur à la fusion des chapitres 4 et 5 : adapté.');
  log('Synchronisation des catalogues data/gl/tenir…');
  const { syncTenirCatalogues } = require('../../lib/glTenirSync');
  const sync = await syncTenirCatalogues(db, { force: true });
  const refuses = sync.files.filter((f) => f.status === 'refuse');
  log('Réglages de base de la mouture…');
  await appliquerReglages(db, REGLAGES_BASE);
  const verification = await verifierContenu(db);
  return {
    dbName,
    snapshot: { file, source: snapshot.source },
    tablesVidees: videes.length,
    comptes,
    adaptation,
    sync: sync.files.map((f) => ({
      fichier: f.fichier,
      status: f.status,
      count: f.count,
      upserted: f.upserted,
      desactives: f.desactives,
      ecartees: f.ecartees,
      errors: (f.errors || []).slice(0, 5),
      warnings: (f.warnings || []).length,
    })),
    refuses: refuses.map((f) => f.fichier),
    verification,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  preparerEnvironnement({ dbName: args.db || process.env.GL_SIM_DB || 'foretmap_sim' });
  const rapport = await preparerBaseSim({
    snapshotPath: args.snapshot,
    log: (m) => console.log(m),
  });
  console.log(JSON.stringify(rapport, null, 2));
  const db = require('../../database');
  await db.endPool();
  if (!rapport.verification.ok || rapport.refuses.length) {
    console.error(
      'Préparation incomplète :',
      [
        ...rapport.verification.erreurs,
        ...rapport.refuses.map((f) => `catalogue refusé : ${f}`),
      ].join(' ; '),
    );
    process.exit(1);
  }
  process.exit(0);
}

module.exports = {
  parseArgs,
  trouverSnapshot,
  valeurSql,
  viderTablesGl,
  chargerSnapshot,
  verifierContenu,
  preparerBaseSim,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('[gl-sim:db] erreur :', err.message || err);
    process.exit(1);
  });
}
