const { test, expect } = require('@playwright/test');

/**
 * « Orienter la carte selon la boussole » — lisibilité du texte sous rotation.
 *
 * Défaut d'origine (`docs/AUDIT_PLAN_AFFICHAGE_2026-09-13.md` N1) : la rotation était posée sur
 * `.plan-map__fit`, le calque qui porte **aussi** les étiquettes, les repères et les pastilles.
 * Rien ne contre-tournait le texte. Mesuré dans Chromium sur le DOM du produit, en cumulant les
 * matrices jusqu'au viewport : à un cap de 180°, l'angle du texte à l'écran était de 180° — les
 * noms de bâtiments étaient littéralement à l'envers. La fonction est opt-in, mais son usage
 * même consiste à pivoter sur soi : elle devenait illisible dès que l'on quittait le nord.
 *
 * Ce scénario refait exactement cette mesure, bout en bout : géolocalisation simulée, cap
 * simulé par un `deviceorientation` absolu, bouton 🧭 réellement cliqué. Il vérifie d'abord que
 * la carte a bien tourné — sans quoi l'assertion suivante serait vide de sens — puis que chaque
 * habillage lisible est resté droit.
 *
 * Aucun capteur réel n'entre en jeu : `context.setGeolocation` et un événement synthétique.
 */

/** Calage cohérent : le plan couvre ~[48.85, 48.86] × [2.30, 2.31]. */
const GEO_ANCHORS = [
  { xp: 10, yp: 10, lat: 48.86, lng: 2.3 },
  { xp: 90, yp: 10, lat: 48.86, lng: 2.31 },
  { xp: 10, yp: 90, lat: 48.85, lng: 2.3 },
];
/** Centre du plan (xp = yp = 50). */
const IN_MAP_POSITION = { latitude: 48.855, longitude: 2.305, accuracy: 10 };

/** Cap simulé, franc : 180° amène le texte à l'envers quand rien ne le contre-tourne. */
const HEADING_DEG = 180;

test.use({ geolocation: IN_MAP_POSITION, permissions: ['geolocation'] });

const PLAN_HEADERS = { 'X-Foretmap-Product': 'plan' };

/**
 * Jeton admin, ou `null` si la base locale n'a pas de compte professeur e2e.
 *
 * Ce scénario est **bloquant** en intégration : il doit donc se mettre de côté plutôt que
 * d'échouer quand l'environnement ne lui fournit pas de quoi travailler — même convention que
 * `plan-routes-mode.spec.js`, qui vit dans le même filet. Une absence de compte n'est pas une
 * régression d'affichage ; la confondre avec une régression rendrait le filet inutilisable.
 */
async function adminToken(request) {
  const email = process.env.TEACHER_ADMIN_EMAIL || 'admin.test@foretmap.local';
  const password = process.env.TEACHER_ADMIN_PASSWORD || 'admin1234';
  const res = await request.post('/api/auth/login', { data: { identifier: email, password } });
  if (!res.ok()) return null;
  return (await res.json())?.authToken || null;
}

/**
 * Angle du texte **à l'écran**, matrices cumulées jusqu'au viewport. C'est la seule mesure qui
 * réponde à la question posée : « ce nom est-il lisible ? ». Lire la seule `transform` de
 * l'élément ne dirait rien, puisque le retournement vient d'un ancêtre.
 */
const SCREEN_ANGLE = (selector) => {
  const el = document.querySelector(selector);
  if (!el) return null;
  let m = new DOMMatrix();
  for (let node = el; node; node = node.parentElement) {
    const t = getComputedStyle(node).transform;
    if (t && t !== 'none') m = new DOMMatrix(t).multiply(m);
  }
  // Ramené à (−180, 180] : une rotation de 359° est une rotation de −1°.
  const deg = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  return ((((deg + 180) % 360) + 360) % 360) - 180;
};

test('plan : le cap en haut fait tourner la carte sans retourner le texte', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const contentRes = await request.get('/api/plan/content', { headers: PLAN_HEADERS });
  expect(contentRes.ok()).toBeTruthy();
  const content = await contentRes.json();
  const mapId = content.map?.id;
  expect(mapId).toBeTruthy();

  // Les contrôles de la carte (« Voir tout le plan », « Me situer », pastilles) ne sont rendus
  // que si le plan a un fond d'image : `AppPlan` ne monte `PlanMapStage` que sous
  // `hasMapImage`. Sans cette garde, une base dont la carte n'a pas d'image fait échouer le
  // scénario sur un bouton absent, là où il n'y a en réalité rien à vérifier — c'est ce qui
  // rendait le smoke bloquant rouge en intégration. Garde posée **avant** les assertions
  // qu'elle protège, comme dans `plan-routes-mode.spec.js`.
  test.skip(!content.map?.map_image_url, 'La carte du plan de cette base locale n’a pas de fond.');

  const token = await adminToken(request);
  test.skip(!token, 'Compte professeur e2e indisponible : calage GPS impossible.');
  const auth = { Authorization: `Bearer ${token}` };

  // Le cap en haut exige les deux interrupteurs : celui de la carte et celui du produit.
  const georefRes = await request.put(`/api/settings/admin/maps/${mapId}/georef`, {
    headers: auth,
    data: { anchors: GEO_ANCHORS, gps_enabled: true, heading_up_enabled: true },
  });
  expect(georefRes.ok()).toBeTruthy();
  const settingRes = await request.put('/api/settings/admin/ui.plan.heading_up_enabled', {
    headers: auth,
    data: { value: true },
  });
  expect(settingRes.ok()).toBeTruthy();

  try {
    await page.goto('/');
    await expect(page.getByLabel('Rechercher un lieu')).toBeVisible({ timeout: 30_000 });

    const locate = page.getByTestId('plan-locate');
    await expect(locate).toBeVisible({ timeout: 15_000 });
    await locate.click();
    await expect(page.locator('.fm-pct-position').first()).toBeVisible({ timeout: 20_000 });

    // Cap simulé. Le produit lisse le cap (moyenne exponentielle) : un seul événement ne
    // suffit pas à converger, on en émet une série comme le ferait un vrai capteur immobile.
    const pushHeading = async () => {
      await page.evaluate(
        (alpha) => {
          // Le produit écoute `deviceorientationabsolute` quand le navigateur l'expose (Chromium),
          // sinon `deviceorientation` (`src/shared/pct-map/useMapPosition.js`) : on émet sur les
          // deux noms, comme le ferait la plateforme selon le capteur disponible.
          const names = ['deviceorientationabsolute', 'deviceorientation'];
          for (let i = 0; i < 40; i += 1) {
            for (const name of names) {
              const event = new Event(name);
              Object.defineProperty(event, 'alpha', { value: alpha });
              Object.defineProperty(event, 'absolute', { value: true });
              window.dispatchEvent(event);
            }
          }
        },
        (360 - HEADING_DEG) % 360,
      );
    };
    await pushHeading();

    const headingUp = page.getByTestId('plan-heading-up');
    await expect(headingUp).toBeEnabled({ timeout: 20_000 });
    await headingUp.click();
    await pushHeading();

    // 1. La carte a bien tourné. Sans ce contrôle, l'assertion de lisibilité passerait aussi
    //    sur une carte restée au nord — c'est-à-dire sans rien prouver du tout.
    await expect
      .poll(async () => Math.abs(await page.evaluate(SCREEN_ANGLE, '.plan-map__fit')), {
        timeout: 20_000,
        message: 'le calque carte n’a pas tourné : le scénario ne prouverait rien',
      })
      .toBeGreaterThan(30);

    // 2. Le texte, lui, est resté droit. C'est la mesure exacte du constat N1, qui donnait
    //    180° sur ce même sélecteur.
    for (const selector of ['.fm-pct-label', '.fm-pct-marker']) {
      const present = await page.locator(selector).first().count();
      if (!present) continue;
      const angle = await page.evaluate(SCREEN_ANGLE, selector);
      expect(Math.abs(angle), `${selector} doit rester lisible, mesuré à ${angle}°`).toBeLessThan(
        1,
      );
    }
  } finally {
    await request
      .put(`/api/settings/admin/maps/${mapId}/georef`, {
        headers: auth,
        data: { anchors: [], gps_enabled: false, heading_up_enabled: false },
      })
      .catch(() => {});
    await request
      .put('/api/settings/admin/ui.plan.heading_up_enabled', {
        headers: auth,
        data: { value: false },
      })
      .catch(() => {});
  }
});
