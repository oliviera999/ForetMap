async function loginAsNewStudent(page) {
  const nonce = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)}`;
  const firstName = `E2E${nonce}`;
  const lastName = 'Eleve';
  const password = '1234';

  await page.goto('/');
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  await page.getByLabel('Prénom').fill(firstName);
  await page.getByLabel('Nom').fill(lastName);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByLabel('Confirmer le mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer le compte' }).click();

  await page.locator('header').waitFor({ state: 'visible' });
  await page.waitForLoadState('networkidle');
  return { firstName, lastName, password };
}

async function enableTeacherMode(page, pin = '1234') {
  await page.locator('button.lock-btn').first().click();
  await page.locator('.pin-input').fill(pin);
  await page.getByRole('button', { name: 'Entrer' }).click();
  await page.getByRole('button', { name: /Carte & Zones/ }).waitFor({ state: 'visible' });
  await page.waitForLoadState('networkidle');
}

async function disableTeacherMode(page) {
  const activeLock = page.locator('button.lock-btn.active').first();
  if (await activeLock.count()) {
    await activeLock.click();
    await page.waitForLoadState('networkidle');
  }
}

async function openTeacherTasksTab(page) {
  await page.getByRole('button', { name: /✅ Tâches/ }).click();
  await page.getByText('✅ Tâches').waitFor({ state: 'visible' });
}

async function openStudentTasksTab(page) {
  await page.getByRole('button', { name: /^Tâches/ }).click();
  await page.getByText('✅ Tâches').waitFor({ state: 'visible' });
}

module.exports = {
  loginAsNewStudent,
  enableTeacherMode,
  disableTeacherMode,
  openTeacherTasksTab,
  openStudentTasksTab,
};
