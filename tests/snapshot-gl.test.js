const test = require('node:test');
const assert = require('node:assert/strict');

if (String(process.env.FORETMAP_SNAPSHOT_GL || '').trim() !== '1') {
  test(
    'snapshot GL: désactivé',
    { skip: 'Définir FORETMAP_SNAPSHOT_GL=1 pour activer ce test.' },
    () => {},
  );
} else {
  require('./helpers/setup');
  const { queryOne, queryAll } = require('../database');

  test('snapshot GL: tables attendues présentes', async () => {
    const expectedTables = [
      'gl_admins',
      'gl_classes',
      'gl_players',
      'gl_chapters',
      'gl_chapter_markers',
      'gl_games',
      'gl_teams',
      'gl_team_members',
      'gl_game_events',
      'gl_team_scores',
      'gl_mascot_assignments',
      'gl_settings',
      'gl_content_pages',
    ];
    for (const table of expectedTables) {
      const row = await queryOne(
        `SELECT 1 AS ok
           FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
          LIMIT 1`,
        [table],
      );
      assert.ok(row, `Table manquante: ${table}`);
    }
  });

  test('snapshot GL: permissions gl.* bootstrapées', async () => {
    const rows = await queryAll(
      "SELECT `key` FROM permissions WHERE `key` LIKE 'gl.%' ORDER BY `key` ASC",
    );
    assert.ok(rows.length > 0, 'Aucune permission gl.* trouvée');
    const keys = rows.map((r) => String(r.key || ''));
    assert.ok(keys.includes('gl.read'));
    assert.ok(keys.includes('gl.game.manage'));
  });
}
