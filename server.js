const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');
const { queryAll, queryOne, execute, initDatabase } = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function getTaskWithAssignments(taskId) {
  const task = await queryOne(
    'SELECT t.*, z.name as zone_name FROM tasks t LEFT JOIN zones z ON t.zone_id = z.id WHERE t.id = ?',
    [taskId]
  );
  if (!task) return null;
  task.assignments = await queryAll('SELECT * FROM task_assignments WHERE task_id = ? ORDER BY assigned_at', [taskId]);
  return task;
}

async function studentStats(studentId) {
  const s = await queryOne('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!s) return null;
  const assignments = await queryAll(
    `SELECT ta.*, t.status, t.title, t.due_date, t.zone_id, z.name as zone_name
     FROM task_assignments ta
     JOIN tasks t ON ta.task_id = t.id
     LEFT JOIN zones z ON t.zone_id = z.id
     WHERE ta.student_first_name = ? AND ta.student_last_name = ?
     ORDER BY ta.assigned_at DESC`,
    [s.first_name, s.last_name]
  );
  const done      = assignments.filter(a => a.status === 'validated').length;
  const pending   = assignments.filter(a => a.status === 'available' || a.status === 'in_progress').length;
  const submitted = assignments.filter(a => a.status === 'done').length;
  const total     = assignments.length;
  return { ...s, password: undefined, stats: { done, pending, submitted, total }, assignments };
}

// ─── ZONES ────────────────────────────────────────────────────────────────────

app.get('/api/zones', async (req, res) => {
  try {
    const zones   = await queryAll('SELECT * FROM zones');
    const history = await queryAll('SELECT * FROM zone_history ORDER BY harvested_at DESC');
    const result  = zones.map(z => ({
      ...z,
      special: !!z.special,
      history: history.filter(h => h.zone_id === z.id)
    }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/zones/:id', async (req, res) => {
  try {
    const zone = await queryOne('SELECT * FROM zones WHERE id = ?', [req.params.id]);
    if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
    const history = await queryAll(
      'SELECT * FROM zone_history WHERE zone_id = ? ORDER BY harvested_at DESC',
      [req.params.id]
    );
    res.json({ ...zone, special: !!zone.special, history });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/zones/:id', async (req, res) => {
  try {
    const zone = await queryOne('SELECT * FROM zones WHERE id = ?', [req.params.id]);
    if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
    const { current_plant, stage, description, points, color } = req.body;
    if (zone.current_plant && current_plant !== undefined &&
        zone.current_plant !== current_plant && zone.current_plant.trim() !== '') {
      await execute(
        'INSERT INTO zone_history (zone_id, plant, harvested_at) VALUES (?, ?, ?)',
        [zone.id, zone.current_plant, new Date().toISOString().split('T')[0]]
      );
    }
    await execute(
      'UPDATE zones SET current_plant=?, stage=?, description=?, points=?, color=? WHERE id=?',
      [
        current_plant  ?? zone.current_plant,
        stage          ?? zone.stage,
        description    !== undefined ? description : (zone.description ?? ''),
        points         !== undefined ? JSON.stringify(points) : zone.points,
        color          ?? zone.color,
        zone.id
      ]
    );
    const updated = await queryOne('SELECT * FROM zones WHERE id = ?', [zone.id]);
    const history = await queryAll('SELECT * FROM zone_history WHERE zone_id=? ORDER BY harvested_at DESC', [zone.id]);
    res.json({ ...updated, special: !!updated.special, history });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/zones/:id/photos', async (req, res) => {
  try {
    const photos = await queryAll(
      'SELECT id, zone_id, caption, uploaded_at FROM zone_photos WHERE zone_id=? ORDER BY uploaded_at DESC',
      [req.params.id]
    );
    res.json(photos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/zones/:id/photos/:pid/data', async (req, res) => {
  try {
    const p = await queryOne('SELECT image_data FROM zone_photos WHERE id=? AND zone_id=?', [req.params.pid, req.params.id]);
    if (!p) return res.status(404).json({ error: 'Photo introuvable' });
    res.json({ image_data: p.image_data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/zones/:id/photos', async (req, res) => {
  try {
    const zone = await queryOne('SELECT * FROM zones WHERE id=?', [req.params.id]);
    if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
    const { image_data, caption } = req.body;
    if (!image_data) return res.status(400).json({ error: 'Image requise' });
    const result = await execute(
      'INSERT INTO zone_photos (zone_id, image_data, caption) VALUES (?, ?, ?)',
      [req.params.id, image_data, caption || '']
    );
    const photo = await queryOne('SELECT id, zone_id, caption, uploaded_at FROM zone_photos WHERE id=?', [result.insertId]);
    res.status(201).json(photo);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/zones/:id/photos/:pid', async (req, res) => {
  try {
    await execute('DELETE FROM zone_photos WHERE id=? AND zone_id=?', [req.params.pid, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MAP MARKERS ──────────────────────────────────────────────────────────────

app.get('/api/map/markers', async (req, res) => {
  try {
    const rows = await queryAll('SELECT * FROM map_markers ORDER BY created_at');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/map/markers', async (req, res) => {
  try {
    const { x_pct, y_pct, label, plant_name, note, emoji } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'Label requis' });
    const id = uuidv4();
    await execute(
      'INSERT INTO map_markers (id, x_pct, y_pct, label, plant_name, note, emoji) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, x_pct, y_pct, label.trim(), plant_name || '', note || '', emoji || '🌱']
    );
    const row = await queryOne('SELECT * FROM map_markers WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/map/markers/:id', async (req, res) => {
  try {
    const m = await queryOne('SELECT * FROM map_markers WHERE id = ?', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Repère introuvable' });
    const { x_pct, y_pct, label, plant_name, note, emoji } = req.body;
    await execute(
      'UPDATE map_markers SET x_pct=?, y_pct=?, label=?, plant_name=?, note=?, emoji=? WHERE id=?',
      [x_pct ?? m.x_pct, y_pct ?? m.y_pct, label ?? m.label, plant_name ?? m.plant_name, note ?? m.note, emoji ?? m.emoji, m.id]
    );
    const updated = await queryOne('SELECT * FROM map_markers WHERE id = ?', [m.id]);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/map/markers/:id', async (req, res) => {
  try {
    const m = await queryOne('SELECT * FROM map_markers WHERE id = ?', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Repère introuvable' });
    await execute('DELETE FROM map_markers WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/zones', async (req, res) => {
  try {
    const { name, points, color, current_plant, stage } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nom requis' });
    if (!points || points.length < 3) return res.status(400).json({ error: 'Au moins 3 points requis' });
    const id = 'zone-' + uuidv4().slice(0, 8);
    await execute(
      'INSERT INTO zones (id, name, x, y, width, height, current_plant, stage, special, points, color) VALUES (?, ?, 0, 0, 0, 0, ?, ?, 0, ?, ?)',
      [id, name.trim(), current_plant || '', stage || 'empty', JSON.stringify(points), color || '#86efac80']
    );
    const zone = await queryOne('SELECT * FROM zones WHERE id = ?', [id]);
    res.status(201).json({ ...zone, history: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/zones/:id', async (req, res) => {
  try {
    const zone = await queryOne('SELECT * FROM zones WHERE id = ?', [req.params.id]);
    if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
    await execute('DELETE FROM zone_history WHERE zone_id = ?', [req.params.id]);
    await execute('DELETE FROM zone_photos WHERE zone_id = ?', [req.params.id]);
    await execute('DELETE FROM zones WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PLANTS ───────────────────────────────────────────────────────────────────

app.get('/api/plants', async (req, res) => {
  try {
    const rows = await queryAll('SELECT * FROM plants ORDER BY name');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/plants', async (req, res) => {
  try {
    const { name, emoji, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nom requis' });
    const result = await execute(
      'INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)',
      [name.trim(), emoji || '🌱', description || '']
    );
    const plant = await queryOne('SELECT * FROM plants WHERE id = ?', [result.insertId]);
    res.status(201).json(plant);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/plants/:id', async (req, res) => {
  try {
    const plant = await queryOne('SELECT * FROM plants WHERE id = ?', [req.params.id]);
    if (!plant) return res.status(404).json({ error: 'Plante introuvable' });
    const { name, emoji, description } = req.body;
    await execute(
      'UPDATE plants SET name=?, emoji=?, description=? WHERE id=?',
      [name ?? plant.name, emoji ?? plant.emoji, description ?? plant.description, plant.id]
    );
    const updated = await queryOne('SELECT * FROM plants WHERE id = ?', [plant.id]);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/plants/:id', async (req, res) => {
  try {
    const plant = await queryOne('SELECT * FROM plants WHERE id = ?', [req.params.id]);
    if (!plant) return res.status(404).json({ error: 'Plante introuvable' });
    await execute('DELETE FROM plants WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── TASKS ────────────────────────────────────────────────────────────────────

app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await queryAll(
      'SELECT t.*, z.name as zone_name FROM tasks t LEFT JOIN zones z ON t.zone_id = z.id ORDER BY due_date ASC'
    );
    const assignments = await queryAll('SELECT * FROM task_assignments');
    res.json(tasks.map(t => ({
      ...t,
      assignments: assignments.filter(a => a.task_id === t.id)
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/tasks/:id', async (req, res) => {
  try {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, zone_id, due_date, required_students } = req.body;
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    const id = uuidv4();
    await execute(
      'INSERT INTO tasks (id, title, description, zone_id, due_date, required_students) VALUES (?, ?, ?, ?, ?, ?)',
      [id, title, description || '', zone_id || null, due_date || null, required_students || 1]
    );
    const task = await getTaskWithAssignments(id);
    res.status(201).json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    const { title, description, zone_id, due_date, required_students, status } = req.body;
    await execute(
      'UPDATE tasks SET title=?, description=?, zone_id=?, due_date=?, required_students=?, status=? WHERE id=?',
      [
        title ?? task.title,
        description ?? task.description,
        zone_id ?? task.zone_id,
        due_date ?? task.due_date,
        required_students ?? task.required_students,
        status ?? task.status,
        task.id
      ]
    );
    const updated = await getTaskWithAssignments(task.id);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    await execute('DELETE FROM task_logs WHERE task_id = ?', [req.params.id]);
    await execute('DELETE FROM task_assignments WHERE task_id = ?', [req.params.id]);
    await execute('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tasks/:id/assign', async (req, res) => {
  try {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.status === 'validated') return res.status(400).json({ error: 'Tâche déjà validée' });

    const { firstName, lastName, studentId } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nom requis' });

    if (studentId) {
      const exists = await queryOne('SELECT id FROM students WHERE id = ?', [studentId]);
      if (!exists) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    }

    const already = task.assignments.find(
      a => String(a.student_first_name).toLowerCase() === firstName.toLowerCase() &&
           String(a.student_last_name).toLowerCase() === lastName.toLowerCase()
    );
    if (already) return res.status(400).json({ error: 'Déjà assigné à cette tâche' });

    if (task.assignments.length >= task.required_students) {
      return res.status(400).json({ error: 'Plus de place disponible sur cette tâche' });
    }

    await execute(
      'INSERT INTO task_assignments (task_id, student_first_name, student_last_name) VALUES (?, ?, ?)',
      [task.id, firstName, lastName]
    );

    const newCount = task.assignments.length + 1;
    const newStatus = newCount >= task.required_students ? 'in_progress' : 'available';
    await execute('UPDATE tasks SET status = ? WHERE id = ?', [newStatus, task.id]);

    const updated = await getTaskWithAssignments(task.id);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tasks/:id/done', async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

    const { comment, imageData, firstName, lastName, studentId } = req.body || {};

    if (studentId) {
      const exists = await queryOne('SELECT id FROM students WHERE id = ?', [studentId]);
      if (!exists) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    }

    if (comment || imageData) {
      await execute(
        'INSERT INTO task_logs (task_id, student_first_name, student_last_name, comment, image_data) VALUES (?, ?, ?, ?, ?)',
        [task.id, firstName || '', lastName || '', comment || '', imageData || null]
      );
    }

    await execute("UPDATE tasks SET status = 'done' WHERE id = ?", [task.id]);
    const updated = await getTaskWithAssignments(task.id);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/tasks/:id/logs', async (req, res) => {
  try {
    const logs = await queryAll(
      'SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tasks/:id/validate', async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    await execute("UPDATE tasks SET status = 'validated' WHERE id = ?", [req.params.id]);
    const updated = await getTaskWithAssignments(task.id);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── AUTH & STUDENTS ──────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { firstName, lastName, password } = req.body;
    if (!firstName?.trim() || !lastName?.trim()) return res.status(400).json({ error: 'Prénom et nom requis' });
    if (!password || password.length < 4) return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' });

    const existing = await queryOne(
      'SELECT * FROM students WHERE LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)',
      [firstName.trim(), lastName.trim()]
    );
    if (existing) return res.status(409).json({ error: 'Un compte avec ce nom existe déjà' });

    const hash = await bcrypt.hash(password, 10);
    const id   = uuidv4();
    const now  = new Date().toISOString();
    await execute(
      'INSERT INTO students (id, first_name, last_name, password, last_seen) VALUES (?, ?, ?, ?, ?)',
      [id, firstName.trim(), lastName.trim(), hash, now]
    );
    const student = await queryOne('SELECT * FROM students WHERE id = ?', [id]);
    res.status(201).json({ ...student, password: undefined });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { firstName, lastName, password } = req.body;
    if (!firstName || !lastName || !password) return res.status(400).json({ error: 'Champs requis' });

    const student = await queryOne(
      'SELECT * FROM students WHERE LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)',
      [firstName.trim(), lastName.trim()]
    );

    if (!student) return res.status(401).json({ error: 'Compte introuvable' });
    if (!student.password) return res.status(401).json({ error: 'Ce compte n\'a pas de mot de passe. Contactez le prof.' });

    const ok = await bcrypt.compare(password, student.password);
    if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });

    await execute('UPDATE students SET last_seen = ? WHERE id = ?', [new Date().toISOString(), student.id]);
    res.json({ ...student, password: undefined });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stats/me/:studentId', async (req, res) => {
  try {
    const data = await studentStats(req.params.studentId);
    if (!data) return res.status(404).json({ error: 'Élève introuvable' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stats/all', async (req, res) => {
  try {
    const students = await queryAll('SELECT * FROM students');
    const result = await Promise.all(students.map(async (s) => {
      const assignments = await queryAll(
        `SELECT ta.*, t.status FROM task_assignments ta
         JOIN tasks t ON ta.task_id = t.id
         WHERE ta.student_first_name = ? AND ta.student_last_name = ?`,
        [s.first_name, s.last_name]
      );
      return {
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        last_seen: s.last_seen,
        stats: {
          total: assignments.length,
          done: assignments.filter(a => a.status === 'validated').length,
          pending: assignments.filter(a => a.status === 'available' || a.status === 'in_progress').length,
          submitted: assignments.filter(a => a.status === 'done').length,
        }
      };
    }));
    result.sort((a, b) => b.stats.done - a.stats.done);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tasks/:id/unassign', async (req, res) => {
  try {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.status === 'done' || task.status === 'validated') {
      return res.status(400).json({ error: 'Impossible de quitter une tâche déjà terminée' });
    }

    const { firstName, lastName, studentId } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nom requis' });

    if (studentId) {
      const exists = await queryOne('SELECT id FROM students WHERE id = ?', [studentId]);
      if (!exists) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    }

    await execute(
      'DELETE FROM task_assignments WHERE task_id = ? AND student_first_name = ? AND student_last_name = ?',
      [task.id, firstName, lastName]
    );

    const remainingRow = await queryOne('SELECT COUNT(*) AS c FROM task_assignments WHERE task_id = ?', [task.id]);
    const remaining = remainingRow ? Number(remainingRow.c) : 0;
    await execute('UPDATE tasks SET status = ? WHERE id = ?', [remaining === 0 ? 'available' : 'available', task.id]);

    const updated = await getTaskWithAssignments(task.id);
    res.json(updated);
  } catch (err) {
    console.error('Unassign error:', err);
    res.status(500).json({ error: 'Erreur lors du retrait : ' + err.message });
  }
});

app.post('/api/students/register', async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId requis' });
    const s = await queryOne('SELECT * FROM students WHERE id = ?', [studentId]);
    if (!s) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    await execute('UPDATE students SET last_seen = ? WHERE id = ?', [new Date().toISOString(), studentId]);
    res.json({ ...s, password: undefined });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  try {
    const s = await queryOne('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Élève introuvable' });

    const affectedRows = await queryAll(
      'SELECT DISTINCT task_id FROM task_assignments WHERE student_first_name = ? AND student_last_name = ?',
      [s.first_name, s.last_name]
    );
    const affectedTasks = affectedRows.map(r => r.task_id);

    await execute(
      'DELETE FROM task_assignments WHERE student_first_name = ? AND student_last_name = ?',
      [s.first_name, s.last_name]
    );
    await execute(
      'DELETE FROM task_logs WHERE student_first_name = ? AND student_last_name = ?',
      [s.first_name, s.last_name]
    );

    for (const taskId of affectedTasks) {
      const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (!task) continue;
      if (task.status === 'validated') continue;

      const remainingRow = await queryOne('SELECT COUNT(*) AS c FROM task_assignments WHERE task_id = ?', [taskId]);
      const remaining = remainingRow ? Number(remainingRow.c) : 0;

      let newStatus;
      if (remaining === 0) {
        newStatus = 'available';
      } else if (remaining >= task.required_students) {
        newStatus = task.status === 'done' ? 'done' : 'in_progress';
      } else {
        newStatus = 'available';
      }
      await execute('UPDATE tasks SET status = ? WHERE id = ?', [newStatus, taskId]);
    }

    await execute('DELETE FROM students WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── FALLBACK ─────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const host = process.env.IP || process.env.ALWAYSDATA_HTTPD_IP || '0.0.0.0';
const port = process.env.PORT || process.env.ALWAYSDATA_HTTPD_PORT || 3000;

initDatabase()
  .then(() => {
    app.listen(port, host, () => {
      console.log(`\n🌿 ForêtMap lancé sur http://${host}:${port}\n`);
    });
  })
  .catch((err) => {
    console.error('Erreur init BDD:', err);
    process.exit(1);
  });
