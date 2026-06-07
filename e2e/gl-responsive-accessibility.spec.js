const { test, expect } = require('@playwright/test');
const { seedGlScenario, mountGlSession } = require('./fixtures/gl.fixture');

async function seedGlPlayerSession(page, seeded, displayName = 'Joueur e2e a11y') {
  await mountGlSession(page, {
    token: seeded.playerToken,
    auth: {
      userType: 'gl_player',
      roleSlug: 'gl_player',
      displayName,
      teamId: seeded.teamId,
    },
    tab: 'maps',
  });
}

async function loginGlAdmin(page, seeded, tab = 'mj') {
  await mountGlSession(page, {
    token: seeded.adminToken,
    auth: {
      userType: 'gl_admin',
      roleSlug: 'gl_admin',
      displayName: 'MJ e2e a11y',
    },
    tab,
  });
}

test.describe('GL responsive & accessibilité', () => {
  test('auth GL reste navigable au clavier en viewport tablette', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.addInitScript(() => {
      localStorage.setItem('gl_intro_seen', '1');
    });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();

    const identifier = page.getByLabel(/Identifiant/);
    const password = page.getByLabel('Mot de passe');
    await expect(identifier).toBeVisible();
    await expect(password).toBeVisible();

    await identifier.focus();
    await page.keyboard.type('team-keyboard');
    await page.keyboard.press('Tab');
    await page.keyboard.type('1234');
    await expect(password).toHaveValue('1234');
  });

  test('navigation mobile : bottom bar et drawer Plus', async ({ page }) => {
    const seeded = await seedGlScenario('responsive-nav-mobile');
    await page.setViewportSize({ width: 390, height: 844 });
    await seedGlPlayerSession(page, seeded);

    await expect(page.locator('.gl-bottom-nav')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Cartes' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Plus d'onglets/ })).toBeVisible();

    await page.getByRole('button', { name: /Plus d'onglets/ }).click();
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Le monde de G&L' })).toBeVisible();

    await page.getByRole('tab', { name: 'Le monde de G&L' }).click();
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeHidden();
    await expect(page.getByRole('button', { name: /Plus d'onglets/ })).toHaveClass(/is-active/);
  });

  test('onglets desktop exposent aria-selected', async ({ page }) => {
    const seeded = await seedGlScenario('responsive-nav-desktop-a11y');
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedGlPlayerSession(page, seeded);

    const mapsTab = page.getByRole('tab', { name: 'Cartes' });
    await expect(mapsTab).toHaveAttribute('aria-selected', 'true');
    await expect(mapsTab).toHaveAttribute('aria-controls', 'gl-tabpanel-maps');

    await page.getByRole('tab', { name: 'Glossaire' }).click();
    await expect(page.getByRole('tab', { name: 'Glossaire' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#gl-tabpanel-glossary')).toBeVisible();
  });

  test('console MJ : sous-onglets accessibles au clavier', async ({ page }) => {
    const seeded = await seedGlScenario('responsive-mj-a11y');
    await page.setViewportSize({ width: 1024, height: 768 });
    await loginGlAdmin(page, seeded, 'mj');

    await expect(page.getByRole('heading', { name: 'Console MJ' })).toBeVisible();
    const partiesTab = page.getByRole('tab', { name: 'Parties' });
    await expect(partiesTab).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('tab', { name: /Équipes/ }).click();
    await expect(page.getByRole('tab', { name: /Équipes/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('carte : HUD mobile et plein écran au clavier', async ({ page }) => {
    const seeded = await seedGlScenario('responsive-board-hud');
    await page.setViewportSize({ width: 390, height: 844 });
    await seedGlPlayerSession(page, seeded);

    const hudFullscreen = page.getByTestId('gl-board-hud-fullscreen');
    await expect(hudFullscreen).toBeVisible();
    await hudFullscreen.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('gl-map-fullscreen-layer')).toBeVisible();

    await page.getByTestId('gl-map-fullscreen-close').click();
    await expect(page.getByTestId('gl-map-fullscreen-layer')).toBeHidden();
  });
});
