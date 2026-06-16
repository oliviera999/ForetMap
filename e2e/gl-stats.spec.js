const { test, expect } = require('@playwright/test');
const { execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const bcrypt = require('bcryptjs');

async function seedGlStatsE2E(label) {
  const stamp = Date.now();
  const adminEmail = `e2e-stats-mj-${label}-${stamp}@example.org`;
  await execute(
    'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
    [adminEmail, `MJ ${label}`, 'admin'],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [adminEmail]);

  await execute(
    'INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
    [`Classe stats ${label} ${stamp}`, 'Lyautey', admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');
  const hash = await bcrypt.hash('1234', 10);
  const pseudo = `stats-player-${label}-${stamp}`;

  await execute(
    `INSERT INTO gl_players
      (class_id, first_name, last_name, pseudo, password_hash, is_active, health_points, power_points, created_at, updated_at)
     VALUES (?, 'Stats', 'Joueur', ?, ?, 1, 4, 3, NOW(), NOW())`,
    [cls.id, pseudo, hash],
  );
  const player = await queryOne('SELECT id, pseudo FROM gl_players WHERE pseudo = ? LIMIT 1', [
    pseudo,
  ]);

  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.vitality_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );

  const classId = Number(cls.id);
  const token = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
    displayName: player.pseudo,
    classId,
  });

  return { token, pseudo, classId, playerId: Number(player.id) };
}

test.describe('GL statistiques joueur', () => {
  test('ouvre les stats depuis le badge vitalité (API /api/gl/stats/me)', async ({ page }) => {
    const seeded = await seedGlStatsE2E('badge');

    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate(
      (payload) => {
        localStorage.setItem('gl_session', JSON.stringify(payload));
      },
      {
        token: seeded.token,
        auth: {
          userType: 'gl_player',
          roleSlug: 'gl_player',
          displayName: seeded.pseudo,
          userId: String(seeded.playerId),
          classId: seeded.classId,
        },
      },
    );
    await page.reload();

    const statsResponse = page.waitForResponse(
      (res) => res.url().includes('/api/gl/stats/me') && res.status() === 200,
      { timeout: 20000 },
    );

    await page.getByRole('status', { name: /voir mes statistiques/i }).click();
    await statsResponse;

    const dialog = page.getByRole('dialog', { name: 'Mes statistiques' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /Mes statistiques/i })).toBeVisible();
    await expect(dialog.getByText(/Cœurs possédés/i)).toBeVisible();
    await expect(dialog.getByText(/Espèces étudiées/i)).toBeVisible();
  });
});
