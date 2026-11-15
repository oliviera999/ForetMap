const { test, expect } = require('@playwright/test');
const { queryOne, queryAll } = require('../database');
const { createTenirGame } = require('../tests/helpers/glTenirFixtures');
const { mountGlSession } = require('./fixtures/gl.fixture');
const core = require('../lib/shared/glTrameCore');
const catalogue = require('../data/gl/tenir/trame-reseaux.json');

// « Tenir à deux », lot 3 — défis de la Trame.
// Une tablette d'équipe (Gnomes, hors tour) relève un Retisser niveau 5 de bout en bout ; un
// téléphone d'élève (Licorne, avec compte) relève une trame altérée en mode liste ; le prof lit
// le suivi dans sa console. Aucune ressource ne bouge.
// Captures : docs/captures/tenir-v2/defis-*.png.

const GL = { 'X-Foretmap-Product': 'gl' };
const BIOME = 'savane';
const savane = catalogue.reseaux.find((r) => r.biome === BIOME);

/** Somme des bourses de la partie : un défi n'y touche jamais. */
async function bourses(gameId) {
  const row = await queryOne(
    `SELECT COALESCE(SUM(p.health_points), 0) AS pv, COALESCE(SUM(p.power_points), 0) AS gemmes
       FROM gl_players p INNER JOIN gl_team_members m ON m.player_id = p.id
      WHERE m.game_id = ?`,
    [gameId],
  );
  return `${row.pv}|${row.gemmes}`;
}

async function sansIntro(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('gl_intro_seen', '1');
    } catch (_) {
      /* stockage indisponible : l'intro s'affichera, le test la passera */
    }
  });
}

test.describe('GL — défis de la Trame', () => {
  test('Retisser niveau 5 sur tablette, trame altérée sur téléphone, suivi du prof', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const ctx = await createTenirGame({ stamp: Date.now(), plateau: 1, playerCount: 8 });
    const gameId = Number(ctx.game.id);
    const prof = { Authorization: `Bearer ${ctx.adminToken}`, ...GL };
    const api = (path) => `/api/gl/games/${gameId}${path}`;

    // Le serveur e2e tourne dans un autre processus : écrire par sa route périme son cache.
    const leve = await request.put('/api/gl/admin/settings/gameplay.tenir_enabled', {
      headers: prof,
      data: { value: true },
    });
    expect(leve.ok(), await leve.text()).toBeTruthy();
    const profil = await request.put(api('/tenir/profil'), {
      headers: prof,
      data: { profil: 'complet', overrides: { surface: 'tablette' } },
    });
    expect(profil.ok(), await profil.text()).toBeTruthy();
    const avant = await bourses(gameId);

    // --- Tablette d'équipe (Gnomes), hors tour : Retisser niveau 5 ---------------------------
    const lien = await (
      await request.get(`/api/gl/classes/${ctx.cls.id}/lien`, { headers: prof })
    ).json();
    const jeton = new URL(lien.url, 'http://gl.local/').searchParams.get('classe');
    const gnomes = ctx.teams.find((t) => t.type === 'gnome');
    const tablette = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 2,
    });
    const page = await tablette.newPage();
    page.setDefaultTimeout(20_000);
    await page.setExtraHTTPHeaders(GL);
    await sansIntro(page);
    await page.goto(`/?classe=${encodeURIComponent(jeton)}`);
    await page.getByTestId(`gl-class-link-team-${gnomes.id}`).click();
    await expect(page.getByTestId('gl-team-session')).toBeVisible();
    await page.getByTestId('gl-defis-entree-bouton').click();
    await expect(page.getByTestId('gl-defis')).toBeVisible();
    // Les Gnomes retissent et réparent ; les défis des Licornes ne leur sont pas proposés.
    await expect(page.getByTestId(`gl-defi-ouvrir-retisser-${BIOME}:5`)).toBeEnabled();
    await expect(page.getByTestId(`gl-defi-ouvrir-retisser-${BIOME}:7`)).toBeDisabled();
    await expect(page.locator('[data-testid^="gl-defi-ouvrir-alteree-"]')).toHaveCount(0);
    await page.getByTestId(`gl-defi-ouvrir-retisser-${BIOME}:5`).click();

    const board = page.getByTestId('gl-trame-board');
    await expect(board).toBeVisible();
    await expect(board).toHaveAttribute('data-mode', 'plateau');
    const modele = core.buildReseau(savane, 5);
    const nom = Object.fromEntries(modele.cartes.map((c) => [c.code, c.nom]));
    const relier = async (de, vers) => {
      await page.getByTestId(`gl-trame-carte-${de}`).click();
      await page.getByTestId(`gl-trame-carte-${vers}`).click();
    };
    // Une flèche dans le mauvais sens : dite, jamais punie — on la retire.
    const [premier] = modele.liens;
    await relier(premier.vers, premier.de);
    const inversee = page.locator('.gl-trame-legende li.is-inversee');
    await expect(inversee).toContainText('Regarde le sens');
    await page
      .getByRole('button', {
        name: `Retirer la flèche de la carte « ${nom[premier.vers]} » vers la carte « ${nom[premier.de]} »`,
      })
      .click();
    await expect(inversee).toHaveCount(0);

    // Les liens du niveau, puis une flèche vers les décomposeurs.
    const dec = modele.decomposeurs[0];
    const sommet = modele.cartes.find(
      (c) => c.role === 'consommateur' && !modele.liens.some((l) => l.de === c.code),
    );
    for (const [i, l] of modele.liens.entries()) {
      await relier(l.de, l.vers);
      await expect(page.getByTestId('gl-trame-trouvees')).toHaveText(`Liens trouvés : ${i + 1}`);
    }
    await expect(page.getByTestId('gl-defi-reussi')).toHaveCount(0);
    await page.getByTestId('gl-defi').scrollIntoViewIfNeeded();
    await page.getByTestId('gl-trame-trouvees').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'docs/captures/tenir-v2/defis-retisser-tablette.png' });
    await relier(sommet.code, dec);
    const reussi = page.getByTestId('gl-defi-reussi');
    await expect(reussi).toBeVisible();
    await expect(reussi).not.toContainText(/gemme|cœur/i);
    await expect(reussi).toBeInViewport();
    await page.screenshot({ path: 'docs/captures/tenir-v2/defis-retisser-reussi.png' });
    // Retour à la liste : le niveau suivant s'est ouvert.
    await page.getByRole('button', { name: 'Retour aux défis' }).click();
    await expect(page.getByTestId(`gl-defi-ouvrir-retisser-${BIOME}:7`)).toBeEnabled();
    await tablette.close();

    // --- Téléphone d'un élève (Licorne, avec compte) : la trame altérée, mode liste ----------
    const licornes = ctx.teams.find((t) => t.type === 'unicorn');
    const eleve = ctx.players.find((p) => Number(p.teamId) === Number(licornes.id));
    const telephone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
    });
    const tel = await telephone.newPage();
    tel.setDefaultTimeout(20_000);
    await mountGlSession(tel, {
      token: eleve.token,
      auth: {
        userType: 'gl_player',
        roleSlug: 'gl_player',
        displayName: eleve.pseudo,
        userId: String(eleve.id),
        teamId: Number(eleve.teamId),
      },
      tab: 'seuil',
    });
    await tel.getByTestId('gl-defis-entree-bouton').click();
    await expect(tel.getByTestId('gl-defis')).toBeVisible();
    const retiree = savane.scenarios_trame_alteree[0];
    await expect(tel.locator('[data-testid^="gl-defi-ouvrir-retisser-"]')).toHaveCount(0);
    await tel.getByTestId(`gl-defi-ouvrir-alteree-${BIOME}:${retiree}`).click();
    const liste = tel.getByTestId('gl-trame-board');
    await expect(liste).toBeVisible();
    await expect(liste).toHaveAttribute('data-mode', 'liste');
    // Aucun défilement horizontal sur un téléphone.
    expect(
      await tel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);

    const niveau9 = core.buildReseau(savane, core.TRAME_NIVEAU_ALTEREE);
    const attendu = core.cascade(niveau9, retiree);
    const aPrevoir = niveau9.cartes.filter((c) => c.code !== retiree);
    const juste = (code) => attendu.effets[code] || 'rien';
    const touchee = aPrevoir.find((c) => juste(c.code) !== 'rien');
    // Une première prédiction à côté : « Pas encore », sans donner la réponse.
    for (const c of aPrevoir) {
      const valeur = c.code === touchee.code ? 'rien' : juste(c.code);
      await tel.getByTestId(`gl-trame-prediction-${c.code}-${valeur}`).click();
    }
    await tel.getByTestId('gl-trame-verifier').click();
    const retour = tel.getByTestId(`gl-trame-retour-${touchee.code}`);
    await expect(retour).toContainText('Pas encore');
    await expect(retour).not.toContainText(/faux|raté|perdu/i);
    await expect(tel.getByTestId('gl-defi-reussi')).toHaveCount(0);
    await retour.scrollIntoViewIfNeeded();
    await tel.screenshot({ path: 'docs/captures/tenir-v2/defis-alteree-telephone.png' });
    await tel.getByTestId(`gl-trame-prediction-${touchee.code}-${juste(touchee.code)}`).click();
    await tel.getByTestId('gl-trame-verifier').click();
    await expect(tel.getByTestId('gl-defi-reussi')).toBeVisible();
    await expect(tel.getByTestId('gl-defi-reussi')).toContainText('page de veillée');
    await telephone.close();

    // --- Le prof : onglet « Défis », suivi par élève, lancer pour une équipe (1920×1080) -----
    const consoleProf = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const pageProf = await consoleProf.newPage();
    pageProf.setDefaultTimeout(20_000);
    await mountGlSession(pageProf, {
      token: ctx.adminToken,
      auth: { userType: 'gl_admin', roleSlug: 'gl_admin', displayName: 'MJ e2e' },
      tab: 'mj',
    });
    await pageProf
      .locator('tr', { hasText: ctx.game.name })
      .getByRole('button', { name: 'Ouvrir' })
      .click();
    await pageProf.getByRole('tab', { name: 'Défis' }).click();
    const suivi = pageProf.getByTestId('gl-defis-suivi');
    await expect(suivi).toBeVisible();
    await expect(suivi.locator('tbody tr')).toHaveCount(8);
    // Le suivi nomme les élèves (nom puis prénom), dans l'ordre alphabétique.
    const nomEleve = `${eleve.pseudo.split('-')[1].toUpperCase()} J`;
    const ligne = suivi
      .locator('tbody tr')
      .filter({ has: pageProf.getByRole('rowheader', { name: nomEleve, exact: true }) });
    await expect(ligne).toContainText('1 réussi');
    const noms = await suivi.locator('tbody th').allInnerTexts();
    expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, 'fr')));
    await expect(suivi).not.toContainText(/classement|rang|score/i);
    await suivi.scrollIntoViewIfNeeded();
    await pageProf.screenshot({ path: 'docs/captures/tenir-v2/defis-suivi-console.png' });
    // Le prof lance un défi pour l'autre équipe de Gnomes : plateau libre sur le grand écran.
    const autres = ctx.teams.filter((t) => t.type === 'gnome')[1];
    await pageProf.getByTestId(`gl-defis-console-equipe-${autres.id}`).click();
    await pageProf.getByTestId(`gl-defi-ouvrir-retisser-${BIOME}:5`).click();
    await expect(pageProf.getByTestId('gl-trame-board')).toHaveAttribute('data-mode', 'plateau');
    await consoleProf.close();

    // --- Ce qui est écrit : des réussites, des pages, aucune ressource -----------------------
    const reussites = await queryAll(
      'SELECT type, unite, mode, page_feuillet_code FROM gl_trame_reussites WHERE game_id = ?',
      [gameId],
    );
    expect(reussites.filter((r) => r.type === 'retisser' && r.mode === 'equipe').length).toBe(2);
    expect(reussites.filter((r) => r.type === 'alteree')).toHaveLength(1);
    expect(await bourses(gameId)).toBe(avant);
    const evenements = await queryOne(
      "SELECT COUNT(*) AS n FROM gl_game_events WHERE game_id = ? AND event_type = 'defi_trame_reussi'",
      [gameId],
    );
    expect(Number(evenements.n)).toBeGreaterThanOrEqual(2);
  });
});
