const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const db = new Database(path.join(__dirname, 'foretmap.db'));

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS zones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      x REAL, y REAL, width REAL, height REAL,
      current_plant TEXT DEFAULT '',
      stage TEXT DEFAULT 'empty',
      special INTEGER DEFAULT 0,
      shape TEXT DEFAULT 'rect'
    );
    CREATE TABLE IF NOT EXISTS zone_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_id TEXT NOT NULL,
      plant TEXT NOT NULL,
      harvested_at TEXT NOT NULL,
      FOREIGN KEY (zone_id) REFERENCES zones(id)
    );
    CREATE TABLE IF NOT EXISTS plants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      emoji TEXT,
      description TEXT
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      zone_id TEXT,
      due_date TEXT,
      required_students INTEGER DEFAULT 1,
      status TEXT DEFAULT 'available',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS task_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      student_first_name TEXT NOT NULL,
      student_last_name TEXT NOT NULL,
      assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      password TEXT,
      last_seen TEXT
    );
    CREATE TABLE IF NOT EXISTS task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      student_first_name TEXT NOT NULL,
      student_last_name TEXT NOT NULL,
      comment TEXT,
      image_data TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );
  `);

  // Migrations for existing DBs
  try { db.exec(`ALTER TABLE zones    ADD COLUMN shape    TEXT DEFAULT 'rect'`); } catch(e) {}
  try { db.exec(`ALTER TABLE students ADD COLUMN password TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE zones    ADD COLUMN points      TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE zones    ADD COLUMN color       TEXT DEFAULT '#86efac80'`); } catch(e) {}
  try { db.exec(`ALTER TABLE zones    ADD COLUMN description TEXT DEFAULT ''`); } catch(e) {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS zone_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_id TEXT NOT NULL,
      image_data TEXT NOT NULL,
      caption TEXT DEFAULT '',
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (zone_id) REFERENCES zones(id)
    );
  `);

  // Map markers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS map_markers (
      id TEXT PRIMARY KEY,
      x_pct REAL NOT NULL,
      y_pct REAL NOT NULL,
      label TEXT NOT NULL,
      plant_name TEXT DEFAULT '',
      note TEXT DEFAULT '',
      emoji TEXT DEFAULT '🌱',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Auto-migrate old zone schema (zone-a, zone-b…) → real garden layout
  const firstZone = db.prepare('SELECT id FROM zones LIMIT 1').get();
  if (firstZone && firstZone.id.startsWith('zone-')) {
    console.log('🔄 Migration vers le plan réel du jardin...');
    db.prepare('DELETE FROM task_logs').run();
    db.prepare('DELETE FROM task_assignments').run();
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM zone_history').run();
    db.prepare('DELETE FROM zones').run();
    seedData();
  } else if (!firstZone) {
    seedData();
  }
}

function seedData() {
  // SVG viewBox 0 0 740 528 — diagonal fence (138,58)→(362,514)
  // cols: id, name, x, y, w, h, plant, stage, special, shape
  const iz = db.prepare(`
    INSERT INTO zones (id, name, x, y, width, height, current_plant, stage, special, shape)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    // Cultivable zones
    ['pg',           'Plantes Grasses',    183,  88,  56,  38, 'Cactus',  'growing', 0, 'rect'   ],
    ['aromatiques',  'Aromatiques (A)',    572, 258,  50,  46, 'Menthe',  'growing', 0, 'rect'   ],
    ['potager-n',    'Potager Nord',       478, 262,  88,  88, 'Tomate',  'growing', 0, 'rect'   ],
    ['potager-s',    'Potager Sud',        478, 356,  88,  88, 'Laitue',  'ready',   0, 'rect'   ],
    ['potager-ne',   'Potager Nord-Est',   572, 262,  88,  88, 'Carotte', 'growing', 0, 'rect'   ],
    ['potager-se',   'Potager Sud-Est',    572, 356,  88,  88, 'Basilic', 'growing', 0, 'rect'   ],
    // Special zones
    ['butte-fleurie','Butte fleurie',      295, 108, 100, 100, '',        'special', 1, 'circle' ],
    ['sa',           'Spirale Arom.',      430, 174,  36,  36, '',        'special', 1, 'circle' ],
    ['compostage',   'Compostage',         472, 116,  42,  36, '',        'special', 1, 'rect'   ],
    ['cuve',         'Cuve à eau',         536,  95,  44,  33, '',        'special', 1, 'rect'   ],
    ['pergola',      'Pergola',            293, 205,  90,  68, '',        'special', 1, 'rect'   ],
    ['fumier',       'Fumier',             382, 262,  50,  55, '',        'special', 1, 'rect'   ],
    ['mare-g',       'Mare',               220, 258,  76, 104, '',        'special', 1, 'ellipse'],
    ['mare-b',       'Mare (bas)',         444, 470,  72,  44, '',        'special', 1, 'ellipse'],
    ['butte-b',      'Butte',              392, 444,  60,  36, '',        'special', 1, 'ellipse'],
    ['ruches',       'Ruches',             520, 447,  52,  50, '',        'special', 1, 'rect'   ],
  ].forEach(z => iz.run(...z));

  const ih = db.prepare('INSERT INTO zone_history (zone_id, plant, harvested_at) VALUES (?, ?, ?)');
  ih.run('potager-n',  'Poivron', '2024-11-15');
  ih.run('potager-s',  'Radis',   '2025-01-20');
  ih.run('potager-ne', 'Persil',  '2024-12-10');
  ih.run('aromatiques','Basilic', '2025-02-10');

  const plantsCount = db.prepare('SELECT COUNT(*) as c FROM plants').get().c;
  if (plantsCount === 0) {
    const ip = db.prepare('INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)');
    [
      ['Laitue',     '🥬', 'Feuilles larges et tendres, vert clair. Se récolte avant la montée en graines.'],
      ['Carotte',    '🥕', 'Feuillage fin et plumeux. La racine orange se voit à la base du plant.'],
      ['Tomate',     '🍅', 'Tiges poilues, odeur forte. Fruits rouges à maturité, verts avant.'],
      ['Basilic',    '🌿', 'Grandes feuilles ovales, brillantes, vert intense. Odeur très aromatique.'],
      ['Menthe',     '🌱', 'Petites feuilles dentées, très parfumées. Se propage rapidement.'],
      ['Courgette',  '🥒', 'Grandes feuilles en étoile. Fleurs jaunes, fruits verts allongés.'],
      ['Radis',      '🔴', 'Pousse rapide. Petites feuilles rugueuses, racine rouge visible.'],
      ['Persil',     '🌿', 'Feuilles finement découpées, vert foncé, arôme frais.'],
      ['Haricot',    '🫘', 'Tige grimpante ou buissonnante. Gousses vertes allongées.'],
      ['Fraisier',   '🍓', 'Feuilles trilobées, stolons rampants. Petits fruits rouges parfumés.'],
      ['Romarin',    '🌿', 'Feuilles en aiguilles, très aromatiques, tiges ligneuses.'],
      ['Sauge',      '🌿', 'Feuilles grises-vertes, veloutées, odeur camphrée.'],
      ['Ciboulette', '🌱', 'Tiges cylindriques creuses, vert brillant, goût d\'oignon doux.'],
      ['Poivron',    '🫑', 'Feuilles luisantes, fruits charnus rouges, jaunes ou verts.'],
      ['Concombre',  '🥒', 'Tiges grimpantes, grandes feuilles rugueuses, fruits allongés.'],
      ['Épinard',    '🥬', 'Feuilles lisses ou frisées, vert foncé, riches en fer.'],
      ['Cactus',     '🌵', 'Tiges charnues et épineuses, stocke l\'eau. Résistant à la sécheresse.'],
    ].forEach(p => ip.run(...p));
  }

  const fmt = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };
  const it  = db.prepare('INSERT INTO tasks (id, title, description, zone_id, due_date, required_students, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
  it.run(uuidv4(), 'Arroser les tomates',      'Arrosoir rouge, 2L par plant',                  'potager-n',  fmt(2), 2, 'available');
  it.run(uuidv4(), 'Récolter les laitues',      'Couper à la base avec les ciseaux verts',        'potager-s',  fmt(1), 3, 'available');
  it.run(uuidv4(), 'Désherber Potager Sud-Est', 'Retirer les mauvaises herbes autour du basilic', 'potager-se', fmt(4), 2, 'available');
}

module.exports = { db, initDatabase };
