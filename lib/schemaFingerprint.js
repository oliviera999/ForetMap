'use strict';

/**
 * Empreinte du schéma attendu et contrôle d'écart prod/dépôt (flux F7, novembre 2026).
 *
 * Pourquoi : la prod a déjà reçu des changements de structure écrits directement par le
 * connecteur (`foretmap_sql_execute`, DDL autorisé — décision d'Oliv du 22/11, inchangée),
 * sans migration. Une base fraîche construite par le dépôt divergeait alors de la prod sans que
 * personne ne le voie (dérive relevée le 20/11 : `plants.domestication`, `id_key_runs`…). Ce
 * module **signale** l'écart ; il ne bloque jamais rien (ni démarrage, ni CI, ni connecteur).
 *
 * Fonctionnement :
 *   - `readSchemaFingerprint` lit `information_schema` (métadonnées seulement, aucune ligne de
 *     données) et rend une empreinte stable : tables, colonnes (type, nullabilité, défaut — les
 *     valeurs d'ENUM et de SET sont dans le type), index, clés étrangères, noms des vues ;
 *   - l'empreinte attendue est **versionnée** (`sql/schema_fingerprint.json`) et régénérée
 *     depuis une base fraîche (`node scripts/schema-fingerprint.js --write`) ;
 *   - `compareFingerprints` rend les écarts (en plus / en moins / différents), avec les valeurs
 *     d'ENUM / SET ajoutées ou retirées à part ;
 *   - `getSchemaDrift` assemble le tout pour `npm run db:status`, le rapport de santé et
 *     `foretmap_db_status`.
 *
 * Périmètre : tables `gl_*` **exclues**, comme dans `foretmap_describe_schema` (même règle,
 * `GL_TABLE_RE`) — le schéma Gnomes & Licornes a ses propres garde-fous et ses tables ne se
 * reprennent pas depuis ForêtMap. Tables étrangères connues (`KNOWN_FOREIGN_TABLES`) exclues
 * aussi : elles vivent dans la même base mais n'appartiennent pas à l'application.
 *
 * Normalisation (MariaDB 10.11 en local, 11.4 en CI, MariaDB en prod) : largeur d'affichage
 * des entiers retirée (`int(10)` = `int`), défauts ramenés à une forme unique (`NULL`,
 * guillemets, `current_timestamp()`), collations et commentaires ignorés.
 */

const fs = require('fs');
const path = require('path');

const FINGERPRINT_FORMAT = 1;
const DEFAULT_FINGERPRINT_PATH = path.join(__dirname, '..', 'sql', 'schema_fingerprint.json');
const GL_TABLE_RE = /^gl_/i;

/**
 * Tables présentes dans la base de prod mais étrangères à l'application : jamais reprises en
 * migration, jamais signalées. Toute entrée se justifie ici.
 */
const KNOWN_FOREIGN_TABLES = Object.freeze({
  // Table d'un autre projet de l'hébergement (journal d'olution), 0 ligne, relevée le 20/11.
  doksvtal_zz_olution_fb_journal: 'table étrangère à ForêtMap (olution), hors dépôt',
});

const MIGRATION_HINT = 'à reprendre en migration';

const INTEGER_WIDTH_RE = /^(tinyint|smallint|mediumint|int|integer|bigint)\(\d+\)/;

/** `int(10) unsigned` → `int unsigned` ; le reste en minuscules sauf le contenu des ENUM/SET. */
function normalizeColumnType(columnType) {
  const raw = String(columnType || '').trim();
  const enumMatch = /^(enum|set)\((.*)\)$/is.exec(raw);
  if (enumMatch) return `${enumMatch[1].toLowerCase()}(${enumMatch[2]})`;
  return raw.toLowerCase().replace(INTEGER_WIDTH_RE, '$1');
}

/** Défaut SQL ramené à une forme unique : `null`, chaîne sans guillemets, `current_timestamp`. */
function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (/^null$/i.test(raw)) return null;
  if (/^current_timestamp(\(\d*\))?$/i.test(raw)) return 'current_timestamp';
  const quoted = /^'(.*)'$/s.exec(raw);
  if (quoted) return quoted[1].replace(/''/g, "'");
  return raw;
}

/** `enum('a','b')` / `set('a','b')` → ['a', 'b'] ; `null` pour un autre type. */
function parseEnumValues(columnType) {
  const inner = /^(?:enum|set)\((.*)\)$/is.exec(String(columnType || '').trim());
  if (!inner) return null;
  return [...inner[1].matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
}

function isExcludedTable(name, { includeGl = false } = {}) {
  const table = String(name);
  if (!includeGl && GL_TABLE_RE.test(table)) return true;
  return Object.prototype.hasOwnProperty.call(KNOWN_FOREIGN_TABLES, table);
}

function sortObject(obj) {
  return Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((k) => [k, obj[k]]),
  );
}

/**
 * Lit l'empreinte de la base courante (`DATABASE()`).
 * @param {{ queryAll: (sql: string, params?: unknown[]) => Promise<any[]> }} db
 * @param {{ includeGl?: boolean }} [options]
 */
async function readSchemaFingerprint(db, options = {}) {
  const keep = (t) => !isExcludedTable(t, options);
  const tableRows = await db.queryAll(
    `SELECT TABLE_NAME AS t, TABLE_TYPE AS type FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const tables = {};
  const views = [];
  for (const row of tableRows) {
    if (!keep(row.t)) continue;
    if (String(row.type).toUpperCase() === 'VIEW') views.push(String(row.t));
    else tables[row.t] = { columns: {}, indexes: {}, foreignKeys: {} };
  }

  const columnRows = await db.queryAll(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS ct, IS_NULLABLE AS n,
            COLUMN_DEFAULT AS d
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
  );
  for (const row of columnRows) {
    const table = tables[row.t];
    if (!table) continue;
    table.columns[row.c] = {
      type: normalizeColumnType(row.ct),
      nullable: String(row.n).toUpperCase() === 'YES',
      default: normalizeDefault(row.d),
    };
  }

  const indexRows = await db.queryAll(
    `SELECT TABLE_NAME AS t, INDEX_NAME AS name, NON_UNIQUE AS nu, COLUMN_NAME AS c,
            SUB_PART AS sub
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
  );
  for (const row of indexRows) {
    const table = tables[row.t];
    if (!table) continue;
    const index = table.indexes[row.name] || {
      unique: Number(row.nu) === 0,
      columns: [],
    };
    index.columns.push(row.sub != null ? `${row.c}(${Number(row.sub)})` : String(row.c));
    table.indexes[row.name] = index;
  }

  const fkRows = await db.queryAll(
    `SELECT k.TABLE_NAME AS t, k.CONSTRAINT_NAME AS name, k.COLUMN_NAME AS c,
            k.REFERENCED_TABLE_NAME AS rt, k.REFERENCED_COLUMN_NAME AS rc, r.DELETE_RULE AS del,
            r.UPDATE_RULE AS upd
       FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.REFERENTIAL_CONSTRAINTS r
         ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
        AND r.TABLE_NAME = k.TABLE_NAME
      WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`,
  );
  for (const row of fkRows) {
    const table = tables[row.t];
    if (!table) continue;
    const fk = table.foreignKeys[row.name] || {
      columns: [],
      references: String(row.rt),
      referencedColumns: [],
      onDelete: String(row.del || 'RESTRICT').toUpperCase(),
      onUpdate: String(row.upd || 'RESTRICT').toUpperCase(),
    };
    fk.columns.push(String(row.c));
    fk.referencedColumns.push(String(row.rc));
    table.foreignKeys[row.name] = fk;
  }

  const sortedTables = {};
  for (const name of Object.keys(tables).sort()) {
    const t = tables[name];
    sortedTables[name] = {
      columns: t.columns,
      indexes: sortObject(t.indexes),
      foreignKeys: sortObject(t.foreignKeys),
    };
  }
  return { tables: sortedTables, views: views.sort() };
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Écarts entre l'empreinte attendue (dépôt) et l'empreinte réelle (base).
 * « En plus » = dans la base, absent du dépôt ; « en moins » = attendu, absent de la base.
 * @returns {{ ok: boolean, total: number, tables: object, columns: object, enumValues: object,
 *   indexes: object, foreignKeys: object, views: object }}
 */
function compareFingerprints(expected, actual) {
  const exp = expected?.tables || {};
  const act = actual?.tables || {};
  const out = {
    tables: { extra: [], missing: [] },
    columns: { extra: [], missing: [], changed: [] },
    enumValues: { extra: [], missing: [], reordered: [] },
    indexes: { extra: [], missing: [], changed: [] },
    foreignKeys: { extra: [], missing: [], changed: [] },
    views: { extra: [], missing: [] },
  };

  for (const name of Object.keys(act)) if (!exp[name]) out.tables.extra.push(name);
  for (const name of Object.keys(exp)) if (!act[name]) out.tables.missing.push(name);

  for (const name of Object.keys(exp)) {
    const e = exp[name];
    const a = act[name];
    if (!a) continue;
    for (const col of Object.keys(a.columns)) {
      if (!e.columns[col]) out.columns.extra.push({ table: name, column: col, ...a.columns[col] });
    }
    for (const col of Object.keys(e.columns)) {
      const ec = e.columns[col];
      const ac = a.columns[col];
      if (!ac) {
        out.columns.missing.push({ table: name, column: col, ...ec });
        continue;
      }
      const ev = parseEnumValues(ec.type);
      const av = parseEnumValues(ac.type);
      const sameKind = ev && av && ec.type.slice(0, 3) === ac.type.slice(0, 3);
      if (sameKind && !sameJson(ev, av)) {
        const extra = av.filter((v) => !ev.includes(v));
        const missing = ev.filter((v) => !av.includes(v));
        if (extra.length) out.enumValues.extra.push({ table: name, column: col, values: extra });
        if (missing.length) {
          out.enumValues.missing.push({ table: name, column: col, values: missing });
        }
        if (!extra.length && !missing.length) {
          out.enumValues.reordered.push({ table: name, column: col, expected: ev, actual: av });
        }
      } else if (ec.type !== ac.type) {
        out.columns.changed.push({
          table: name,
          column: col,
          field: 'type',
          expected: ec.type,
          actual: ac.type,
        });
      }
      for (const field of ['nullable', 'default']) {
        if (ec[field] !== ac[field]) {
          out.columns.changed.push({
            table: name,
            column: col,
            field,
            expected: ec[field],
            actual: ac[field],
          });
        }
      }
    }
    for (const kind of ['indexes', 'foreignKeys']) {
      const ek = e[kind] || {};
      const ak = a[kind] || {};
      for (const key of Object.keys(ak)) {
        if (!ek[key]) out[kind].extra.push({ table: name, name: key, ...ak[key] });
      }
      for (const key of Object.keys(ek)) {
        if (!ak[key]) out[kind].missing.push({ table: name, name: key, ...ek[key] });
        else if (!sameJson(ek[key], ak[key])) {
          out[kind].changed.push({ table: name, name: key, expected: ek[key], actual: ak[key] });
        }
      }
    }
  }

  const ev = new Set(expected?.views || []);
  const av = new Set(actual?.views || []);
  out.views.extra = [...av].filter((v) => !ev.has(v));
  out.views.missing = [...ev].filter((v) => !av.has(v));

  let total = 0;
  for (const group of Object.values(out)) {
    for (const list of Object.values(group)) total += list.length;
  }
  return { ok: total === 0, total, ...out };
}

const colLabel = (x) => `${x.table}.${x.column}`;
const idxLabel = (x) => `${x.table}.${x.name}`;

/**
 * Phrases lisibles (français), une par catégorie non vide, chacune terminée par
 * « à reprendre en migration ».
 * @param {ReturnType<typeof compareFingerprints>} diff
 * @returns {string[]}
 */
function describeDrift(diff) {
  if (!diff || diff.ok) return [];
  const lines = [];
  const push = (label, items) => {
    if (items.length) lines.push(`${label} : ${items.join(', ')} — ${MIGRATION_HINT}.`);
  };
  push('Tables en plus dans la base', diff.tables.extra);
  push('Tables en moins dans la base', diff.tables.missing);
  push('Colonnes en plus', diff.columns.extra.map(colLabel));
  push('Colonnes en moins', diff.columns.missing.map(colLabel));
  push(
    'Colonnes différentes',
    diff.columns.changed.map(
      (x) =>
        `${colLabel(x)} (${x.field} attendu ${JSON.stringify(x.expected)}, réel ${JSON.stringify(x.actual)})`,
    ),
  );
  push(
    "Valeurs d'ENUM/SET en plus",
    diff.enumValues.extra.map((x) => `${colLabel(x)} [${x.values.join(', ')}]`),
  );
  push(
    "Valeurs d'ENUM/SET en moins",
    diff.enumValues.missing.map((x) => `${colLabel(x)} [${x.values.join(', ')}]`),
  );
  push("Valeurs d'ENUM/SET dans un autre ordre", diff.enumValues.reordered.map(colLabel));
  push('Index en plus', diff.indexes.extra.map(idxLabel));
  push('Index en moins', diff.indexes.missing.map(idxLabel));
  push('Index différents', diff.indexes.changed.map(idxLabel));
  push('Clés étrangères en plus', diff.foreignKeys.extra.map(idxLabel));
  push('Clés étrangères en moins', diff.foreignKeys.missing.map(idxLabel));
  push('Clés étrangères différentes', diff.foreignKeys.changed.map(idxLabel));
  push('Vues en plus', diff.views.extra);
  push('Vues en moins', diff.views.missing);
  return lines;
}

/** Empreinte versionnée, ou `null` si le fichier est absent ou illisible. */
function loadExpectedFingerprint(file = DEFAULT_FINGERPRINT_PATH) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && parsed.tables ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Document à versionner : empreinte + dernier fichier de migration couvert.
 * @param {object} fingerprint résultat de `readSchemaFingerprint`
 * @param {{ migration?: string|null }} [meta]
 */
function buildFingerprintDocument(fingerprint, { migration = null } = {}) {
  return {
    format: FINGERPRINT_FORMAT,
    description:
      'Empreinte du schéma attendu (base fraîche du dépôt), hors tables gl_* et tables étrangères connues. ' +
      'Régénérer : node scripts/schema-fingerprint.js --write (sur une base fraîche à jour).',
    migration,
    tables: fingerprint.tables,
    views: fingerprint.views,
  };
}

const MIGRATION_NUMBER_RE = /^(\d{3})_/;

/**
 * Contrôle complet pour une base : jamais d'exception (le signalement ne doit rien casser).
 * @param {{ queryAll: Function, queryOne?: Function }} db
 * @param {{ fingerprintPath?: string, currentVersion?: number|null }} [options]
 *   `currentVersion` : `schema_version` déjà lu ; une base en retard sur l'empreinte est
 *   marquée `stale` (les écarts attendus d'une migration non appliquée ne sont pas une dérive).
 */
async function getSchemaDrift(
  db,
  { fingerprintPath = DEFAULT_FINGERPRINT_PATH, currentVersion } = {},
) {
  const expected = loadExpectedFingerprint(fingerprintPath);
  if (!expected) {
    return { available: false, ok: null, reason: 'empreinte versionnée absente ou illisible' };
  }
  try {
    const actual = await readSchemaFingerprint(db);
    const diff = compareFingerprints(expected, actual);
    const m = MIGRATION_NUMBER_RE.exec(String(expected.migration || ''));
    const expectedVersion = m ? Number.parseInt(m[1], 10) : null;
    const stale =
      expectedVersion !== null &&
      Number.isFinite(Number(currentVersion)) &&
      currentVersion !== null &&
      Number(currentVersion) < expectedVersion;
    return {
      available: true,
      ok: diff.ok,
      total: diff.total,
      stale,
      expected_migration: expected.migration || null,
      excluded: {
        prefixes: ['gl_'],
        tables: Object.keys(KNOWN_FOREIGN_TABLES),
      },
      messages: describeDrift(diff),
      diff,
    };
  } catch (err) {
    return { available: false, ok: null, reason: `lecture impossible : ${err.message}` };
  }
}

module.exports = {
  DEFAULT_FINGERPRINT_PATH,
  FINGERPRINT_FORMAT,
  GL_TABLE_RE,
  KNOWN_FOREIGN_TABLES,
  MIGRATION_HINT,
  buildFingerprintDocument,
  compareFingerprints,
  describeDrift,
  getSchemaDrift,
  isExcludedTable,
  loadExpectedFingerprint,
  normalizeColumnType,
  normalizeDefault,
  parseEnumValues,
  readSchemaFingerprint,
};
