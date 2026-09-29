const { test, expect } = require('@playwright/test');
const {
  loginAsTeacherAdminApi,
  markAllDiscoveryToursSeen,
  dismissDiscoveryTourIfPresent,
} = require('./fixtures/auth.fixture');

/**
 * Parcours du profil livré « Prof de classe » : compte enseignant sans `teacher.access`, qui
 * encadre une classe d'élèves visiteurs. Il garde la navigation basse d'un visiteur connecté,
 * et ses onglets Stats et Classe sont bornés à ses groupes (audit 2026-09-29).
 */

const IMPORT_COLUMNS = [
  'Rôle',
  'Prénom',
  'Nom',
  'Mot de passe',
  'Groupes (noms/slugs | chemin Parent>Enfant)',
  'Pseudo (optionnel)',
  'Email (optionnel)',
  'Description (optionnel)',
];

async function importAccounts(page, token, rows) {
  const csv = [IMPORT_COLUMNS, ...rows].map((r) => r.join(';')).join('\r\n');
  const resp = await page.request.post('/api/students/import', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      fileName: 'e2e-prof-classe.csv',
      fileDataBase64: Buffer.from(csv, 'utf8').toString('base64'),
    },
  });
  expect(resp.ok(), await resp.text()).toBeTruthy();
  const { report } = await resp.json();
  expect(report.totals.created, JSON.stringify(report.errors)).toBe(rows.length);
}

/** Onglet de la navigation basse, directement ou via « Plus d'onglets ». */
async function openBottomTab(page, name) {
  const nav = page.locator('nav.bottom-nav');
  const direct = nav.getByRole('button', { name, exact: true });
  if (await direct.isVisible({ timeout: 2000 }).catch(() => false)) {
    await direct.click();
    return;
  }
  await nav.getByRole('button', { name: /Plus d'onglets/ }).click();
  await page
    .getByRole('dialog', { name: 'Navigation' })
    .getByRole('button', { name, exact: true })
    .click();
}

test('prof de classe : navigation visiteur, stats et classe bornées à ses élèves', async ({
  page,
}) => {
  const adminToken = await loginAsTeacherAdminApi(page);
  const nonce = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const groupSlug = `e2e-prof-classe-${nonce}`;
  const groupResp = await page.request.post('/api/groups', {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { name: `E2E Sixième ${nonce}`, slug: groupSlug, kind: 'class' },
  });
  expect(groupResp.ok(), await groupResp.text()).toBeTruthy();

  const teacher = {
    email: `e2e_prof_classe_${nonce}@example.com`,
    password: 'MotDePasseProf12!',
  };
  await importAccounts(page, adminToken, [
    [
      'prof_classe',
      'Prof',
      `Classe${nonce}`,
      teacher.password,
      groupSlug,
      '',
      teacher.email,
      'Compte e2e',
    ],
    [
      'visiteur',
      `Eleve${nonce}`,
      'Visiteur',
      'MotDePasse12!',
      groupSlug,
      '',
      `e2e_vis_${nonce}@example.com`,
      '',
    ],
  ]);

  await page.goto('/');
  await markAllDiscoveryToursSeen(page);
  await page.getByLabel('Identifiant (pseudo ou email)').fill(teacher.email);
  await page.getByLabel('Mot de passe').fill(teacher.password);
  const loginResp = page.waitForResponse(
    (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Se connecter' }).click();
  const login = await loginResp;
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  expect(body.auth.roleSlug).toBe('prof_classe');
  expect(body.auth.permissions).not.toContain('teacher.access');
  expect(body.auth.permissions).not.toContain('id_keys.manage');

  await page.getByRole('button', { name: /Déconnexion/ }).waitFor({ timeout: 60_000 });
  await dismissDiscoveryTourIfPresent(page);

  // Navigation basse d'un visiteur connecté, pas de barre n3boss ni de « Connexion professeur ».
  await expect(page.locator('nav.bottom-nav')).toBeVisible();
  await expect(page.locator('.teacher-main .top-tabs')).toHaveCount(0);
  await expect(page.locator('header button[aria-label="Connexion professeur"]')).toHaveCount(0);

  await openBottomTab(page, 'Stats');
  await expect(page.getByRole('heading', { name: /Statistiques de mes élèves/ })).toBeVisible({
    timeout: 30_000,
  });
  // Le bloc Quiz porte sur tout l'établissement : réservé à `stats.read.all`.
  await expect(page.getByRole('heading', { name: /Quiz \(QCM\)/ })).toHaveCount(0);
  await expect(page.getByText(`Eleve${nonce}`).first()).toBeVisible({ timeout: 30_000 });

  await dismissDiscoveryTourIfPresent(page);
  await openBottomTab(page, 'Classe');
  await expect(page.getByRole('heading', { name: 'Ma classe' })).toBeVisible({ timeout: 30_000 });
});
