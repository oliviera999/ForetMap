require('dotenv').config();
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const logger = require('./lib/logger');

/** Errnos MySQL souvent attendus lors de migrations idempotentes (table/colonne/index déjà présents ou legacy absent). */
const MYSQL_MIGRATION_EXPECTED_ERRNO = new Set([1050, 1060, 1061, 1091, 1146, 1826]);

function migrationStmtSnippet(stmt) {
  const s = (stmt || '').replace(/\s+/g, ' ').trim();
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

function logMigrationStmtError(err, stmt, migrationFile) {
  const num = typeof err.errno === 'number' ? err.errno : null;
  if (num != null && MYSQL_MIGRATION_EXPECTED_ERRNO.has(num)) {
    logger.debug(
      { err, migrationFile, stmt: migrationStmtSnippet(stmt) },
      'Étape migration ignorée (déjà appliquée)'
    );
    return true;
  }
  logger.warn(
    { err, migrationFile, stmt: migrationStmtSnippet(stmt) },
    'Échec étape migration SQL'
  );
  return false;
}

function safePort(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 && n <= 65535 ? n : fallback;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: safePort(process.env.DB_PORT, 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 30,
  queueLimit: String(process.env.NODE_ENV || '').trim().toLowerCase() === 'test' ? 0 : 200,
  charset: 'utf8mb4',
});

// Empêche les erreurs de connexion idle de devenir des uncaughtException
pool.on('error', (err) => {
  logger.error({ err }, 'Erreur pool MySQL (connexion perdue)');
});

/** Exécute une requête et retourne les lignes (tableau). */
async function queryAll(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return Array.isArray(rows) ? rows : [];
}

/** Exécute une requête et retourne la première ligne ou undefined. */
async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows[0];
}

/**
 * Exécute une requête (INSERT/UPDATE/DELETE).
 * Retourne { insertId, affectedRows }.
 */
async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return {
    insertId: result.insertId,
    affectedRows: result.affectedRows,
  };
}

async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tx = {
      queryAll: async (sql, params = []) => {
        const [rows] = await conn.execute(sql, params);
        return Array.isArray(rows) ? rows : [];
      },
      queryOne: async (sql, params = []) => {
        const [rows] = await conn.execute(sql, params);
        return Array.isArray(rows) ? rows[0] : undefined;
      },
      execute: async (sql, params = []) => {
        const [result] = await conn.execute(sql, params);
        return {
          insertId: result.insertId,
          affectedRows: result.affectedRows,
        };
      },
    };
    const result = await work(tx);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      // Ignore rollback errors and propagate root cause.
    }
    throw err;
  } finally {
    conn.release();
  }
}

/** Vérifie que la connexion MySQL fonctionne. */
async function ping() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

/**
 * Retire les commentaires SQL (-- ligne et /* bloc *\/) d'un fragment SQL
 * pour éviter que des lignes de commentaire en tête de statement ne fassent
 * filtrer le vrai SQL qui suit.
 */
function stripSqlComments(fragment) {
  // Retire les commentaires de bloc /* ... */ (non greedy)
  let s = fragment.replace(/\/\*[\s\S]*?\*\//g, '');
  // Retire les commentaires de ligne -- jusqu'à la fin de ligne
  s = s.replace(/--[^\r\n]*/g, '');
  return s.trim();
}

/**
 * Découpe un script SQL en statements en ignorant les ';' à l'intérieur
 * des chaînes (`'...'`, `"..."`, `` `...` ``) et des commentaires.
 */
function splitSqlStatements(sqlText) {
  const statements = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sqlText.length; i += 1) {
    const ch = sqlText[i];
    const next = i + 1 < sqlText.length ? sqlText[i + 1] : '';
    const prev = i > 0 ? sqlText[i - 1] : '';

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        current += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === '-' && next === '-' && (i === 0 || /\s/.test(prev))) {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i += 1;
        continue;
      }
      if (ch === ';') {
        const stmt = stripSqlComments(current);
        if (stmt) statements.push(stmt);
        current = '';
        continue;
      }
    }

    current += ch;

    if (!inDouble && !inBacktick && ch === "'") {
      // MySQL autorise '' comme quote échappée.
      if (inSingle && next === "'") {
        current += next;
        i += 1;
        continue;
      }
      if (prev !== '\\') inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inBacktick && ch === '"') {
      if (prev !== '\\') inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && ch === '`') {
      if (inBacktick && next === '`') {
        current += next;
        i += 1;
        continue;
      }
      inBacktick = !inBacktick;
    }
  }

  const tail = stripSqlComments(current);
  if (tail) statements.push(tail);
  return statements;
}

/**
 * Initialise le schéma MySQL (tables) à partir de sql/schema_foretmap.sql.
 * Idempotent : peut être rappelé sans effet de bord si les tables existent déjà.
 * @throws si le fichier est introuvable ou si l'exécution SQL échoue
 */
async function initSchema() {
  const schemaPath = path.join(__dirname, 'sql', 'schema_foretmap.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(
      `Fichier introuvable: ${schemaPath}\n` +
      'Vérifiez que le dossier sql/ et le fichier schema_foretmap.sql sont bien déployés sur le serveur.'
    );
  }
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const statements = splitSqlStatements(sql);
  const conn = await pool.getConnection();
  try {
    for (const stmt of statements) {
      if (stmt) await conn.query(stmt);
    }
    const [rows] = await conn.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = 'zones'",
      [process.env.DB_NAME]
    );
    if (!rows || rows.length === 0) {
      throw new Error('La table zones n\'a pas été créée. Vérifiez les erreurs MySQL ci-dessus ou exécutez sql/schema_foretmap.sql à la main (mysql -u user -p base < sql/schema_foretmap.sql).');
    }
    await runMigrations(conn);
  } finally {
    conn.release();
  }
}

/**
 * Exécute les migrations du dossier migrations/ (fichiers 001_xxx.sql, 002_xxx.sql, ...).
 * Utilise la table schema_version pour ne ré-exécuter que les migrations manquantes.
 */
async function runMigrations(conn) {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) return;
  const files = fs.readdirSync(migrationsDir)
    .filter(f => /^\d{3}_.*\.sql$/.test(f))
    .sort();
  let current = -1;
  try {
    const [rows] = await conn.query('SELECT version FROM schema_version LIMIT 1');
    if (rows && rows[0]) current = rows[0].version;
  } catch (e) {
    if (e.errno === 1146 || e.code === 'ER_NO_SUCH_TABLE') {
      logger.debug({ err: e }, 'Table schema_version absente (première migration)');
    } else {
      logger.warn({ err: e }, 'Lecture schema_version en échec');
    }
  }
  if (current < 0 && files.length > 0) {
    const first = files[0];
    const sql = fs.readFileSync(path.join(migrationsDir, first), 'utf8');
    const statements = splitSqlStatements(sql);
    for (const stmt of statements) {
      try {
        await conn.query(stmt);
      } catch (err) {
        const ignored = logMigrationStmtError(err, stmt, first);
        if (!ignored) throw err;
      }
    }
    await conn.query('UPDATE schema_version SET version = ?', [parseInt(first.slice(0, 3), 10)]);
    current = parseInt(first.slice(0, 3), 10);
  }
  for (const file of files) {
    const num = parseInt(file.slice(0, 3), 10);
    if (num <= current) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const statements = splitSqlStatements(sql);
    for (const stmt of statements) {
      try {
        await conn.query(stmt);
      } catch (err) {
        const ignored = logMigrationStmtError(err, stmt, file);
        if (!ignored) throw err;
      }
    }
    await conn.query('UPDATE schema_version SET version = ?', [num]);
  }
}

/**
 * Seed des données de démo si les tables sont vides (pas de migration destructive zone-*).
 */
async function seedData() {
  await execute(
    'INSERT IGNORE INTO maps (id, label, map_image_url, sort_order) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
    ['foret', 'Forêt comestible', '/maps/map-foret.svg', 1, 'n3', 'N3', '/maps/plan%20n3.jpg', 2]
  );

  const zoneCount = await queryOne('SELECT COUNT(*) AS c FROM zones').then(r => r?.c ?? 0);
  if (zoneCount > 0) return;

  const iz = `INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const zones = [
    ['pg', 'foret', 'Plantes Grasses', 183, 88, 56, 38, 'Cactus', 'growing', 0, 'rect'],
    ['aromatiques', 'foret', 'Aromatiques (A)', 572, 258, 50, 46, 'Menthe', 'growing', 0, 'rect'],
    ['potager-n', 'foret', 'Potager Nord', 478, 262, 88, 88, 'Tomate', 'growing', 0, 'rect'],
    ['potager-s', 'foret', 'Potager Sud', 478, 356, 88, 88, 'Laitue', 'ready', 0, 'rect'],
    ['potager-ne', 'foret', 'Potager Nord-Est', 572, 262, 88, 88, 'Carotte', 'growing', 0, 'rect'],
    ['potager-se', 'foret', 'Potager Sud-Est', 572, 356, 88, 88, 'Basilic', 'growing', 0, 'rect'],
    ['butte-fleurie', 'foret', 'Butte fleurie', 295, 108, 100, 100, '', 'special', 1, 'circle'],
    ['sa', 'foret', 'Spirale Arom.', 430, 174, 36, 36, '', 'special', 1, 'circle'],
    ['compostage', 'foret', 'Compostage', 472, 116, 42, 36, '', 'special', 1, 'rect'],
    ['cuve', 'foret', 'Cuve à eau', 536, 95, 44, 33, '', 'special', 1, 'rect'],
    ['pergola', 'foret', 'Pergola', 293, 205, 90, 68, '', 'special', 1, 'rect'],
    ['fumier', 'foret', 'Fumier', 382, 262, 50, 55, '', 'special', 1, 'rect'],
    ['mare-g', 'foret', 'Mare', 220, 258, 76, 104, '', 'special', 1, 'ellipse'],
    ['mare-b', 'foret', 'Mare (bas)', 444, 470, 72, 44, '', 'special', 1, 'ellipse'],
    ['butte-b', 'foret', 'Butte', 392, 444, 60, 36, '', 'special', 1, 'ellipse'],
    ['ruches', 'foret', 'Ruches', 520, 447, 52, 50, '', 'special', 1, 'rect'],
  ];
  for (const z of zones) {
    await execute(iz, z);
  }

  await execute('INSERT INTO zone_history (zone_id, plant, harvested_at) VALUES (?, ?, ?)', ['potager-n', 'Poivron', '2024-11-15']);
  await execute('INSERT INTO zone_history (zone_id, plant, harvested_at) VALUES (?, ?, ?)', ['potager-s', 'Radis', '2025-01-20']);
  await execute('INSERT INTO zone_history (zone_id, plant, harvested_at) VALUES (?, ?, ?)', ['potager-ne', 'Persil', '2024-12-10']);
  await execute('INSERT INTO zone_history (zone_id, plant, harvested_at) VALUES (?, ?, ?)', ['aromatiques', 'Basilic', '2025-02-10']);

  const plantsCount = await queryOne('SELECT COUNT(*) AS c FROM plants').then(r => r?.c ?? 0);
  if (plantsCount === 0) {
    const plants = [
      ['Laitue', '🥬', 'Feuilles larges et tendres, vert clair. Se récolte avant la montée en graines.'],
      ['Carotte', '🥕', 'Feuillage fin et plumeux. La racine orange se voit à la base du plant.'],
      ['Tomate', '🍅', 'Tiges poilues, odeur forte. Fruits rouges à maturité, verts avant.'],
      ['Basilic', '🌿', 'Grandes feuilles ovales, brillantes, vert intense. Odeur très aromatique.'],
      ['Menthe', '🌱', 'Petites feuilles dentées, très parfumées. Se propage rapidement.'],
      ['Courgette', '🥒', 'Grandes feuilles en étoile. Fleurs jaunes, fruits verts allongés.'],
      ['Radis', '🔴', 'Pousse rapide. Petites feuilles rugueuses, racine rouge visible.'],
      ['Persil', '🌿', 'Feuilles finement découpées, vert foncé, arôme frais.'],
      ['Haricot', '🫘', 'Tige grimpante ou buissonnante. Gousses vertes allongées.'],
      ['Fraisier', '🍓', 'Feuilles trilobées, stolons rampants. Petits fruits rouges parfumés.'],
      ['Romarin', '🌿', 'Feuilles en aiguilles, très aromatiques, tiges ligneuses.'],
      ['Sauge', '🌿', 'Feuilles grises-vertes, veloutées, odeur camphrée.'],
      ['Ciboulette', '🌱', 'Tiges cylindriques creuses, vert brillant, goût d\'oignon doux.'],
      ['Poivron', '🫑', 'Feuilles luisantes, fruits charnus rouges, jaunes ou verts.'],
      ['Concombre', '🥒', 'Tiges grimpantes, grandes feuilles rugueuses, fruits allongés.'],
      ['Épinard', '🥬', 'Feuilles lisses ou frisées, vert foncé, riches en fer.'],
      ['Cactus', '🌵', 'Tiges charnues et épineuses, stocke l\'eau. Résistant à la sécheresse.'],
    ];
    const insertPlantSql = `
      INSERT INTO plants (
        name, emoji, description, second_name, scientific_name, group_1, group_2, group_3,
        habitat, photo, nutrition, agroecosystem_category, longevity, remark_1, remark_2, remark_3,
        reproduction, size, sources, ideal_temperature_c, optimal_ph, ecosystem_role, geographic_origin,
        human_utility, harvest_part, planting_recommendations, preferred_nutrients,
        photo_species, photo_leaf, photo_flower, photo_fruit, photo_harvest_part
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    for (const p of plants) {
      await execute(insertPlantSql, [
        p[0], p[1], p[2], null, null, null, null, null, null, null, null, null, null, null, null, null,
        null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
      ]);
    }
  }

  const fmt = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  };
  const now = new Date().toISOString();
  const tasks = [
    [uuidv4(), 'Arroser les tomates', 'Arrosoir rouge, 2L par plant', 'foret', 'potager-n', fmt(2), 2, 'available', now],
    [uuidv4(), 'Récolter les laitues', 'Couper à la base avec les ciseaux verts', 'foret', 'potager-s', fmt(1), 3, 'available', now],
    [uuidv4(), 'Désherber Potager Sud-Est', 'Retirer les mauvaises herbes autour du basilic', 'foret', 'potager-se', fmt(4), 2, 'available', now],
  ];
  for (const t of tasks) {
    await execute(
      'INSERT INTO tasks (id, title, description, map_id, zone_id, due_date, required_students, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      t
    );
  }
  await execute(
    'INSERT IGNORE INTO task_zones (task_id, zone_id) SELECT id, zone_id FROM tasks WHERE zone_id IS NOT NULL'
  );
}

/**
 * Vérifie la connectivité BDD au démarrage du serveur.
 * La création des tables et le seed sont gérés via `npm run db:init`.
 */
async function initDatabase() {
  await ping();
}

module.exports = {
  pool,
  queryAll,
  queryOne,
  execute,
  withTransaction,
  ping,
  initSchema,
  seedData,
  initDatabase,
};
