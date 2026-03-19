require('dotenv').config();
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const logger = require('./lib/logger');

/** Errnos MySQL souvent attendus lors de migrations idempotentes (table/colonne/index déjà présents). */
const MYSQL_MIGRATION_EXPECTED_ERRNO = new Set([1050, 1060, 1061]);

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
    return;
  }
  logger.warn(
    { err, migrationFile, stmt: migrationStmtSnippet(stmt) },
    'Échec étape migration SQL'
  );
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
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
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
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
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
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));
    for (const stmt of statements) {
      try {
        await conn.query(stmt);
      } catch (err) {
        logMigrationStmtError(err, stmt, first);
      }
    }
    await conn.query('UPDATE schema_version SET version = ?', [parseInt(first.slice(0, 3), 10)]);
    current = parseInt(first.slice(0, 3), 10);
  }
  for (const file of files) {
    const num = parseInt(file.slice(0, 3), 10);
    if (num <= current) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));
    for (const stmt of statements) {
      try {
        await conn.query(stmt);
      } catch (err) {
        logMigrationStmtError(err, stmt, file);
      }
    }
    await conn.query('UPDATE schema_version SET version = ?', [num]);
  }
}

/**
 * Seed des données de démo si les tables sont vides (pas de migration destructive zone-*).
 */
async function seedData() {
  const zoneCount = await queryOne('SELECT COUNT(*) AS c FROM zones').then(r => r?.c ?? 0);
  if (zoneCount > 0) return;

  const iz = `INSERT INTO zones (id, name, x, y, width, height, current_plant, stage, special, shape) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const zones = [
    ['pg', 'Plantes Grasses', 183, 88, 56, 38, 'Cactus', 'growing', 0, 'rect'],
    ['aromatiques', 'Aromatiques (A)', 572, 258, 50, 46, 'Menthe', 'growing', 0, 'rect'],
    ['potager-n', 'Potager Nord', 478, 262, 88, 88, 'Tomate', 'growing', 0, 'rect'],
    ['potager-s', 'Potager Sud', 478, 356, 88, 88, 'Laitue', 'ready', 0, 'rect'],
    ['potager-ne', 'Potager Nord-Est', 572, 262, 88, 88, 'Carotte', 'growing', 0, 'rect'],
    ['potager-se', 'Potager Sud-Est', 572, 356, 88, 88, 'Basilic', 'growing', 0, 'rect'],
    ['butte-fleurie', 'Butte fleurie', 295, 108, 100, 100, '', 'special', 1, 'circle'],
    ['sa', 'Spirale Arom.', 430, 174, 36, 36, '', 'special', 1, 'circle'],
    ['compostage', 'Compostage', 472, 116, 42, 36, '', 'special', 1, 'rect'],
    ['cuve', 'Cuve à eau', 536, 95, 44, 33, '', 'special', 1, 'rect'],
    ['pergola', 'Pergola', 293, 205, 90, 68, '', 'special', 1, 'rect'],
    ['fumier', 'Fumier', 382, 262, 50, 55, '', 'special', 1, 'rect'],
    ['mare-g', 'Mare', 220, 258, 76, 104, '', 'special', 1, 'ellipse'],
    ['mare-b', 'Mare (bas)', 444, 470, 72, 44, '', 'special', 1, 'ellipse'],
    ['butte-b', 'Butte', 392, 444, 60, 36, '', 'special', 1, 'ellipse'],
    ['ruches', 'Ruches', 520, 447, 52, 50, '', 'special', 1, 'rect'],
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
    for (const p of plants) {
      await execute('INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)', p);
    }
  }

  const fmt = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  };
  const tasks = [
    [uuidv4(), 'Arroser les tomates', 'Arrosoir rouge, 2L par plant', 'potager-n', fmt(2), 2, 'available'],
    [uuidv4(), 'Récolter les laitues', 'Couper à la base avec les ciseaux verts', 'potager-s', fmt(1), 3, 'available'],
    [uuidv4(), 'Désherber Potager Sud-Est', 'Retirer les mauvaises herbes autour du basilic', 'potager-se', fmt(4), 2, 'available'],
  ];
  for (const t of tasks) {
    await execute(
      'INSERT INTO tasks (id, title, description, zone_id, due_date, required_students, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      t
    );
  }
}

/**
 * Initialise la BDD : schéma puis seed si tables vides.
 * À appeler au démarrage du serveur (ou une seule fois via npm run db:init).
 */
async function initDatabase() {
  await initSchema();
  await seedData();
}

module.exports = {
  pool,
  queryAll,
  queryOne,
  execute,
  ping,
  initSchema,
  seedData,
  initDatabase,
};
