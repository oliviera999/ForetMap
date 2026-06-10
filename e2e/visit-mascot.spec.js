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
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=';

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
  /* `force` : le panneau lieu plein écran peut recouvrir le plan tant qu’un lieu reste sélectionné. */
  await fit.click({ position: { x: (xpPct / 100) * box.width, y: (ypPct / 100) * box.height }, force: true });
}

/**
 * Attend un rendu mascotte mesurable (Rive, spritesheet ou sprite_cut).
 * @param {import('@playwright/test').Locator} stage
 */
async function expectVisitMascotPaintReady(stage) {
  await expect
    .poll(async () => {
      const inner = stage.locator('.visit-map-mascot-inner').first();
      return inner.evaluate((el) => {
        const riveShell = el.querySelector('.visit-map-mascot-rive-shell');
        if (riveShell) {
          const staticSvg = riveShell.querySelector('.visit-map-mascot-static svg');
          if (staticSvg) {
            const box = staticSvg.getBoundingClientRect();
            if (box.width > 2 && box.height > 2) return true;
          }
          const canvas = riveShell.querySelector('canvas');
          if (canvas) {
            const box = canvas.getBoundingClientRect();
            if (box.width > 2 && box.height > 2) return true;
          }
        }
        const sheetShell = el.querySelector('.visit-map-mascot-spritesheet-shell');
        if (sheetShell) {
          const sheetDiv = sheetShell.querySelector('.visit-map-mascot-spritesheet, .visit-map-mascot-sprite-cut');
          if (sheetDiv) {
            const box = sheetDiv.getBoundingClientRect();
            if (box.width > 2 && box.height > 2) return true;
          }
          const staticSvg = sheetShell.querySelector('.visit-map-mascot-static svg');
          if (staticSvg) {
            const box = staticSvg.getBoundingClientRect();
            if (box.width > 2 && box.height > 2) return true;
          }
        }
        return false;
      });
    }, { timeout: 25_000 })
    .toBe(true);
}

async function openVisitMap(page, mapId = 'n3') {
  // [DIAG #54 — TEMPORAIRE] capture console/erreurs/requêtes navigateur + traçage
  // de l'étape bloquante. À retirer une fois la cause identifiée.
  const diagLogs = [];
  const onConsole = (m) => diagLogs.push(`[console:${m.type()}] ${m.text()}`);
  const onPageError = (e) => diagLogs.push(`[pageerror] ${e.message}`);
  const onReqFailed = (r) => diagLogs.push(`[reqfail] ${r.url()} :: ${r.failure() ? r.failure().errorText : ''}`);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onReqFailed);
  // Borne TOUTES les actions à 20s : un hang échoue de façon rattrapable (et non
  // via le timeout de hook 60s qui tue le catch avant le dump).
  page.setDefaultTimeout(20_000);
  const off = () => {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('requestfailed', onReqFailed);
  };

  let lastStep = 'init';
  try {
    lastStep = 'dismiss-modal-1';
    await dismissProfilePromotionModalIfPresent(page);
    lastStep = 'click-Visite';
    await page.getByRole('button', { name: /^🧭 Visite$/ }).click({ timeout: 20_000 });
    lastStep = 'visit-view-visible';
    await expect(page.locator('.visit-view')).toBeVisible({ timeout: 20_000 });
    const mapSelect = page.getByRole('combobox', { name: 'Sélection de carte visite' });
    lastStep = 'map-select';
    if (mapId && (await mapSelect.isVisible({ timeout: 5000 }).catch(() => false))) {
      await mapSelect.selectOption(mapId);
    }
    const stage = page.locator('.visit-map-stage');
    lastStep = 'stage-visible';
    await expect(stage).toBeVisible({ timeout: 20_000 });
    lastStep = 'map-img-visible';
    await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 20_000 });
    /* Le conteneur .visit-map-mascot est volontairement en 0×0 (ancrage %) : Playwright le voit « hidden ». */
    lastStep = 'mascot-attached';
    await expect(stage.locator('.visit-map-mascot')).toBeAttached();
    lastStep = 'mascot-inner-visible';
    await expect(stage.locator('.visit-map-mascot-inner')).toBeVisible({ timeout: 20_000 });
    lastStep = 'paint-ready';
    await expectVisitMascotPaintReady(stage);
    off();
    return stage;
  } catch (err) {
    const info = await page.evaluate(() => ({
      url: location.href,
      visitView: !!document.querySelector('.visit-view'),
      stage: !!document.querySelector('.visit-map-stage'),
      mapImg: !!document.querySelector('img.visit-map-img'),
      mascot: !!document.querySelector('.visit-map-mascot'),
      mascotInner: !!document.querySelector('.visit-map-mascot-inner'),
      riveShell: (() => {
        const s = document.querySelector('.visit-map-mascot-rive-shell');
        return s ? { renderer: s.getAttribute('data-renderer'), riveStatus: s.getAttribute('data-rive-status') } : null;
      })(),
      visiteBtn: !!Array.from(document.querySelectorAll('button')).find((b) => /🧭 Visite/.test(b.textContent || '')),
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 280),
    })).catch((e) => ({ evalError: String(e) }));
    // eslint-disable-next-line no-console
    console.log(`\n[DIAG #54] === openVisitMap a échoué à l'étape: ${lastStep} ===\n` + JSON.stringify(info, null, 2));
    // eslint-disable-next-line no-console
    console.log('[DIAG #54] === logs navigateur (40 derniers) ===\n' + diagLogs.slice(-40).join('\n') + '\n');
    off();
    throw err;
  }
}

test.describe.serial('mascotte visite (comportement carte)', () => {
  /** @type {{ n3: { zoneId: string, markerAId: string, markerBId: string, entranceId: string } } | null} */
  let seededIds = null;
  /** @type {string} */
  let teacherToken = '';
  /** @type {string} */
  let seededSuffix = '';
  /** @type {{ x_pct: number, y_pct: number }} */
  let entrancePct = { x_pct: 22, y_pct: 18 };

  test.beforeEach(async ({ page }) => {
    seededIds = null;
    teacherToken = '';
    seededSuffix = '';
    entrancePct = { x_pct: 22, y_pct: 18 };
    await loginAsNewStudent(page);
    await dismissProfilePromotionModalIfPresent(page);
    await enableTeacherMode(page);
    const seeded = await seedVisitMascotContent(page);
    teacherToken = seeded.token;
    seededSuffix = seeded.suffix;
    entrancePct = seeded.entrancePct || entrancePct;
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
    const shell = stage.locator('.visit-map-mascot-rive-shell, .visit-map-mascot-spritesheet-shell').first();
    await expect(shell).toBeVisible();
  });

  test('position initiale sous le repère entrée N3 (plan n3)', async ({ page }) => {
    const { xp, yp } = await readMascotPct(page);
    expect(Math.abs(xp - entrancePct.x_pct)).toBeLessThan(1.2);
    const expectedY = entrancePct.y_pct + N3_ENTRANCE_Y_OFFSET;
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
    /* Repères seedés (88,50) puis (12,50) : `moveVisitMapMascotTo` via boutons — pas le clic fond (backdrop si panneau ouvert). */
    await stage.getByRole('button', { name: `E2E mascotte B ${seededSuffix}` }).click({ force: true });
    await expect(mascot).toBeAttached();
    await page.getByTestId('visit-detail-panel').getByRole('button', { name: 'Fermer' }).click();
    await stage.getByRole('button', { name: `E2E mascotte A ${seededSuffix}` }).click({ force: true });
    await expect(mascot).toHaveClass(/visit-map-mascot--walking/, { timeout: 2000 });
    await expect(mascot).not.toHaveClass(/visit-map-mascot--walking/, { timeout: VISIT_MAP_MASCOT_MOVE_MS + 400 });
  });

  test('marquer vu déclenche état happy et bulle', async ({ page }) => {
    await clickVisitMapAtPct(page, 88, 50);
    /* Panneau lieu après fin de déplacement mascotte (délai aligné sur VISIT_MAP_MASCOT_MOVE_MS côté app). */
    await expect(page.getByRole('button', { name: /Marquer comme vu|Marqué comme vu/i })).toBeVisible({
      timeout: VISIT_MAP_MASCOT_MOVE_MS + 15_000,
    });
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

  test('le sélecteur change bien la mascotte active (studio Packs mascotte)', async ({ page }) => {
    const openStudioPreview = async () => {
      await page.getByRole('button', { name: /Packs mascotte/i }).click();
      await expect(page.locator('.visit-mascot-pack-manager')).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: 'Nouveau brouillon' }).click();
      await expect(page.getByRole('tab', { name: 'Édition guidée' })).toBeVisible({ timeout: 30_000 });
      await page.getByRole('tab', { name: 'Aperçu global' }).click();
    };
    await openStudioPreview();
    const picker = page.locator('.visit-mascot-pack-manager .visit-mascot-picker select');
    await expect(picker).toBeVisible({ timeout: 15_000 });
    await expect(picker.locator('option[value="sprout-rive"]')).toHaveCount(1);
    await expect(picker.locator('option[value="scrap-rive"]')).toHaveCount(1);
    await expect(picker.locator('option[value="olu-spritesheet"]')).toHaveCount(1);
    await expect(picker.locator('option[value="tan-bird-spritesheet"]')).toHaveCount(1);
    await expect(picker.locator('option[value="fox-backpack-spritesheet"]')).toHaveCount(1);
    await expect(picker.locator('option[value="renard2-cut-spritesheet"]')).toHaveCount(1);

    const previewRoot = page.locator('.visit-mascot-pack-manager .visit-mascot-preview-card');

    await picker.selectOption('sprout-rive');
    await expect
      .poll(async () => previewRoot.locator('.visit-mascot-preview-body [data-mascot-id]').first().getAttribute('data-mascot-id'))
      .toBe('sprout-rive');
    await page.getByRole('button', { name: /^🧭 Visite$/ }).click();
    await expect
      .poll(async () => page.locator('.visit-map-stage [data-mascot-id]').first().getAttribute('data-mascot-id'))
      .toBe('sprout-rive');
    await expect
      .poll(async () => page.locator('.visit-map-stage [data-mascot-shape]').first().getAttribute('data-mascot-shape'))
      .toBe('sprout');

    await openStudioPreview();
    await picker.selectOption('scrap-rive');
    await expect
      .poll(async () => previewRoot.locator('.visit-mascot-preview-body [data-mascot-shape]').first().getAttribute('data-mascot-shape'))
      .toBe('scrap');
    await page.getByRole('button', { name: /^🧭 Visite$/ }).click();
    await expect
      .poll(async () => page.locator('.visit-map-stage [data-mascot-shape]').first().getAttribute('data-mascot-shape'))
      .toBe('scrap');

    await openStudioPreview();
    await picker.selectOption('olu-spritesheet');
    await expect
      .poll(async () => previewRoot.locator('.visit-mascot-preview-body [data-mascot-id]').first().getAttribute('data-mascot-id'))
      .toBe('olu-spritesheet');
    await page.getByRole('button', { name: /^🧭 Visite$/ }).click();
    await expect
      .poll(async () => page.locator('.visit-map-stage [data-mascot-shape]').first().getAttribute('data-mascot-shape'))
      .toBe('olu');

    await openStudioPreview();
    await picker.selectOption('tan-bird-spritesheet');
    await expect
      .poll(async () => previewRoot.locator('.visit-mascot-preview-body [data-mascot-id]').first().getAttribute('data-mascot-id'))
      .toBe('tan-bird-spritesheet');
    await page.getByRole('button', { name: /^🧭 Visite$/ }).click();
    await expect
      .poll(async () => page.locator('.visit-map-stage [data-mascot-shape]').first().getAttribute('data-mascot-shape'))
      .toBe('tanBird');

    await openStudioPreview();
    await picker.selectOption('fox-backpack-spritesheet');
    await expect
      .poll(async () => previewRoot.locator('.visit-mascot-preview-body [data-mascot-id]').first().getAttribute('data-mascot-id'))
      .toBe('fox-backpack-spritesheet');
    await page.getByRole('button', { name: /^🧭 Visite$/ }).click();
    await expect
      .poll(async () => page.locator('.visit-map-stage [data-mascot-shape]').first().getAttribute('data-mascot-shape'))
      .toBe('backpackFox');

    await openStudioPreview();
    await picker.selectOption('renard2-cut-spritesheet');
    await expect
      .poll(async () => previewRoot.locator('.visit-mascot-preview-body [data-mascot-id]').first().getAttribute('data-mascot-id'))
      .toBe('renard2-cut-spritesheet');
    await page.getByRole('button', { name: /^🧭 Visite$/ }).click();
    await expect
      .poll(async () => page.locator('.visit-map-stage [data-mascot-shape]').first().getAttribute('data-mascot-shape'))
      .toBe('backpackFox2');
    await openStudioPreview();
    await expect
      .poll(async () => previewRoot.locator('.visit-mascot-preview-body [data-renderer]').first().getAttribute('data-renderer'))
      .toBe('sprite-cut');
    await page.getByRole('button', { name: /^🧭 Visite$/ }).click();
    await expect
      .poll(async () => page.locator('.visit-map-stage [data-renderer]').first().getAttribute('data-renderer'))
      .toBe('sprite-cut');

    await openStudioPreview();
    await expect(previewRoot.getByRole('button', { name: /Course/i })).toBeVisible();
    await expect(previewRoot.getByRole('button', { name: /Inspecte/i })).toBeVisible();
    await expect(previewRoot.getByRole('button', { name: /Lit la carte/i })).toBeVisible();
    await expect(previewRoot.getByRole('button', { name: /Célèbre/i })).toBeVisible();

    await previewRoot.getByRole('button', { name: /Course/i }).click();
    await expect
      .poll(async () => previewRoot.locator('.visit-mascot-preview-body [data-mascot-state]').first().getAttribute('data-mascot-state'))
      .toBe('running');
    await previewRoot.getByRole('button', { name: /Inspecte/i }).click();
    await expect
      .poll(async () => previewRoot.locator('.visit-mascot-preview-body [data-mascot-state]').first().getAttribute('data-mascot-state'))
      .toBe('inspect');
  });
});

test.describe('pack mascotte serveur (GUI)', () => {
  test('ouvre le studio depuis l’onglet Packs mascotte (prof)', async ({ page }) => {
    await loginAsNewStudent(page);
    await dismissProfilePromotionModalIfPresent(page);
    await enableTeacherMode(page);
    await seedVisitMascotContent(page);
    await page.getByRole('button', { name: /Packs mascotte/i }).click();
    await expect(page.locator('.visit-mascot-pack-manager')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Packs mascotte (visite)' })).toBeVisible();
  });

  test('brouillon mascotte: upload + assignation + save + publish + usage en visite', async ({ page }) => {
    await loginAsNewStudent(page);
    await dismissProfilePromotionModalIfPresent(page);
    await enableTeacherMode(page);
    await seedVisitMascotContent(page);

    await page.getByRole('button', { name: /Packs mascotte/i }).click();
    await expect(page.locator('.visit-mascot-pack-manager')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Nouveau brouillon' }).click();

    await expect(page.locator('.visit-mascot-pack-manager aside button[aria-label^="Ouvrir le pack"][aria-pressed="true"]').first()).toBeVisible({ timeout: 20_000 });
    const packLabel = `Pack e2e ${Date.now()}`;
    await page.getByPlaceholder('Nom du pack').fill(packLabel);

    const uploadInput = page.locator('.mascot-pack-wysiwyg__library input[type="file"]').first();
    const uploadName = `idle-${Date.now()}.png`;
    await uploadInput.setInputFiles({
      name: uploadName,
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_B64, 'base64'),
    });
    const mediaThumb = page.locator('.mascot-pack-wysiwyg__asset-thumb').first();
    await expect(mediaThumb).toBeVisible({ timeout: 15_000 });
    await mediaThumb.click();

    const walkingState = page.locator('.mascot-pack-wysiwyg__state').filter({ hasText: '(walking)' }).first();
    await expect(walkingState).toBeVisible({ timeout: 15_000 });
    const walkingToggle = walkingState.locator('summary input[type="checkbox"]');
    await walkingToggle.check();
    await walkingState.getByLabel('URLs absolues (srcs) — dev / blob').check();
    await walkingState.getByRole('button', { name: '+ URL' }).click();
    const srcField = walkingState.getByPlaceholder('https://… ou blob:…').first();
    const srcUrl = `data:image/png;base64,${TINY_PNG_B64}`;
    await srcField.fill(srcUrl);

    await page.getByRole('button', { name: 'Enregistrer sur le serveur' }).click();
    await page.getByRole('button', { name: 'Publier sur la visite' }).click();

    await expect.poll(async () => {
      const contentByMap = {};
      for (const mapId of ['foret', 'n3']) {
        const res = await page.request.get(`/api/visit/content?map_id=${mapId}`);
        if (!res.ok()) return false;
        contentByMap[mapId] = await res.json();
      }
      const allPublished = ['foret', 'n3']
        .flatMap((mapId) => (Array.isArray(contentByMap[mapId]?.mascot_packs) ? contentByMap[mapId].mascot_packs : []));
      return allPublished.some((p) => p.label === packLabel);
    }, { timeout: 20_000, intervals: [500, 1000, 1500, 2000] }).toBeTruthy();

    const contentByMap = {};
    for (const mapId of ['foret', 'n3']) {
      const res = await page.request.get(`/api/visit/content?map_id=${mapId}`);
      expect(res.ok()).toBeTruthy();
      contentByMap[mapId] = await res.json();
    }
    const allPublished = ['foret', 'n3']
      .flatMap((mapId) => (Array.isArray(contentByMap[mapId]?.mascot_packs) ? contentByMap[mapId].mascot_packs : []));
    const publishedPack = allPublished.find((p) => p.label === packLabel);
    expect(!!publishedPack).toBeTruthy();
    const catalogId = String(publishedPack?.catalog_id || '');
    expect(catalogId.startsWith('srv-')).toBeTruthy();

    await page.getByRole('tab', { name: 'Aperçu global' }).click();
    const studioPicker = page.locator('.visit-mascot-pack-manager .visit-mascot-picker select').first();
    await expect(studioPicker).toBeVisible({ timeout: 20_000 });
    await studioPicker.selectOption(catalogId);
    await expect
      .poll(async () => page.locator('.visit-mascot-pack-manager .visit-mascot-preview-body [data-mascot-id]').first().getAttribute('data-mascot-id'))
      .toBe(catalogId);

    await page.getByRole('button', { name: /^🧭 Visite$/ }).click();
    const visitPicker = page.locator('.visit-view .visit-mascot-picker select').first();
    await expect(visitPicker).toBeVisible({ timeout: 20_000 });
    const visitOptionCount = await visitPicker.locator(`option[value="${catalogId}"]`).count();
    if (visitOptionCount > 0) {
      await visitPicker.selectOption(catalogId);
      await expect
        .poll(async () => page.locator('.visit-map-stage [data-mascot-id]').first().getAttribute('data-mascot-id'))
        .toBe(catalogId);
    }
  });
});
