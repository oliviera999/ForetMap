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
  return { firstName, lastName, pseudo, email, password };
}

async function logoutToAuth(page) {
  await page.getByRole('button', { name: /Déconnexion/ }).click();
  await page.getByRole('button', { name: 'Connexion', exact: true }).waitFor({ state: 'visible' });
}

async function loginByIdentifier(page, identifier, password) {
  await page.getByLabel('Identifiant (pseudo ou email)').fill(identifier);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter 🌱' }).click();
  await page.getByRole('button', { name: /Déconnexion/ }).waitFor({ state: 'visible', timeout: 60_000 });
}

async function enableTeacherMode(page, pin = process.env.E2E_ELEVATION_PIN || process.env.TEACHER_PIN || '1234') {
  await page.getByRole('button', { name: 'Activer les droits étendus' }).click();
  await page.locator('.pin-card .pin-input').waitFor({ state: 'visible' });
  await page.locator('.pin-card .pin-input').fill(pin);
  // « Recentrer la carte » contient la sous-chaîne « Entrer » : cibler la modale PIN + exact.
  await page.locator('.pin-card').getByRole('button', { name: 'Entrer', exact: true }).click();
  await page.getByRole('button', { name: 'Désactiver les droits étendus' }).waitFor({ state: 'visible', timeout: 45_000 });
}

async function disableTeacherMode(page) {
  const des = page.getByRole('button', { name: 'Désactiver les droits étendus' });
  if ((await des.count()) > 0) {
    await des.click();
    await page.getByRole('button', { name: 'Activer les droits étendus' }).waitFor({ state: 'visible', timeout: 15_000 });
  }
}

/** Le premier `.map-zone-hit` peut être sous un repère : le clic ouvre la mauvaise modale. */
async function openFirstZoneModalFromMap(page) {
  const errBanner = page.getByText('Une erreur s’est produite.');
  const maxAttempts = 24;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await errBanner.isVisible().catch(() => false)) {
      throw new Error('Application en erreur (ErrorBoundary) sur la carte');
    }
    const count = await page.locator('.map-zone-hit').count();
    if (count === 0) break;
    const idx = attempt % count;
    await page.locator('.map-zone-hit').nth(idx).click({ force: true, timeout: 10_000 });
    const zoneDlg = page.getByRole('dialog', { name: /^Zone / });
    if (await zoneDlg.isVisible().catch(() => false)) return;
    await page.keyboard.press('Escape');
    const close = page.locator('.modal-close').first();
    if (await close.isVisible({ timeout: 400 }).catch(() => false)) await close.click();
  }
  throw new Error('Aucune modale zone ouverte depuis la carte');
}

async function openTeacherTasksTab(page) {
  await page.getByRole('button', { name: /✅ Tâches/ }).click();
  await page.getByRole('heading', { name: '✅ Tâches' }).waitFor({ state: 'visible' });
}

async function openStudentTasksTab(page) {
  await page.getByRole('button', { name: /✅\s*Tâches/ }).click();
  await page.getByRole('heading', { name: '✅ Tâches' }).waitFor({ state: 'visible' });
}

module.exports = {
  loginAsNewStudent,
  registerStudentWithProfile,
  logoutToAuth,
  loginByIdentifier,
  enableTeacherMode,
  disableTeacherMode,
  openFirstZoneModalFromMap,
  openTeacherTasksTab,
  openStudentTasksTab,
};
