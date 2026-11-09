const { test, expect } = require('@playwright/test');
const { execute, queryOne } = require('../database');
const { upsertGlSetting, getGameplaySettings } = require('../lib/glSettings');
const { signAuthToken } = require('../middleware/requireTeacher');
const { mountGlSession } = require('./fixtures/gl.fixture');
const bcrypt = require('bcryptjs');

async function seedGlMarketE2E(label) {
  const stamp = Date.now();
  const adminEmail = `e2e-market-mj-${label}-${stamp}@example.org`;
  await execute(
    'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
    [adminEmail, `MJ ${label}`, 'admin'],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [adminEmail]);

  await execute(
    'INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
    [`Classe market ${label} ${stamp}`, 'Lyautey', admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');
  const hash = await bcrypt.hash('1234', 10);

  const pseudoA = `market-a-${label}-${stamp}`;
  const pseudoB = `market-b-${label}-${stamp}`;
  await execute(
    `INSERT INTO gl_players
      (class_id, first_name, last_name, pseudo, legacy_password_hash, is_active, health_points, power_points, created_at, updated_at)
     VALUES (?, 'A', 'Un', ?, ?, 1, 5, 5, NOW(), NOW()),
            (?, 'B', 'Deux', ?, ?, 1, 5, 5, NOW(), NOW())`,
    [cls.id, pseudoA, hash, cls.id, pseudoB, hash],
  );
  const playerA = await queryOne('SELECT id, pseudo FROM gl_players WHERE pseudo = ? LIMIT 1', [
    pseudoA,
  ]);
  const playerB = await queryOne('SELECT id, pseudo FROM gl_players WHERE pseudo = ? LIMIT 1', [
    pseudoB,
  ]);

  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.vitality_enabled', 'true', NOW()),
            ('modules.market_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
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

function waitMarketPatch(page, pathPart) {
  return page.waitForResponse(
    (res) =>
      res.url().includes(pathPart) &&
      res.request().method() === 'PATCH' &&
      res.status() >= 200 &&
      res.status() < 300,
    { timeout: 15000 },
  );
}

async function loginGlPlayer(page, seeded, which) {
  const isA = which === 'A';
  await mountGlSession(page, {
    token: isA ? seeded.tokenA : seeded.tokenB,
    auth: {
      userType: 'gl_player',
      roleSlug: 'gl_player',
      displayName: isA ? seeded.pseudoA : seeded.pseudoB,
      userId: String(isA ? seeded.playerAId : seeded.playerBId),
      classId: seeded.classId,
    },
    tab: 'maps',
  });
}

/** Ouvre Les joueurs → Marché et vérifie l'encart des règles sur l'onglet affiché par défaut. */
async function openMarket(page) {
  await page.getByRole('tab', { name: /Les joueurs/i }).click();
  await page.getByRole('tab', { name: 'Marché' }).click();
  // Sur l'onglet par défaut (La place quand le Marché « Tenir à deux » est actif, les Échanges
  // sinon), l'encart « Comment fonctionne le marché ? » est visible.
  await expect(page.getByRole('note', { name: 'Règles du marché' })).toBeVisible();
  await expect(page.getByText('Comment fonctionne le marché ?')).toBeVisible();
}

/**
 * Passe sur les Échanges quand les sous-onglets du Marché existent (La place / Échanges /
 * Comptoir) ; sans eux, la vue Échanges est déjà la seule affichée.
 */
async function gotoEchanges(page) {
  const echanges = page.getByRole('tab', { name: 'Échanges' });
  if ((await echanges.count()) > 0) {
    await echanges.click();
    await expect(page.getByRole('note', { name: 'Règles du marché' })).toBeVisible();
  }
}

test.describe('GL marché', () => {
  /**
   * L'échange de cœurs est derrière un drapeau, **désactivé par défaut**
   * (`gameplay.market_hearts_enabled`, cf. `lib/glSettings.js`) : sans lui le champ « Cœurs ❤️ »
   * n'est pas rendu du tout (`GLMarketView.jsx`) et le serveur refuse tout montant en cœurs
   * (`lib/glMarket.js`). Un scénario qui prétend échanger un cœur doit donc l'activer lui-même
   * — il attendait jusqu'ici une interface que personne ne sert par défaut.
   */
  let heartsWereEnabled = false;

  test.beforeAll(async () => {
    heartsWereEnabled = (await getGameplaySettings())?.marketHeartsEnabled === true;
    if (!heartsWereEnabled) await upsertGlSetting('gameplay.market_hearts_enabled', true);
  });

  test.afterAll(async () => {
    if (!heartsWereEnabled) await upsertGlSetting('gameplay.market_hearts_enabled', false);
  });

  test('disclaimer visible et échange 1 cœur contre 1 gemme', async ({ browser }) => {
    const seeded = await seedGlMarketE2E('flow');
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await loginGlPlayer(pageA, seeded, 'A');
    await loginGlPlayer(pageB, seeded, 'B');

    await openMarket(pageA);
    await gotoEchanges(pageA);

    await pageA.getByRole('button', { name: 'Proposer un échange' }).first().click();
    const offerPatchA = waitMarketPatch(pageA, '/offer');
    await pageA.getByLabel('Cœurs ❤️').fill('1');
    await pageA.getByLabel('Cœurs ❤️').blur();
    await offerPatchA;

    await openMarket(pageB);
    await gotoEchanges(pageB);
    await pageB.getByRole('button', { name: seeded.pseudoA }).click();
    await expect(
      pageB.getByRole('heading', { name: new RegExp(`Échange avec ${seeded.pseudoA}`, 'i') }),
    ).toBeVisible();

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

  test('La place : encart repliable « Comment fonctionne le marché ? », légende du fieldset lisible (capture)', async ({
    browser,
  }) => {
    const seeded = await seedGlMarketE2E('place');
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await loginGlPlayer(page, seeded, 'A');
    await openMarket(page);

    const place = page.getByTestId('gl-market-place');
    test.skip((await place.count()) === 0, 'Marché « Tenir à deux » (La place) non servi');

    const note = page.getByRole('note', { name: 'Règles du marché' });
    await expect(note.locator('li')).toHaveCount(4);
    // La légende « Ce que je cherche » ne chevauche pas le premier champ du fieldset.
    const legend = place.locator('fieldset legend', { hasText: 'Ce que je cherche' });
    await expect(legend).toBeVisible();
    const legendBox = await legend.boundingBox();
    const firstField = place.locator('fieldset .gl-field').first();
    const fieldBox = await firstField.boundingBox();
    expect(legendBox.y + legendBox.height).toBeLessThanOrEqual(fieldBox.y + 1);

    await page.screenshot({
      path: 'docs/captures/tenir-v2/marche-encart-regles.png',
      clip: { x: 0, y: 0, width: 1024, height: 768 },
    });

    // Repliable : le titre sert de poignée.
    await note.getByText('Comment fonctionne le marché ?').click();
    await expect(note.locator('li').first()).toBeHidden();
    await note.getByText('Comment fonctionne le marché ?').click();
    await expect(note.locator('li').first()).toBeVisible();

    await context.close();
  });
});
