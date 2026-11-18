const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  loginAsTeacherAdminApi,
  dismissProfilePromotionModalIfPresent,
  openStudentTasksTab,
} = require('./fixtures/auth.fixture');

/**
 * Chantier « parcours d'apprentissage », lot 5 — rejeu élève sur téléphone (375 × 667).
 *
 *  1. Séance guidée de bout en bout : le bandeau reste visible et cliquable (étape « message »
 *     comme par-dessus la fiche ouverte par l'étape), affiche « Étape n sur N » ; la séance
 *     reprend à la bonne étape après un rechargement ET dans un nouvel onglet ; la fin est
 *     enregistrée, dans une seule fenêtre.
 *  2. Tâche jusqu'au compte rendu : « Marquer terminée » est sur la carte de « Mes tâches »
 *     sans dépliage, au-dessus de la barre basse ; compte rendu sans commentaire ni photo.
 */
test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

const VIEWPORT_H = 667;

/** Lecture authentifiée côté navigateur, avec le jeton de l'élève connecté. */
async function studentFetchJson(page, url) {
  return page.evaluate(async (path) => {
    let token = null;
    try {
      const session = JSON.parse(localStorage.getItem('foretmap_session') || 'null');
      token = session?.token || session?.authToken || null;
    } catch (_) {
      token = null;
    }
    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('foretmap_student') || 'null')?.authToken || null;
      } catch (_) {
        token = null;
      }
    }
    const r = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, url);
}

function readStudentSnapshot(page) {
  return page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('foretmap_session') || 'null')?.student;
      return s ? { id: s.id, first_name: s.first_name, last_name: s.last_name } : null;
    } catch (_) {
      return null;
    }
  });
}

/** Le bandeau est entièrement dans l'écran (ni hors champ, ni sous le bas de la fenêtre). */
async function expectBannerOnScreen(page) {
  const banner = page.getByTestId('pedago-session-banner');
  await expect(banner).toBeVisible({ timeout: 20_000 });
  const box = await banner.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(VIEWPORT_H + 1);
  return banner;
}

test('téléphone : séance guidée de bout en bout, reprise après rechargement et nouvel onglet', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  const slug = `e2e-seance-tel-${stamp}`;
  const title = `Séance téléphone ${stamp}`;

  const adminToken = await loginAsTeacherAdminApi(page);
  const auth = { Authorization: `Bearer ${adminToken}` };
  const plantsResp = await page.request.get('/api/plants', { headers: auth });
  const plants = await plantsResp.json();
  const plantList = Array.isArray(plants) ? plants : plants?.items || [];
  const plantId = Number(plantList[0]?.id);
  expect(plantId).toBeGreaterThan(0);

  const created = await page.request.post('/api/pedago-sessions', {
    headers: auth,
    data: {
      templateKey: 'custom',
      title,
      slug,
      isPublished: true,
      steps: [
        {
          title: 'Observer de loin',
          body: 'Regarde les arbres autour de toi sans les approcher.',
          action: { type: 'message', payload: {} },
        },
        {
          title: 'Lire la fiche',
          body: 'Repère le nom de la plante.',
          action: { type: 'open_plant', payload: { plantId } },
        },
        {
          title: 'Ce que tu retiens',
          body: 'Note une chose que tu as apprise.',
          action: { type: 'message', payload: {} },
        },
      ],
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const sessionId = (await created.json()).id;

  try {
    await loginAsNewStudent(page);
    await dismissProfilePromotionModalIfPresent(page);

    // Lien direct de la classe : la séance démarre à l'étape 1.
    await page.goto(`/?seance=${slug}`);
    await dismissProfilePromotionModalIfPresent(page);
    let banner = await expectBannerOnScreen(page);
    await expect(banner.getByTestId('pedago-session-progress')).toHaveText('Étape 1 sur 3');
    await expect(page.getByTestId('pedago-session-message')).toContainText('Observer de loin');

    // Étape 2 (fiche) : la fenêtre de la fiche s'ouvre, le bandeau reste au-dessus.
    const progressSaved = page.waitForResponse(
      (r) => r.url().includes('/runs/progress') && r.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await banner.getByRole('button', { name: 'Suivant' }).click();
    expect((await progressSaved).status()).toBe(200);
    await expect(banner.getByTestId('pedago-session-progress')).toHaveText('Étape 2 sur 3');
    await expect(page.locator('.modal-overlay, .fm-modal-overlay').first()).toBeVisible({
      timeout: 20_000,
    });
    await expectBannerOnScreen(page);
    // Le point central du bouton « Suivant » appartient bien au bandeau (pas à la fiche).
    const nextOnTop = await banner.getByRole('button', { name: 'Suivant' }).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && el.contains(hit);
    });
    expect(nextOnTop).toBe(true);

    // Rechargement à mi-parcours : même onglet, même étape.
    await page.reload();
    await dismissProfilePromotionModalIfPresent(page);
    banner = await expectBannerOnScreen(page);
    await expect(banner.getByTestId('pedago-session-progress')).toHaveText('Étape 2 sur 3');

    // Nouvel onglet (sessionStorage vide) : la reprise vient du serveur.
    const page2 = await context.newPage();
    await page2.goto(`/?seance=${slug}`);
    await dismissProfilePromotionModalIfPresent(page2);
    const banner2 = await expectBannerOnScreen(page2);
    await expect(banner2.getByTestId('pedago-session-progress')).toHaveText('Étape 2 sur 3');
    const runs = await studentFetchJson(page2, '/api/pedago-sessions/me/runs');
    const run = runs.body.runs.find((r) => r.sessionId === sessionId);
    expect(run).toMatchObject({ inProgress: true, currentStep: 1, startCount: 1 });

    // Fin depuis le nouvel onglet : une seule fenêtre de fin, fin enregistrée.
    await banner2.getByRole('button', { name: 'Suivant' }).click();
    await expect(banner2.getByTestId('pedago-session-progress')).toHaveText('Étape 3 sur 3');
    const completed = page2.waitForResponse(
      (r) => r.url().includes('/runs/complete') && r.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await banner2.getByRole('button', { name: 'Terminer' }).click();
    expect((await completed).status()).toBe(200);
    const done = page2.getByTestId('pedago-session-done');
    await expect(done).toBeVisible();
    await expect(page2.getByTestId('reward-celebration-host')).toHaveCount(0);
    await expect(page2.getByTestId('pedago-session-banner')).toHaveCount(0);
    const after = await studentFetchJson(page2, '/api/pedago-sessions/me/runs');
    expect(after.body.runs.find((r) => r.sessionId === sessionId)).toMatchObject({
      completionCount: 1,
      inProgress: false,
      currentStep: null,
    });
    await done.getByRole('button', { name: 'Fermer' }).click();
    await expect(done).toHaveCount(0);
    await expect(page2.getByTestId('reward-celebration-host')).toHaveCount(0);
    await page2.close();
  } finally {
    await page.request
      .put(`/api/pedago-sessions/${sessionId}`, { headers: auth, data: { isPublished: false } })
      .catch(() => {});
  }
});

test('téléphone : tâche jusqu’au compte rendu, bouton visible sans dépliage', async ({ page }) => {
  test.setTimeout(240_000);
  const taskTitle = `E2E Tel ${Date.now()}`;
  const adminToken = await loginAsTeacherAdminApi(page);
  const auth = { Authorization: `Bearer ${adminToken}` };

  await loginAsNewStudent(page);
  await dismissProfilePromotionModalIfPresent(page);
  const student = await readStudentSnapshot(page);
  expect(student?.id).toBeTruthy();

  const createdTask = await page.request.post('/api/tasks', {
    headers: auth,
    data: { title: taskTitle, required_students: 1 },
  });
  expect(createdTask.ok(), await createdTask.text()).toBeTruthy();
  const taskId = (await createdTask.json()).id;
  const assigned = await page.request.post(`/api/tasks/${taskId}/assign`, {
    headers: auth,
    data: { firstName: student.first_name, lastName: student.last_name, studentId: student.id },
  });
  expect(assigned.ok(), await assigned.text()).toBeTruthy();

  await page.reload();
  await openStudentTasksTab(page);
  const search = page.getByPlaceholder('Rechercher une tâche…');
  if (await search.isVisible().catch(() => false)) await search.fill(taskTitle);
  const card = page.locator('.task-card', { hasText: taskTitle }).first();
  await expect(card).toBeVisible({ timeout: 45_000 });

  // Carte repliée (affichage condensé du téléphone) : le bouton est là, sans dépliage.
  const quick = card.getByTestId('task-quick-done').getByRole('button', {
    name: /Marquer terminée/,
  });
  await quick.scrollIntoViewIfNeeded();
  await expect(quick).toBeVisible();
  const box = await quick.boundingBox();
  const navTop = await page
    .locator('nav.bottom-nav')
    .evaluate((el) => el.getBoundingClientRect().top)
    .catch(() => VIEWPORT_H);
  expect(box.y + box.height).toBeLessThanOrEqual(navTop + 1);
  expect(box.height).toBeGreaterThanOrEqual(36);
  await quick.click();

  // Compte rendu sans commentaire ni photo (facultatifs).
  const reportDlg = page.getByRole('dialog', { name: 'Rapport de tâche' });
  await expect(reportDlg).toBeVisible({ timeout: 20_000 });
  const doneResp = page.waitForResponse(
    (r) => r.url().includes(`/api/tasks/${taskId}/done`) && r.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await reportDlg.getByRole('button', { name: /Marquer comme terminée/ }).click();
  expect((await doneResp).status()).toBe(200);
  await expect(reportDlg).toBeHidden({ timeout: 20_000 });

  // Le prof valide : c'est cette validation que compte « tâches réalisées » (MCP).
  const validated = await page.request.post(`/api/tasks/${taskId}/validate`, { headers: auth });
  expect(validated.ok(), await validated.text()).toBeTruthy();
  const task = await (await page.request.get(`/api/tasks/${taskId}`, { headers: auth })).json();
  expect(task.status).toBe('validated');
});
