require('dotenv').config();
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
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
      [process.env.DB_NAME || 'oliviera_foretmap']
    );
    if (!rows || rows.length === 0) {
      throw new Error('La table zones n\'a pas été créée. Vérifiez les erreurs MySQL ci-dessus ou exécutez sql/schema_foretmap.sql à la main (mysql -u user -p base < sql/schema_foretmap.sql).');
    }
  } finally {
    conn.release();
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
