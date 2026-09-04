const { test, expect } = require('@playwright/test');

/**
 * Plan Lyautey — **mode parcours** (lot 8, `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.6).
 *
 * C'est le flux qu'un établissement imprime sur une affiche à son accueil : un visiteur scanne
 * un QR code et suit une liste de lieux. Il n'avait aucun filet e2e
 * (`docs/AUDIT_PARCOURS_2026-09.md` §3) — celui-ci couvre les deux entrées, la puce « Parcours »
 * et le lien profond `?parcours=`, plus la sortie.
 *
 * Le parcours est créé par l'API avec un compte professeur, puis retiré : la base locale n'a pas
 * à contenir de jeu de données particulier.
 */

const ADMIN_EMAIL = process.env.TEACHER_ADMIN_EMAIL || 'admin.test@foretmap.local';
const ADMIN_PASSWORD = process.env.TEACHER_ADMIN_PASSWORD || 'admin1234';

/** Jeton professeur (l'écriture des parcours demande `zones.manage`). */
async function teacherToken(request) {
  const res = await request.post('/api/auth/login', {
    data: { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (!res.ok()) return '';
  const body = await res.json();
  return String(body?.authToken || '');
}

test('plan : parcours par la puce, par lien profond, et sortie', async ({ page, request }) => {
  test.setTimeout(120_000);

  const contentRes = await request.get('/api/plan/content');
  expect(contentRes.ok()).toBeTruthy();
  const content = await contentRes.json();
  const mapId = String(content.map?.id || '');
  const zone = (content.zones || [])[0];
  const marker = (content.markers || [])[0];
  test.skip(!mapId || !zone || !marker, 'Le plan de cette base locale n’a pas deux lieux.');

  const token = await teacherToken(request);
  test.skip(!token, 'Compte professeur e2e indisponible.');
  const headers = { Authorization: `Bearer ${token}` };

  const slug = `e2e-parcours-${Date.now()}`;
  const created = await request.post('/api/map-routes', {
    headers,
    data: {
      map_id: mapId,
      title: 'Parcours e2e',
      slug,
      audience: 'Test automatisé',
      is_published: true,
      surfaces: ['plan'],
      steps: [
        { target_type: 'zone', target_id: zone.id, step_title: 'Première étape' },
        { target_type: 'marker', target_id: marker.id, step_title: 'Seconde étape' },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();
  const route = await created.json();

  try {
    // 1) Par la puce : le parcours se choisit sans quitter le plan.
    await page.goto('/');
    await expect(page.getByLabel('Rechercher un lieu')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /Parcours/ }).click();
    await page.getByRole('button', { name: /Parcours e2e/ }).click();

    const sheet = page.getByTestId('plan-route-sheet');
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(sheet.getByText('Première étape')).toBeVisible();
    await expect(sheet.getByText('Étape 1 sur 2')).toBeVisible();
    // L'URL porte le parcours : c'est elle qu'on imprime sous forme de QR code.
    await expect(page).toHaveURL(new RegExp(`parcours=${slug}`));

    await sheet.getByRole('button', { name: 'Suivant' }).click();
    await expect(sheet.getByText('Étape 2 sur 2')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Suivant' })).toBeDisabled();

    await sheet.getByRole('button', { name: 'Quitter le parcours' }).first().click();
    await expect(sheet).toBeHidden({ timeout: 15_000 });
    await expect(page).not.toHaveURL(/parcours=/);

    // 2) Par le lien profond : ce que voit un visiteur qui scanne l'affiche.
    await page.goto(`/?parcours=${slug}`);
    const deepSheet = page.getByTestId('plan-route-sheet');
    await expect(deepSheet).toBeVisible({ timeout: 30_000 });
    await expect(deepSheet.getByText('Première étape')).toBeVisible();

    // 3) Affiche périmée : le visiteur l'apprend au lieu d'arriver sur un plan nu.
    await page.goto('/?parcours=parcours-qui-nexiste-pas');
    await expect(page.getByText('Ce parcours n’est plus disponible.')).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await request.delete(`/api/map-routes/${route.id}`, { headers });
  }
});
