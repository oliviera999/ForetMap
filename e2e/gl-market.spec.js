const { test, expect } = require('@playwright/test');
const { execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const bcrypt = require('bcryptjs');

async function seedGlMarketE2E(label) {
  const stamp = Date.now();
  const adminEmail = `e2e-market-mj-${label}-${stamp}@example.org`;
  await execute(
    'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
    [adminEmail, `MJ ${label}`, 'admin']
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [adminEmail]);

  await execute(
    'INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
    [`Classe market ${label} ${stamp}`, 'Lyautey', admin.id]
  );
  const cls = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');
  const hash = await bcrypt.hash('1234', 10);

  const pseudoA = `market-a-${label}-${stamp}`;
  const pseudoB = `market-b-${label}-${stamp}`;
  await execute(
    `INSERT INTO gl_players
      (class_id, first_name, last_name, pseudo, password_hash, is_active, health_points, power_points, created_at, updated_at)
     VALUES (?, 'A', 'Un', ?, ?, 1, 5, 5, NOW(), NOW()),
            (?, 'B', 'Deux', ?, ?, 1, 5, 5, NOW(), NOW())`,
    [cls.id, pseudoA, hash, cls.id, pseudoB, hash]
  );
  const playerA = await queryOne('SELECT id, pseudo FROM gl_players WHERE pseudo = ? LIMIT 1', [pseudoA]);
  const playerB = await queryOne('SELECT id, pseudo FROM gl_players WHERE pseudo = ? LIMIT 1', [pseudoB]);

  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.vitality_enabled', 'true', NOW()),
            ('modules.market_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`
  );

  const classId = Number(cls.id);
  const tokenA = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(playerA.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
    displayName: playerA.pseudo,
    classId,
  });
  const tokenB = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(playerB.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
    displayName: playerB.pseudo,
    classId,
  });

  return {
    tokenA,
    tokenB,
    pseudoA,
    pseudoB,
    playerAId: Number(playerA.id),
    playerBId: Number(playerB.id),
    classId,
  };
}

function buildSession(token, auth) {
  return { token, auth };
}

function waitMarketPatch(page, pathPart) {
  return page.waitForResponse(
    (res) => res.url().includes(pathPart)
      && res.request().method() === 'PATCH'
      && res.status() >= 200
      && res.status() < 300,
    { timeout: 15000 }
  );
}

async function loginGlPlayer(page, seeded, which) {
  const isA = which === 'A';
  await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
  await page.goto('/');
  await page.evaluate((payload) => {
    localStorage.setItem('gl_session', JSON.stringify(payload));
  }, buildSession(isA ? seeded.tokenA : seeded.tokenB, {
    userType: 'gl_player',
    roleSlug: 'gl_player',
    displayName: isA ? seeded.pseudoA : seeded.pseudoB,
    userId: String(isA ? seeded.playerAId : seeded.playerBId),
    classId: seeded.classId,
  }));
  await page.reload();
}

test.describe('GL marché', () => {
  test('disclaimer visible et échange 1 cœur contre 1 gemme', async ({ browser }) => {
    const seeded = await seedGlMarketE2E('flow');
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await loginGlPlayer(pageA, seeded, 'A');
    await loginGlPlayer(pageB, seeded, 'B');

    await pageA.getByRole('button', { name: 'Marché' }).click();
    await expect(pageA.getByRole('note', { name: 'Règles du marché' })).toBeVisible();
    await expect(pageA.getByText('Comment fonctionne le marché ?')).toBeVisible();

    await pageA.getByRole('button', { name: 'Proposer un échange' }).first().click();
    const offerPatchA = waitMarketPatch(pageA, '/offer');
    await pageA.getByLabel('Cœurs ❤️').fill('1');
    await pageA.getByLabel('Cœurs ❤️').blur();
    await offerPatchA;

    await pageB.getByRole('button', { name: 'Marché' }).click();
    await pageB.getByRole('button', { name: seeded.pseudoA }).click();
    await expect(pageB.getByRole('heading', { name: new RegExp(`Échange avec ${seeded.pseudoA}`, 'i') })).toBeVisible();

    const offerPatchB = waitMarketPatch(pageB, '/offer');
    await pageB.getByLabel('Gemmes 💎').fill('1');
    await pageB.getByLabel('Gemmes 💎').blur();
    await offerPatchB;

    const acceptPatchA = waitMarketPatch(pageA, '/accept');
    await pageA.getByLabel('J’accepte').click();
    await acceptPatchA;
    await expect(pageA.getByText('Les offres sont figées')).toBeVisible();

    await expect(pageB.getByText('L’autre joueur a accepté.')).toBeVisible({ timeout: 15000 });

    const acceptPatchB = waitMarketPatch(pageB, '/accept');
    await pageB.getByLabel('J’accepte').click();
    await acceptPatchB;
    await expect(pageB.getByText('terminé')).toBeVisible({ timeout: 15000 });

    await contextA.close();
    await contextB.close();
  });
});
