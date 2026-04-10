require('./tests/helpers/setup');
const { initSchema, execute, queryOne } = require('./database');
const { app } = require('./server');
const request = require('supertest');

(async () => {
  await initSchema();
  const stamp = Date.now();
  const plantIns = await execute(
    'INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)',
    [`p${stamp}`, '🌿', 'd']
  );
  console.log('plantIns', plantIns);
  const pid = String(plantIns.insertId);
  const row = await queryOne('SELECT id FROM plants WHERE id = ? LIMIT 1', [pid]);
  console.log('plant row', row);
  const slug = `s${stamp}`;
  const tIns = await execute(
    'INSERT INTO tutorials (title, slug, type, summary, sort_order, is_active) VALUES (?, ?, ?, ?, 0, 1)',
    ['T', slug, 'html', 'S']
  );
  console.log('tIns', tIns);
  const tid = String(tIns.insertId);
  // minimal student token: reuse register from test is heavy; just POST without auth should 401
  const res = await request(app)
    .post('/api/context-comments')
    .send({ contextType: 'plant', contextId: pid, body: 'ok' });
  console.log('no auth status', res.status);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
