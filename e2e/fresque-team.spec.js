const { test, expect } = require('@playwright/test');
const {
  loginAsTeacherAdminApi,
  createStudentViaAdminImport,
  buildE2eStudentProfile,
  loginByIdentifier,
  markAllDiscoveryToursSeen,
  dismissProfilePromotionModalIfPresent,
} = require('./fixtures/auth.fixture');

/**
 * Plateau d'équipe : deux sessions (deux membres d'un groupe `kind = 'team'`) ouvrent la même
 * fresque. Chaque enregistrement prévient l'autre écran (`fresque:board:changed`) ; ni l'une ni
 * l'autre n'écrase le travail de l'autre : les deux cartes posées sont dans l'état serveur.
 */

async function openTeamBoard(page, teamName) {
  const tab = page.getByRole('button', { name: 'Fresque' });
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click();
  await page.getByRole('button', { name: `Fresque de l’équipe ${teamName}` }).click();
  await expect(page.getByTestId('fm-fresque-board')).toBeVisible({ timeout: 20_000 });
}

async function startIfNeeded(page) {
  const start = page.getByTestId('fm-fresque-start');
  if (await start.isVisible({ timeout: 1500 }).catch(() => false)) await start.click();
  await expect(page.getByTestId('fm-fresque-board')).toHaveAttribute('data-step', /lot/);
}

async function placeFromHand(page, cardId) {
  const handCard = page.getByTestId(`fm-fresque-hand-${cardId}`);
  await handCard.focus();
  await handCard.press('Enter');
  await expect(page.getByTestId(`fm-fresque-card-${cardId}`)).toBeVisible();
  await expect(page.getByTestId('fm-fresque-save')).toHaveAttribute('data-status', 'saved', {
    timeout: 15_000,
  });
}

/** Jeton et identifiant du compte connecté dans cette page (session locale + `/api/auth/me`). */
async function sessionOf(page) {
  const raw = await page.evaluate(() => localStorage.getItem('foretmap_session'));
  const session = raw ? JSON.parse(raw) : null;
  const token =
    typeof session?.token === 'string'
      ? session.token
      : session?.token?.value || session?.authToken;
  const me = await page.request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await me.json();
  return { token, id: body?.auth?.userId || body?.userId || body?.id || null };
}

test('équipe : deux sessions sur le même plateau ne s’écrasent jamais', async ({
  browser,
  page,
}) => {
  test.setTimeout(300_000);
  const stamp = Date.now();
  const teamName = `E2E Fresque ${stamp}`;
  const alice = await createStudentViaAdminImport(page, buildE2eStudentProfile());
  const bob = await createStudentViaAdminImport(page, buildE2eStudentProfile());
  const adminToken = await loginAsTeacherAdminApi(page);
  const headers = { Authorization: `Bearer ${adminToken}` };

  // Les deux sessions se connectent d'abord (identifiants lus dans la session locale), puis
  // l'équipe est créée : le bouton « Fresque de l'équipe … » dépend de l'appartenance au chargement.
  await page.goto('/');
  await markAllDiscoveryToursSeen(page);
  await loginByIdentifier(page, alice.email, alice.password);
  await dismissProfilePromotionModalIfPresent(page);
  const a = await sessionOf(page);
  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  await bobPage.goto('/');
  await markAllDiscoveryToursSeen(bobPage);
  await loginByIdentifier(bobPage, bob.email, bob.password);
  await dismissProfilePromotionModalIfPresent(bobPage);
  const b = await sessionOf(bobPage);
  expect(a.id).toBeTruthy();
  expect(b.id).toBeTruthy();

  const groupResp = await page.request.post('/api/groups', {
    headers,
    data: { name: teamName, slug: `e2e-fresque-team-${stamp}`, kind: 'team' },
  });
  expect(groupResp.ok()).toBeTruthy();
  const group = await groupResp.json();
  const membersResp = await page.request.post(
    `/api/groups/${encodeURIComponent(group.id)}/members`,
    { headers, data: { member_user_ids: [a.id, b.id] } },
  );
  expect(membersResp.ok()).toBeTruthy();

  // Session Alice.
  await openTeamBoard(page, teamName);
  await startIfNeeded(page);
  await placeFromHand(page, 'c04');

  // Session Bob : il voit la carte d'Alice, pose la sienne.
  await openTeamBoard(bobPage, teamName);
  await startIfNeeded(bobPage);
  await expect(bobPage.getByTestId('fm-fresque-card-c04')).toBeVisible({ timeout: 20_000 });
  await placeFromHand(bobPage, 'c07');

  // Alice reçoit le signal temps réel et recharge : la carte de Bob apparaît, la sienne reste.
  await expect(page.getByTestId('fm-fresque-card-c07')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('fm-fresque-card-c04')).toBeVisible();

  // L'état serveur porte les deux cartes, chacune signée par son auteur dans le journal.
  const boards = await page.request.get('/api/fresques/boards/mine', {
    headers: { Authorization: `Bearer ${a.token}` },
  });
  const mine = await boards.json();
  const teamBoard = (mine.boards || []).find((x) => x.ownerType === 'team');
  expect(teamBoard).toBeTruthy();
  const detail = await page.request.get(`/api/fresques/boards/${teamBoard.id}`, {
    headers: { Authorization: `Bearer ${a.token}` },
  });
  const { board } = await detail.json();
  expect(Object.keys(board.state.cards)).toEqual(expect.arrayContaining(['c04', 'c07']));
  const events = await page.request.get(`/api/fresques/boards/${teamBoard.id}/events`, {
    headers: { Authorization: `Bearer ${a.token}` },
  });
  const { events: log } = await events.json();
  const placedBy = Object.fromEntries(
    log.filter((e) => e.type === 'card_placed').map((e) => [e.payload.cardId, e.by]),
  );
  expect(placedBy.c04).toBe(a.id);
  expect(placedBy.c07).toBe(b.id);

  await bobContext.close();
});
