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
  await expect(stage.locator('.visit-map-mascot-lottie--placeholder')).toHaveCount(0);
  await expect
    .poll(async () => {
      const lottie = stage.locator('.visit-map-mascot-lottie').first();
      return lottie.evaluate((el) => {
        const isTransparent = (value) => {
          const raw = String(value || '').trim().toLowerCase();
          if (!raw || raw === 'none' || raw === 'transparent') return true;
          if (raw.startsWith('rgba(') || raw.startsWith('hsla(')) {
            const parts = raw
              .replace(/^rgba?\(/, '')
              .replace(/^hsla?\(/, '')
              .replace(/\)$/, '')
              .split(',')
              .map((p) => p.trim());
            const alpha = Number(parts[3]);
            return Number.isFinite(alpha) ? alpha <= 0 : false;
          }
          return false;
        };
        const svg = el.querySelector('svg');
        if (svg) {
          const box = svg.getBoundingClientRect();
          if (box.width > 2 && box.height > 2) {
            const nodes = svg.querySelectorAll('path,circle,ellipse,rect,polygon,polyline,line');
            for (const node of nodes) {
              if (node.tagName === 'path') {
                const d = node.getAttribute('d');
                if (!d || !String(d).trim()) continue;
              }
              const st = window.getComputedStyle(node);
              const opacity = Number.parseFloat(st.opacity || '1');
              if (Number.isFinite(opacity) && opacity <= 0) continue;
              const strokeWidth = Number.parseFloat(st.strokeWidth || '0');
              const fillHidden = isTransparent(st.fill);
              const strokeHidden = isTransparent(st.stroke) || !(strokeWidth > 0);
              if (!(fillHidden && strokeHidden)) return true;
            }
          }
        }
        const canvas = el.querySelector('canvas');
        if (canvas) {
          const box = canvas.getBoundingClientRect();
          if (!(box.width > 2 && box.height > 2)) return false;
          const ctx = canvas.getContext('2d');
          if (!ctx || !(canvas.width > 1) || !(canvas.height > 1)) return false;
          const sampleCols = 6;
          const sampleRows = 6;
          let painted = 0;
          for (let row = 0; row < sampleRows; row += 1) {
            for (let col = 0; col < sampleCols; col += 1) {
              const x = Math.min(canvas.width - 1, Math.max(0, Math.round((col / (sampleCols - 1 || 1)) * (canvas.width - 1))));
              const y = Math.min(canvas.height - 1, Math.max(0, Math.round((row / (sampleRows - 1 || 1)) * (canvas.height - 1))));
              const px = ctx.getImageData(x, y, 1, 1).data;
              if ((px?.[3] || 0) > 8) painted += 1;
            }
          }
          return painted >= 2;
        }
        return false;
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
    await expect(stage.locator('.visit-map-mascot-lottie--placeholder')).toHaveCount(0);
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
