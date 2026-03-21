async function loginAsNewStudent(page) {
  const nonce = Date.now().toString().slice(-6);
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
  return { firstName, lastName, password };
}

async function enableTeacherMode(page, pin = '1234') {
  await page.locator('button.lock-btn').first().click();
  await page.locator('.pin-input').fill(pin);
  await page.getByRole('button', { name: 'Entrer' }).click();
  await page.getByRole('button', { name: /Carte & Zones/ }).waitFor({ state: 'visible' });
}

module.exports = { loginAsNewStudent, enableTeacherMode };
