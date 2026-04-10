async function loginAsNewStudent(page) {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const firstName = `E2E${nonce}`;
  const lastName = 'Eleve';
  const password = '1234';
  const email = `e2e_${String(nonce).replace(/[^a-zA-Z0-9]/g, '_')}@example.com`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  await page.getByLabel('Prénom', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Prénom', { exact: true }).fill(firstName);
  await page.getByLabel('Nom', { exact: true }).fill(lastName);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByLabel('Email (optionnel)').fill(email);
  await page.getByLabel('Mon espace', { exact: true }).selectOption({ label: 'N3 + Forêt comestible' });
  await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Créer le compte' }).click();

  await page.getByRole('button', { name: /Déconnexion/ }).waitFor({ state: 'visible', timeout: 60_000 });
  // Inscription = profil visiteur ; la 1re connexion identifiant/mot de passe promeut en n3beur novice (droits tâches).
  await logoutToAuth(page);
  await page.goto('/');
  await loginByIdentifier(page, email, password);
  return { firstName, lastName, password, pseudo: '', email };
}

async function registerStudentWithProfile(page) {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const firstName = `E2E${nonce}`;
  const lastName = 'Eleve';
  const pseudo = `e2e_${nonce}`;
  const email = `e2e_${nonce}@example.com`;
  const password = '1234';

  await page.goto('/');
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  await page.getByLabel('Prénom', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Prénom', { exact: true }).fill(firstName);
  await page.getByLabel('Nom', { exact: true }).fill(lastName);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByLabel('Mon espace', { exact: true }).selectOption({ label: 'N3 + Forêt comestible' });
  await page.getByLabel('Pseudo (optionnel)').fill(pseudo);
  await page.getByLabel('Email (optionnel)').fill(email);
  await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Créer le compte' }).click();
  await page.getByRole('button', { name: /Déconnexion/ }).waitFor({ state: 'visible', timeout: 60_000 });
  await dismissProfilePromotionModalIfPresent(page);
  return { firstName, lastName, pseudo, email, password };
}

async function logoutToAuth(page) {
  await page.getByRole('button', { name: /Déconnexion/ }).click();
  await page.getByRole('button', { name: 'Connexion', exact: true }).waitFor({ state: 'visible' });
}

/**
 * La modale « nouveau palier » (progression auto) est au-dessus de la carte et bloque les clics e2e.
 */
async function dismissProfilePromotionModalIfPresent(page) {
  const cta = page.locator('.profile-promo-card__cta');
  if (await cta.isVisible({ timeout: 1200 }).catch(() => false)) {
    await cta.click();
    await cta.waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  }
}

async function loginByIdentifier(page, identifier, password) {
  await page.getByLabel('Identifiant (pseudo ou email)').fill(identifier);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter 🌱' }).click();
  await page.getByRole('button', { name: /Déconnexion/ }).waitFor({ state: 'visible', timeout: 60_000 });
  await dismissProfilePromotionModalIfPresent(page);
}

async function enableTeacherMode(page, pin = process.env.E2E_ELEVATION_PIN || process.env.TEACHER_PIN || '1234') {
  await page.getByRole('button', { name: 'Activer les droits étendus' }).click();
  await page.locator('.pin-card .pin-input').waitFor({ state: 'visible' });
  await page.locator('.pin-card .pin-input').fill(pin);
  // « Recentrer la carte » contient la sous-chaîne « Entrer » : cibler la modale PIN + exact.
  await page.locator('.pin-card').getByRole('button', { name: 'Entrer', exact: true }).click();
  await page.getByRole('button', { name: 'Désactiver les droits étendus' }).waitFor({ state: 'visible', timeout: 45_000 });
  await dismissProfilePromotionModalIfPresent(page);
}

async function disableTeacherMode(page) {
  const des = page.getByRole('button', { name: 'Désactiver les droits étendus' });
  if ((await des.count()) > 0) {
    await dismissProfilePromotionModalIfPresent(page);
    await des.first().click({ force: true, timeout: 20_000 });
    await page.getByRole('button', { name: 'Activer les droits étendus' }).waitFor({ state: 'visible', timeout: 20_000 });
  }
}

/** Le premier `.map-zone-hit` peut être sous un repère : le clic ouvre la mauvaise modale. */
async function openFirstZoneModalFromMap(page) {
  await dismissProfilePromotionModalIfPresent(page);
  await page.locator('.map-zone-hit').first().waitFor({ state: 'attached', timeout: 25_000 });
  const errBanner = page.getByText('Une erreur s’est produite.');
  const maxAttempts = 24;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await errBanner.isVisible().catch(() => false)) {
      throw new Error('Application en erreur (ErrorBoundary) sur la carte');
    }
    const count = await page.locator('.map-zone-hit').count();
    if (count === 0) break;
    const idx = attempt % count;
    const hit = page.locator('.map-zone-hit').nth(idx);
    const poly = hit.locator('polygon').first();
    if (await poly.count()) {
      await poly.click({ force: true, timeout: 10_000 });
    } else {
      await hit.click({ force: true, timeout: 10_000 });
    }
    if (!(await page.getByRole('dialog', { name: /^Zone / }).isVisible().catch(() => false))) {
      await hit.evaluate((el) => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      });
    }
    const zoneDlg = page.getByRole('dialog', { name: /^Zone / });
    if (await zoneDlg.isVisible().catch(() => false)) return;
    await page.keyboard.press('Escape');
    const close = page.locator('.modal-close').first();
    if (await close.isVisible({ timeout: 400 }).catch(() => false)) await close.click();
  }
  throw new Error('Aucune modale zone ouverte depuis la carte');
}

/** Réinitialise les filtres liste tâches (évite les listes vides e2e après vue élève + filtres carte/statut). */
async function resetTaskFiltersInTasksView(page) {
  try {
    const filters = page.locator('.task-filters select');
    const n = await filters.count();
    if (n === 0) return;
    await filters.nth(0).selectOption('all', { timeout: 5000 });
    if (n > 1) await filters.nth(1).selectOption('');
    if (n > 2) await filters.nth(2).selectOption('');
    if (n > 3) await filters.nth(3).selectOption('');
  } catch (_) {
    /* pas de barre de filtres */
  }
  const search = page.getByPlaceholder('🔍 Rechercher une tâche...');
  if (await search.isVisible().catch(() => false)) {
    await search.fill('');
  }
}

/**
 * Onglet Tâches : nav basse élève ou barre d’onglets prof (évite les boutons hors navigation).
 */
function tasksTabButton(page) {
  return page.locator('nav.bottom-nav').getByRole('button', { name: /✅\s*Tâches/ })
    .or(page.locator('.top-tabs').getByRole('button', { name: /✅\s*Tâches/ }));
}

async function openTeacherTasksTab(page) {
  await dismissProfilePromotionModalIfPresent(page);
  await tasksTabButton(page).first().click({ timeout: 25_000 });
  await page.getByRole('heading', { name: '✅ Tâches' }).waitFor({ state: 'visible', timeout: 25_000 });
  await resetTaskFiltersInTasksView(page);
}

async function openStudentTasksTab(page) {
  await dismissProfilePromotionModalIfPresent(page);
  await page.locator('nav.bottom-nav').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  await tasksTabButton(page).first().click({ timeout: 25_000 });
  const tasksHeading = page.getByRole('heading', { name: '✅ Tâches' });
  await tasksHeading.waitFor({ state: 'attached', timeout: 25_000 });
  await tasksHeading.scrollIntoViewIfNeeded().catch(() => {});
  await tasksHeading.waitFor({ state: 'visible', timeout: 25_000 });
  await resetTaskFiltersInTasksView(page);
}

/**
 * Le temps réel recrée le DOM ; le JWT élevé peut expirer entre scénarios (serveur e2e réutilisé).
 * Clic natif via evaluate pour éviter les boucles « detached » de Playwright.
 */
async function clickTeacherNewTask(page) {
  const elevated = await page.getByRole('button', { name: 'Désactiver les droits étendus' }).isVisible().catch(() => false);
  let btn = page.getByRole('button', { name: /\+ Nouvelle tâche/ });
  if (!(await btn.isVisible().catch(() => false))) {
    if (!elevated) {
      const activer = page.getByRole('button', { name: 'Activer les droits étendus' });
      if (await activer.isVisible().catch(() => false)) {
        await enableTeacherMode(page);
      }
    }
    await openTeacherTasksTab(page);
    btn = page.getByRole('button', { name: /\+ Nouvelle tâche/ });
  }
  await btn.waitFor({ state: 'attached', timeout: 25_000 });
  await btn.evaluate((el) => {
    el.click();
  });
}

module.exports = {
  loginAsNewStudent,
  registerStudentWithProfile,
  logoutToAuth,
  loginByIdentifier,
  dismissProfilePromotionModalIfPresent,
  enableTeacherMode,
  disableTeacherMode,
  openFirstZoneModalFromMap,
  openTeacherTasksTab,
  openStudentTasksTab,
  clickTeacherNewTask,
};
