const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');
const { db, initDatabase } = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

initDatabase();

// ─── ZONES ────────────────────────────────────────────────────────────────────

app.get('/api/zones', (req, res) => {
  const zones   = db.prepare('SELECT * FROM zones').all();
  const history = db.prepare('SELECT * FROM zone_history ORDER BY harvested_at DESC').all();
  const result  = zones.map(z => ({
    ...z,
    special: !!z.special,
    history: history.filter(h => h.zone_id === z.id)
  }));
  res.json(result);
});

app.get('/api/zones/:id', (req, res) => {
  const zone = db.prepare('SELECT * FROM zones WHERE id = ?').get(req.params.id);
  if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
  const history = db.prepare(
    'SELECT * FROM zone_history WHERE zone_id = ? ORDER BY harvested_at DESC'
  ).all(req.params.id);
  res.json({ ...zone, special: !!zone.special, history });
});

app.put('/api/zones/:id', (req, res) => {
  const zone = db.prepare('SELECT * FROM zones WHERE id = ?').get(req.params.id);
  if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
  const { current_plant, stage, description, points, color } = req.body;
  if (zone.current_plant && current_plant !== undefined &&
      zone.current_plant !== current_plant && zone.current_plant.trim() !== '') {
    db.prepare('INSERT INTO zone_history (zone_id, plant, harvested_at) VALUES (?, ?, ?)')
      .run(zone.id, zone.current_plant, new Date().toISOString().split('T')[0]);
  }
  db.prepare(`UPDATE zones SET current_plant=?, stage=?, description=?, points=?, color=? WHERE id=?`)
    .run(
      current_plant  ?? zone.current_plant,
      stage          ?? zone.stage,
      description    !== undefined ? description : (zone.description ?? ''),
      points         !== undefined ? JSON.stringify(points) : zone.points,
      color          ?? zone.color,
      zone.id
    );
  const updated = db.prepare('SELECT * FROM zones WHERE id = ?').get(zone.id);
  const history = db.prepare('SELECT * FROM zone_history WHERE zone_id=? ORDER BY harvested_at DESC').all(zone.id);
  res.json({ ...updated, special: !!updated.special, history });
});

// Zone photos
app.get('/api/zones/:id/photos', (req, res) => {
  const photos = db.prepare(
    'SELECT id, zone_id, caption, uploaded_at FROM zone_photos WHERE zone_id=? ORDER BY uploaded_at DESC'
  ).all(req.params.id);
  res.json(photos);
});
app.get('/api/zones/:id/photos/:pid/data', (req, res) => {
  const p = db.prepare('SELECT image_data FROM zone_photos WHERE id=? AND zone_id=?')
    .get(req.params.pid, req.params.id);
  if (!p) return res.status(404).json({ error: 'Photo introuvable' });
  res.json({ image_data: p.image_data });
});
app.post('/api/zones/:id/photos', (req, res) => {
  const zone = db.prepare('SELECT * FROM zones WHERE id=?').get(req.params.id);
  if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
  const { image_data, caption } = req.body;
  if (!image_data) return res.status(400).json({ error: 'Image requise' });
  const result = db.prepare(
    'INSERT INTO zone_photos (zone_id, image_data, caption) VALUES (?, ?, ?)'
  ).run(req.params.id, image_data, caption || '');
  const photo = db.prepare('SELECT id, zone_id, caption, uploaded_at FROM zone_photos WHERE id=?')
    .get(result.lastInsertRowid);
  res.status(201).json(photo);
});
app.delete('/api/zones/:id/photos/:pid', (req, res) => {
  db.prepare('DELETE FROM zone_photos WHERE id=? AND zone_id=?').run(req.params.pid, req.params.id);
  res.json({ success: true });
});

// ─── MAP MARKERS ──────────────────────────────────────────────────────────────

app.get('/api/map/markers', (req, res) => {
  res.json(db.prepare('SELECT * FROM map_markers ORDER BY created_at').all());
});

app.post('/api/map/markers', (req, res) => {
  const { x_pct, y_pct, label, plant_name, note, emoji } = req.body;
  if (!label?.trim()) return res.status(400).json({ error: 'Label requis' });
  const id = uuidv4();
  db.prepare(`INSERT INTO map_markers (id, x_pct, y_pct, label, plant_name, note, emoji)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, x_pct, y_pct, label.trim(), plant_name || '', note || '', emoji || '🌱');
  res.status(201).json(db.prepare('SELECT * FROM map_markers WHERE id = ?').get(id));
});

app.put('/api/map/markers/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM map_markers WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Repère introuvable' });
  const { x_pct, y_pct, label, plant_name, note, emoji } = req.body;
  db.prepare(`UPDATE map_markers SET x_pct=?, y_pct=?, label=?, plant_name=?, note=?, emoji=? WHERE id=?`)
    .run(x_pct ?? m.x_pct, y_pct ?? m.y_pct, label ?? m.label,
         plant_name ?? m.plant_name, note ?? m.note, emoji ?? m.emoji, m.id);
  res.json(db.prepare('SELECT * FROM map_markers WHERE id = ?').get(m.id));
});

app.delete('/api/map/markers/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM map_markers WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Repère introuvable' });
  db.prepare('DELETE FROM map_markers WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Zone polygon creation
app.post('/api/zones', (req, res) => {
  const { name, points, color, current_plant, stage } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nom requis' });
  if (!points || points.length < 3) return res.status(400).json({ error: 'Au moins 3 points requis' });
  const id = 'zone-' + uuidv4().slice(0,8);
  db.prepare(`INSERT INTO zones (id, name, x, y, width, height, current_plant, stage, special, points, color)
              VALUES (?, ?, 0, 0, 0, 0, ?, ?, 0, ?, ?)`)
    .run(id, name.trim(), current_plant || '', stage || 'empty',
         JSON.stringify(points), color || '#86efac80');
  const zone = db.prepare('SELECT * FROM zones WHERE id = ?').get(id);
  res.status(201).json({ ...zone, history: [] });
});

app.delete('/api/zones/:id', (req, res) => {
  const zone = db.prepare('SELECT * FROM zones WHERE id = ?').get(req.params.id);
  if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
  db.prepare('DELETE FROM zone_history WHERE zone_id = ?').run(req.params.id);
  db.prepare('DELETE FROM zone_photos WHERE zone_id = ?').run(req.params.id);
  db.prepare('DELETE FROM zones WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/plants', (req, res) => {
  res.json(db.prepare('SELECT * FROM plants ORDER BY name').all());
});

app.post('/api/plants', (req, res) => {
  const { name, emoji, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nom requis' });
  const result = db.prepare(
    'INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)'
  ).run(name.trim(), emoji || '🌱', description || '');
  res.status(201).json(db.prepare('SELECT * FROM plants WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/plants/:id', (req, res) => {
  const plant = db.prepare('SELECT * FROM plants WHERE id = ?').get(req.params.id);
  if (!plant) return res.status(404).json({ error: 'Plante introuvable' });
  const { name, emoji, description } = req.body;
  db.prepare('UPDATE plants SET name=?, emoji=?, description=? WHERE id=?')
    .run(name ?? plant.name, emoji ?? plant.emoji, description ?? plant.description, plant.id);
  res.json(db.prepare('SELECT * FROM plants WHERE id = ?').get(plant.id));
});

app.delete('/api/plants/:id', (req, res) => {
  const plant = db.prepare('SELECT * FROM plants WHERE id = ?').get(req.params.id);
  if (!plant) return res.status(404).json({ error: 'Plante introuvable' });
  db.prepare('DELETE FROM plants WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── TASKS ────────────────────────────────────────────────────────────────────

function getTaskWithAssignments(taskId) {
  const task = db.prepare('SELECT t.*, z.name as zone_name FROM tasks t LEFT JOIN zones z ON t.zone_id = z.id WHERE t.id = ?').get(taskId);
  if (!task) return null;
  task.assignments = db.prepare('SELECT * FROM task_assignments WHERE task_id = ? ORDER BY assigned_at').all(taskId);
  return task;
}

app.get('/api/tasks', (req, res) => {
  const tasks = db.prepare(
    'SELECT t.*, z.name as zone_name FROM tasks t LEFT JOIN zones z ON t.zone_id = z.id ORDER BY due_date ASC'
  ).all();
  const assignments = db.prepare('SELECT * FROM task_assignments').all();
  res.json(tasks.map(t => ({
    ...t,
    assignments: assignments.filter(a => a.task_id === t.id)
  })));
});

app.get('/api/tasks/:id', (req, res) => {
  const task = getTaskWithAssignments(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  res.json(task);
});

app.post('/api/tasks', (req, res) => {
  const { title, description, zone_id, due_date, required_students } = req.body;
  if (!title) return res.status(400).json({ error: 'Titre requis' });
  const id = uuidv4();
  db.prepare(
    'INSERT INTO tasks (id, title, description, zone_id, due_date, required_students) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, title, description || '', zone_id || null, due_date || null, required_students || 1);
  res.status(201).json(getTaskWithAssignments(id));
});

app.put('/api/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  const { title, description, zone_id, due_date, required_students, status } = req.body;
  db.prepare(`
    UPDATE tasks SET title=?, description=?, zone_id=?, due_date=?, required_students=?, status=? WHERE id=?
  `).run(
    title ?? task.title,
    description ?? task.description,
    zone_id ?? task.zone_id,
    due_date ?? task.due_date,
    required_students ?? task.required_students,
    status ?? task.status,
    task.id
  );
  res.json(getTaskWithAssignments(task.id));
});

app.delete('/api/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  db.prepare('DELETE FROM task_logs WHERE task_id = ?').run(req.params.id);
  db.prepare('DELETE FROM task_assignments WHERE task_id = ?').run(req.params.id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/tasks/:id/assign', (req, res) => {
  const task = getTaskWithAssignments(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  if (task.status === 'validated') return res.status(400).json({ error: 'Tâche déjà validée' });

  const { firstName, lastName, studentId } = req.body;
  if (!firstName || !lastName) return res.status(400).json({ error: 'Nom requis' });

  // Verify student still exists (may have been deleted by teacher)
  if (studentId) {
    const exists = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
    if (!exists) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
  }

  // Check if already assigned
  const already = task.assignments.find(
    a => a.student_first_name.toLowerCase() === firstName.toLowerCase() &&
         a.student_last_name.toLowerCase()  === lastName.toLowerCase()
  );
  if (already) return res.status(400).json({ error: 'Déjà assigné à cette tâche' });

  if (task.assignments.length >= task.required_students) {
    return res.status(400).json({ error: 'Plus de place disponible sur cette tâche' });
  }

  db.prepare(
    'INSERT INTO task_assignments (task_id, student_first_name, student_last_name) VALUES (?, ?, ?)'
  ).run(task.id, firstName, lastName);

  // Update status
  const newCount = task.assignments.length + 1;
  const newStatus = newCount >= task.required_students ? 'in_progress' : 'available';
  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(newStatus, task.id);

  res.json(getTaskWithAssignments(task.id));
});

app.post('/api/tasks/:id/done', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

  const { comment, imageData, firstName, lastName, studentId } = req.body || {};

  // Block deleted students
  if (studentId) {
    const exists = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
    if (!exists) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
  }

  // Save log entry if comment or image provided
  if (comment || imageData) {
    db.prepare(`
      INSERT INTO task_logs (task_id, student_first_name, student_last_name, comment, image_data)
      VALUES (?, ?, ?, ?, ?)
    `).run(task.id, firstName || '', lastName || '', comment || '', imageData || null);
  }

  db.prepare("UPDATE tasks SET status = 'done' WHERE id = ?").run(task.id);
  res.json(getTaskWithAssignments(task.id));
});

app.get('/api/tasks/:id/logs', (req, res) => {
  const logs = db.prepare(
    'SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json(logs);
});

app.post('/api/tasks/:id/validate', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  db.prepare("UPDATE tasks SET status = 'validated' WHERE id = ?").run(task.id);
  res.json(getTaskWithAssignments(task.id));
});

// ─── AUTH & STUDENTS ──────────────────────────────────────────────────────────

function studentStats(studentId) {
  const s = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!s) return null;

  const assignments = db.prepare(`
    SELECT ta.*, t.status, t.title, t.due_date, t.zone_id, z.name as zone_name
    FROM task_assignments ta
    JOIN tasks t ON ta.task_id = t.id
    LEFT JOIN zones z ON t.zone_id = z.id
    WHERE ta.student_first_name = ? AND ta.student_last_name = ?
    ORDER BY ta.assigned_at DESC
  `).all(s.first_name, s.last_name);

  const done      = assignments.filter(a => a.status === 'validated').length;
  const pending   = assignments.filter(a => a.status === 'available' || a.status === 'in_progress').length;
  const submitted = assignments.filter(a => a.status === 'done').length;
  const total     = assignments.length;

  return { ...s, password: undefined, stats: { done, pending, submitted, total }, assignments };
}

// Register
app.post('/api/auth/register', async (req, res) => {
  const { firstName, lastName, password } = req.body;
  if (!firstName?.trim() || !lastName?.trim()) return res.status(400).json({ error: 'Prénom et nom requis' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' });

  const existing = db.prepare(
    'SELECT * FROM students WHERE LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)'
  ).get(firstName.trim(), lastName.trim());
  if (existing) return res.status(409).json({ error: 'Un compte avec ce nom existe déjà' });

  const hash = await bcrypt.hash(password, 10);
  const id   = uuidv4();
  const now  = new Date().toISOString();
  db.prepare('INSERT INTO students (id, first_name, last_name, password, last_seen) VALUES (?, ?, ?, ?, ?)')
    .run(id, firstName.trim(), lastName.trim(), hash, now);

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  res.status(201).json({ ...student, password: undefined });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { firstName, lastName, password } = req.body;
  if (!firstName || !lastName || !password) return res.status(400).json({ error: 'Champs requis' });

  const student = db.prepare(
    'SELECT * FROM students WHERE LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)'
  ).get(firstName.trim(), lastName.trim());

  if (!student) return res.status(401).json({ error: 'Compte introuvable' });
  if (!student.password) return res.status(401).json({ error: 'Ce compte n\'a pas de mot de passe. Contactez le prof.' });

  const ok = await bcrypt.compare(password, student.password);
  if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });

  db.prepare('UPDATE students SET last_seen = ? WHERE id = ?').run(new Date().toISOString(), student.id);
  res.json({ ...student, password: undefined });
});

// My stats
app.get('/api/stats/me/:studentId', (req, res) => {
  const data = studentStats(req.params.studentId);
  if (!data) return res.status(404).json({ error: 'Élève introuvable' });
  res.json(data);
});

// All students stats (teacher)
app.get('/api/stats/all', (req, res) => {
  const students = db.prepare('SELECT * FROM students').all();
  const result = students.map(s => {
    const assignments = db.prepare(`
      SELECT ta.*, t.status FROM task_assignments ta
      JOIN tasks t ON ta.task_id = t.id
      WHERE ta.student_first_name = ? AND ta.student_last_name = ?
    `).all(s.first_name, s.last_name);

    return {
      id:         s.id,
      first_name: s.first_name,
      last_name:  s.last_name,
      last_seen:  s.last_seen,
      stats: {
        total:     assignments.length,
        done:      assignments.filter(a => a.status === 'validated').length,
        pending:   assignments.filter(a => a.status === 'available' || a.status === 'in_progress').length,
        submitted: assignments.filter(a => a.status === 'done').length,
      }
    };
  }).sort((a, b) => b.stats.done - a.stats.done);
  res.json(result);
});

// ─── UNASSIGN ─────────────────────────────────────────────────────────────────
app.post('/api/tasks/:id/unassign', (req, res) => {
  try {
    const task = getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.status === 'done' || task.status === 'validated')
      return res.status(400).json({ error: 'Impossible de quitter une tâche déjà terminée' });

    const { firstName, lastName, studentId } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nom requis' });

    // Block deleted students
    if (studentId) {
      const exists = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
      if (!exists) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    }

    // Use simple equality — LOWER() breaks on accented French characters
    db.prepare(`
      DELETE FROM task_assignments
      WHERE task_id = ? AND student_first_name = ? AND student_last_name = ?
    `).run(task.id, firstName, lastName);

    // Recount and set status back to available
    const remaining = db.prepare(
      'SELECT COUNT(*) as c FROM task_assignments WHERE task_id = ?'
    ).get(task.id).c;

    db.prepare('UPDATE tasks SET status = ? WHERE id = ?')
      .run(remaining === 0 ? 'available' : 'available', task.id);

    res.json(getTaskWithAssignments(task.id));
  } catch(err) {
    console.error('Unassign error:', err);
    res.status(500).json({ error: 'Erreur lors du retrait : ' + err.message });
  }
});

app.post('/api/students/register', (req, res) => {
  const { studentId } = req.body;
  if (!studentId) return res.status(400).json({ error: 'studentId requis' });
  const s = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  // Return 401 with explicit "deleted" flag so frontend can log out
  if (!s) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
  db.prepare('UPDATE students SET last_seen = ? WHERE id = ?').run(new Date().toISOString(), studentId);
  res.json({ ...s, password: undefined });
});

// Delete a student (teacher only — no auth middleware, PIN enforced client-side)
app.delete('/api/students/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Élève introuvable' });

  // Find all tasks this student was assigned to BEFORE deleting
  const affectedTasks = db.prepare(`
    SELECT DISTINCT task_id FROM task_assignments
    WHERE student_first_name = ? AND student_last_name = ?
  `).all(s.first_name, s.last_name).map(r => r.task_id);

  // Remove assignments and logs
  db.prepare('DELETE FROM task_assignments WHERE student_first_name = ? AND student_last_name = ?')
    .run(s.first_name, s.last_name);
  db.prepare('DELETE FROM task_logs WHERE student_first_name = ? AND student_last_name = ?')
    .run(s.first_name, s.last_name);

  // Recalculate status for every affected task
  for (const taskId of affectedTasks) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) continue;
    // Don't touch validated tasks
    if (task.status === 'validated') continue;

    const remaining = db.prepare(
      'SELECT COUNT(*) as c FROM task_assignments WHERE task_id = ?'
    ).get(taskId).c;

    let newStatus;
    if (remaining === 0) {
      newStatus = 'available';
    } else if (remaining >= task.required_students) {
      newStatus = task.status === 'done' ? 'done' : 'in_progress';
    } else {
      newStatus = 'available'; // not enough people anymore
    }

    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(newStatus, taskId);
  }

  db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── FALLBACK ─────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const host = process.env.IP   || process.env.ALWAYSDATA_HTTPD_IP   || '0.0.0.0';
const port = process.env.PORT || process.env.ALWAYSDATA_HTTPD_PORT  || 3000;

app.listen(port, host, () => {
  console.log(`\n🌿 ForêtMap lancé sur http://${host}:${port}\n`);
});
