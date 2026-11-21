const { test, expect, devices } = require('@playwright/test');
const { loginAsTeacherAdminApi } = require('./fixtures/auth.fixture');

/**
 * Audit UI/UX du 19/11/2026, lot I — repère touchable sous une pastille de regroupement.
 *
 * Sur la Visite de la forêt, un repère laissé seul tombait sous la pastille du groupe voisin :
 * le doigt ouvrait la pastille, jamais la fiche (`src/shared/pct-map/clusterMarkers.js`, seconde
 * passe de séparation). Ce scénario pose sur la carte « forêt » les repères aux positions où le
 * défaut a été relevé, puis vérifie par `elementFromPoint` que **chaque** repère et chaque
 * pastille visibles reçoivent bien le toucher en leur centre — sur téléphone et sur ordinateur —
 * et ouvre la fiche d'un repère isolé par un vrai clic.
 *
 * La mascotte de la Visite est un personnage mobile posé au-dessus de la carte : ce qu'elle
 * recouvre là où elle se trouve n'est pas l'objet de ce scénario, elle est donc écartée de la
 * lecture du point (`elementsFromPoint`), et le repère ouvert est choisi hors de sa silhouette.
 */

const MAP_ID = 'foret';
const LABEL_PREFIX = 'E2E toucher';

/** Positions (% de l'image) des repères de la carte « forêt », arrondies. */
const FOREST_PCT = [
  [50.72, 6.04],
  [23.19, 11.36],
  [46.76, 12.29],
  [52.96, 14.21],
  [26.44, 19.59],
  [36.08, 19.66],
  [59.74, 26.31],
  [47.2, 31.12],
  [24.86, 31.2],
  [56.74, 31.43],
  [41.46, 33.14],
  [28.57, 39.56],
  [35.35, 42.96],
  [30.25, 48.3],
  [84.55, 54.43],
  [42.78, 57.19],
  [37.93, 64.24],
  [69.48, 71.44],
  [51.86, 75.98],
  [61.19, 86.19],
  [53.58, 92.33],
];

/** Repère isolé à toute taille d'écran (loin des autres et du centre, où attend la mascotte). */
const ISOLATED_INDEX = 14;

let adminHeaders = null;
let seededIds = [];

async function listSeededMarkers(request) {
  const res = await request.get(`/api/visit/content?map_id=${MAP_ID}`, { headers: adminHeaders });
  if (!res.ok()) throw new Error(`GET /api/visit/content ${res.status()}: ${await res.text()}`);
  const body = await res.json();
  return (body.markers || []).filter((m) => String(m.label || '').startsWith(LABEL_PREFIX));
}

async function deleteMarkers(request, ids) {
  for (const id of ids) {
    await request
      .delete(`/api/map/markers/${encodeURIComponent(id)}`, { headers: adminHeaders })
      .catch(() => null);
  }
}

test.describe.serial('Visite : chaque repère visible est touchable', () => {
  test.beforeAll(async ({ request }) => {
    const token = await loginAsTeacherAdminApi({ request });
    adminHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    // Restes d'une exécution interrompue : la mesure porte sur un jeu de repères connu.
    await deleteMarkers(
      request,
      (await listSeededMarkers(request)).map((m) => m.id),
    );
    seededIds = [];
    for (let index = 0; index < FOREST_PCT.length; index += 1) {
      const [x, y] = FOREST_PCT[index];
      const res = await request.post('/api/visit/markers', {
        headers: adminHeaders,
        data: {
          map_id: MAP_ID,
          x_pct: x,
          y_pct: y,
          label: `${LABEL_PREFIX} ${String(index).padStart(2, '0')}`,
          emoji: '🌳',
          sort_order: index,
        },
      });
      if (!res.ok())
        throw new Error(`POST /api/visit/markers ${res.status()}: ${await res.text()}`);
      seededIds.push((await res.json()).id);
    }
  });

  test.afterAll(async ({ request }) => {
    if (adminHeaders) await deleteMarkers(request, seededIds);
  });

  /** Ouvre la Visite publique sur la carte « forêt » et attend que tous les repères y soient. */
  async function openForestVisit(page) {
    await page.goto('/');
    await page.getByRole('button', { name: /Découvrir le lieu/i }).click({ timeout: 60_000 });
    await expect(page.locator('.visit-view--guest-public')).toBeVisible({ timeout: 60_000 });
    const stage = page.locator('.visit-map-stage');
    const mapSelect = page.locator('.visit-view--guest-public select').first();
    if ((await mapSelect.count()) > 0 && (await mapSelect.inputValue()) !== MAP_ID) {
      await mapSelect.selectOption(MAP_ID);
    }
    await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 30_000 });
    // Repères seuls + repères fondus dans une pastille = tous les repères posés.
    await expect
      .poll(
        () =>
          stage.evaluate((el, prefix) => {
            let total = 0;
            for (const marker of el.querySelectorAll('.fm-pct-marker')) {
              if ((marker.getAttribute('aria-label') || '').startsWith(prefix)) total += 1;
            }
            for (const pill of el.querySelectorAll('.fm-pct-cluster')) {
              total += Number.parseInt(pill.getAttribute('aria-label') || '0', 10) || 0;
            }
            return total;
          }, LABEL_PREFIX),
        { timeout: 30_000 },
      )
      .toBe(FOREST_PCT.length);
    await stage.scrollIntoViewIfNeeded();
    return stage;
  }

  /**
   * Pour chaque repère et chaque pastille dans le cadre : l'élément qui reçoit le toucher en
   * son centre. Renvoie ceux qui ne se reçoivent pas eux-mêmes.
   */
  async function readCoveredTargets(stage) {
    return stage.evaluate((el) => {
      const frame = el.getBoundingClientRect();
      const describe = (node) =>
        node
          ? `${node.tagName.toLowerCase()}.${String(node.className?.baseVal ?? node.className).split(' ')[0]} « ${node.getAttribute?.('aria-label') || ''} »`
          : 'rien';
      const covered = [];
      let checked = 0;
      let singles = 0;
      for (const target of el.querySelectorAll('.fm-pct-marker, .fm-pct-cluster')) {
        const box = target.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        if (x < frame.left || x > frame.right || y < frame.top || y > frame.bottom) continue;
        checked += 1;
        if (target.classList.contains('fm-pct-marker')) singles += 1;
        const top = document
          .elementsFromPoint(x, y)
          .find((node) => !node.closest('.visit-map-mascot'));
        if (!top || !(top === target || target.contains(top))) {
          covered.push(`${describe(target)} sous ${describe(top)}`);
        }
      }
      return { covered, checked, singles };
    });
  }

  async function expectEveryTargetTouchable(page) {
    const stage = await openForestVisit(page);
    const { covered, checked, singles } = await readCoveredTargets(stage);
    expect(checked).toBeGreaterThan(0);
    expect(singles).toBeGreaterThan(0);
    expect(covered).toEqual([]);
    return stage;
  }

  async function openIsolatedMarker(page, stage) {
    const label = `${LABEL_PREFIX} ${String(ISOLATED_INDEX).padStart(2, '0')}`;
    const marker = stage.locator(`.fm-pct-marker[aria-label^="${label}"]`);
    await expect(marker).toHaveCount(1);
    // Vrai clic, sans `force` : Playwright refuse de cliquer si un autre élément prend le point.
    await marker.click();
    const sheet = page.getByTestId('visit-detail-panel');
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    await expect(sheet).toContainText(label);
  }

  test.describe('téléphone (iPhone 13)', () => {
    const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];
    test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

    test('aucun repère sous une pastille, la fiche d’un repère isolé s’ouvre', async ({ page }) => {
      test.setTimeout(180_000);
      const stage = await expectEveryTargetTouchable(page);
      // Sur téléphone, la carte de la forêt regroupe : le cas du défaut est bien exercé.
      await expect(stage.locator('.fm-pct-cluster').first()).toBeVisible();
      await openIsolatedMarker(page, stage);
    });
  });

  test.describe('ordinateur (1 440 px)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('aucun repère recouvert, la fiche d’un repère isolé s’ouvre', async ({ page }) => {
      test.setTimeout(180_000);
      const stage = await expectEveryTargetTouchable(page);
      await openIsolatedMarker(page, stage);
    });
  });
});
