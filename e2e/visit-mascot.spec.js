const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  disableTeacherMode,
  dismissProfilePromotionModalIfPresent,
} = require('./fixtures/auth.fixture');
const { seedVisitMascotContent, cleanupVisitMascotContent } = require('./fixtures/visit-api.fixture');

const VISIT_MAP_MASCOT_MOVE_MS = 560;
const N3_ENTRANCE_Y_OFFSET = 5.5;

function parseStylePct(value) {
  if (value == null || value === '') return NaN;
  const m = /^([\d.]+)%\s*$/.exec(String(value).trim());
  return m ? Number(m[1]) : NaN;
}

async function readMascotPct(page) {
  const mascot = page.locator('.visit-map-mascot').first();
  const left = await mascot.evaluate((el) => el.style.left);
  const top = await mascot.evaluate((el) => el.style.top);
  return { xp: parseStylePct(left), yp: parseStylePct(top) };
}

/**
 * Clic dans le repère % du calque carte visite (même repère que `left`/`top` des repères).
 * @param {import('@playwright/test').Page} page
 * @param {number} xpPct
 * @param {number} ypPct
 */
async function clickVisitMapAtPct(page, xpPct, ypPct) {
  const fit = page.locator('.visit-map-stage').locator('.visit-map-fit-layer');
  await fit.waitFor({ state: 'visible' });
  const box = await fit.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) {
    throw new Error('visit-map-fit-layer sans taille exploitable');
  }
  await fit.click({ position: { x: (xpPct / 100) * box.width, y: (ypPct / 100) * box.height } });
}

async function openVisitMap(page) {
  await dismissProfilePromotionModalIfPresent(page);
  await page.getByRole('button', { name: /^🧭 Visite$/ }).click();
  await expect(page.locator('.visit-view')).toBeVisible({ timeout: 30_000 });
  const stage = page.locator('.visit-map-stage');
  await expect(stage).toBeVisible({ timeout: 30_000 });
  await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 20_000 });
  /* Le conteneur .visit-map-mascot est volontairement en 0×0 (ancrage %) : Playwright le voit « hidden ». */
  await expect(stage.locator('.visit-map-mascot')).toBeAttached();
  await expect(stage.locator('.visit-map-mascot-inner')).toBeVisible({ timeout: 25_000 });
  await expect
    .poll(async () => {
      const shell = stage.locator('.visit-map-mascot-rive-shell').first();
      return shell.evaluate((el) => {
        const staticSvg = el.querySelector('.visit-map-mascot-static svg');
        if (!staticSvg) return false;
        const box = staticSvg.getBoundingClientRect();
        return box.width > 2 && box.height > 2;
      });
    }, { timeout: 7000 })
    .toBe(true);
  return stage;
}

test.describe.serial('mascotte visite (comportement carte)', () => {
  /** @type {{ n3: { zoneId: string, markerAId: string, markerBId: string, entranceId: string } } | null} */
  let seededIds = null;
  /** @type {string} */
  let teacherToken = '';

  test.beforeEach(async ({ page }) => {
    seededIds = null;
    teacherToken = '';
    await loginAsNewStudent(page);
    await dismissProfilePromotionModalIfPresent(page);
    await enableTeacherMode(page);
    const seeded = await seedVisitMascotContent(page);
    teacherToken = seeded.token;
    seededIds = { n3: seeded.n3 };
    await disableTeacherMode(page);
    await dismissProfilePromotionModalIfPresent(page);
    await openVisitMap(page);
  });

  test.afterEach(async ({ page }) => {
    if (teacherToken && seededIds) {
      await cleanupVisitMascotContent(page, teacherToken, seededIds);
    }
  });

  test('mascotte visible sur le plan après contenu visite', async ({ page }) => {
    const stage = page.locator('.visit-map-stage');
    await expect(stage.locator('.visit-map-mascot')).toBeAttached();
    await expect(stage.locator('.visit-map-mascot-inner')).toBeVisible();
    await expect(stage.locator('.visit-map-mascot-rive-shell')).toBeVisible();
  });

  test('position initiale sous le repère entrée N3 (plan n3)', async ({ page }) => {
    const { xp, yp } = await readMascotPct(page);
    expect(Math.abs(xp - 22)).toBeLessThan(1.2);
    const expectedY = 18 + N3_ENTRANCE_Y_OFFSET;
    expect(Math.abs(yp - expectedY)).toBeLessThan(1.2);
  });

  test('clic repère déplace la mascotte vers les coordonnées du repère', async ({ page }) => {
    await clickVisitMapAtPct(page, 88, 50);
    const { xp, yp } = await readMascotPct(page);
    expect(Math.abs(xp - 88)).toBeLessThan(1.2);
    expect(Math.abs(yp - 50)).toBeLessThan(1.2);
  });

  test('clic zone déplace la mascotte vers le centroïde', async ({ page }) => {
    await clickVisitMapAtPct(page, 50, 45);
    const { xp, yp } = await readMascotPct(page);
    expect(Math.abs(xp - 50)).toBeLessThan(1.5);
    expect(Math.abs(yp - 45)).toBeLessThan(1.5);
  });

  test('marche : classe walking pendant le déplacement puis retrait', async ({ page }) => {
    const stage = page.locator('.visit-map-stage');
    const mascot = stage.locator('.visit-map-mascot');
    await clickVisitMapAtPct(page, 88, 50);
    await expect(mascot).toBeAttached();
    await clickVisitMapAtPct(page, 12, 50);
    await expect(mascot).toHaveClass(/visit-map-mascot--walking/, { timeout: 2000 });
    await expect(mascot).not.toHaveClass(/visit-map-mascot--walking/, { timeout: VISIT_MAP_MASCOT_MOVE_MS + 400 });
  });

  test('marquer vu déclenche état happy et bulle', async ({ page }) => {
    await clickVisitMapAtPct(page, 88, 50);
    await expect(page.getByRole('button', { name: /Marquer comme vu|Marqué comme vu/i })).toBeVisible();
    await page.getByRole('button', { name: /Marquer comme vu|Marqué comme vu/i }).click();
    const mascot = page.locator('.visit-map-mascot');
    await expect(mascot).toHaveClass(/visit-map-mascot--happy/, { timeout: 2000 });
    await expect(page.locator('.visit-map-mascot-dialog')).toBeVisible({ timeout: 2000 });
  });
});

test.describe.serial('mascotte visite (prefers-reduced-motion)', () => {
  /** @type {{ n3: { zoneId: string, markerAId: string, markerBId: string, entranceId: string } } | null} */
  let seededIds = null;
  let teacherToken = '';

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    seededIds = null;
    teacherToken = '';
    await loginAsNewStudent(page);
    await dismissProfilePromotionModalIfPresent(page);
    await enableTeacherMode(page);
    const seeded = await seedVisitMascotContent(page);
    teacherToken = seeded.token;
    seededIds = { n3: seeded.n3 };
    await disableTeacherMode(page);
    await dismissProfilePromotionModalIfPresent(page);
    await openVisitMap(page);
  });

  test.afterEach(async ({ page }) => {
    if (teacherToken && seededIds) {
      await cleanupVisitMascotContent(page, teacherToken, seededIds);
    }
  });

  test('classe reduced-motion et pas de walking au clic lointain', async ({ page }) => {
    const stage = page.locator('.visit-map-stage');
    const mascot = stage.locator('.visit-map-mascot');
    await expect(mascot).toHaveClass(/visit-map-mascot--reduced-motion/);
    await clickVisitMapAtPct(page, 88, 50);
    await expect(mascot).not.toHaveClass(/visit-map-mascot--walking/);
  });

});

test.describe.serial('mascotte visite (sélecteur prof)', () => {
  /** @type {{ n3: { zoneId: string, markerAId: string, markerBId: string, entranceId: string } } | null} */
  let seededIds = null;
  let teacherToken = '';

  test.beforeEach(async ({ page }) => {
    seededIds = null;
    teacherToken = '';
    await loginAsNewStudent(page);
    await dismissProfilePromotionModalIfPresent(page);
    await enableTeacherMode(page);
    const seeded = await seedVisitMascotContent(page);
    teacherToken = seeded.token;
    seededIds = { n3: seeded.n3 };
    await openVisitMap(page);
  });

  test.afterEach(async ({ page }) => {
    if (teacherToken && seededIds) {
      await cleanupVisitMascotContent(page, teacherToken, seededIds);
    }
  });

  test('le sélecteur change bien la mascotte active', async ({ page }) => {
    const picker = page.locator('.visit-mascot-picker select');
    await expect(picker).toBeVisible();
    await expect(picker.locator('option[value="sprout-rive"]')).toHaveCount(1);
    await expect(picker.locator('option[value="scrap-rive"]')).toHaveCount(1);
    await expect(picker.locator('option[value="olu-spritesheet"]')).toHaveCount(1);
    await expect(picker.locator('option[value="tan-bird-spritesheet"]')).toHaveCount(1);

    await picker.selectOption('sprout-rive');

    await expect
      .poll(async () => page.locator('.visit-mascot-preview-body [data-mascot-id]').first().getAttribute('data-mascot-id'))
      .toBe('sprout-rive');
    await expect
      .poll(async () => page.locator('.visit-map-stage [data-mascot-id]').first().getAttribute('data-mascot-id'))
      .toBe('sprout-rive');
    await expect
      .poll(async () => page.locator('.visit-map-stage [data-mascot-shape]').first().getAttribute('data-mascot-shape'))
      .toBe('sprout');

    await picker.selectOption('scrap-rive');
    await expect
      .poll(async () => page.locator('.visit-mascot-preview-body [data-mascot-shape]').first().getAttribute('data-mascot-shape'))
      .toBe('scrap');
    await expect
      .poll(async () => page.locator('.visit-map-stage [data-mascot-shape]').first().getAttribute('data-mascot-shape'))
      .toBe('scrap');

    await picker.selectOption('olu-spritesheet');
    await expect
      .poll(async () => page.locator('.visit-mascot-preview-body [data-mascot-id]').first().getAttribute('data-mascot-id'))
      .toBe('olu-spritesheet');
    await expect
      .poll(async () => page.locator('.visit-map-stage [data-mascot-shape]').first().getAttribute('data-mascot-shape'))
      .toBe('olu');

    await picker.selectOption('tan-bird-spritesheet');
    await expect
      .poll(async () => page.locator('.visit-mascot-preview-body [data-mascot-id]').first().getAttribute('data-mascot-id'))
      .toBe('tan-bird-spritesheet');
    await expect
      .poll(async () => page.locator('.visit-map-stage [data-mascot-shape]').first().getAttribute('data-mascot-shape'))
      .toBe('tanBird');

    const preview = page.locator('.visit-mascot-preview-card');
    await expect(preview.getByRole('button', { name: /Course/i })).toBeVisible();
    await expect(preview.getByRole('button', { name: /Inspecte/i })).toBeVisible();
    await expect(preview.getByRole('button', { name: /Lit la carte/i })).toBeVisible();
    await expect(preview.getByRole('button', { name: /Célèbre/i })).toBeVisible();

    await preview.getByRole('button', { name: /Course/i }).click();
    await expect
      .poll(async () => page.locator('.visit-mascot-preview-body [data-mascot-state]').first().getAttribute('data-mascot-state'))
      .toBe('running');
    await preview.getByRole('button', { name: /Inspecte/i }).click();
    await expect
      .poll(async () => page.locator('.visit-mascot-preview-body [data-mascot-state]').first().getAttribute('data-mascot-state'))
      .toBe('inspect');
  });
});
