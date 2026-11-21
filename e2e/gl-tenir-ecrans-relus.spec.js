const { test, expect } = require('@playwright/test');
const { createTenirGame } = require('../tests/helpers/glTenirFixtures');
const { mountGlSession } = require('./fixtures/gl.fixture');

// Audit des bugs G&L du 19/11/2026, lot 1 — les écrans qui ne se relisaient pas.
// Poste unique du prof relié au vidéoprojecteur : la console dans un onglet, la projection dans
// un autre onglet du même navigateur.
//   J3 : le lien de projection ne remplace plus la session du prof.
//   J1 : la projection suit le tour sans F5.
//   J2 : « Jouer le tour » suit une phase et un jet venus d'ailleurs, sans « Actualiser ».
// Écrans de séance, lot 5 (console) : sur « Jouer le tour », la barre du haut tient en une
// ligne (mode séance), les demandes passent avant les équipes, l'avance libre attend derrière
// « Corriger la position… » et les tablettes se résument en une ligne.

const GL = { 'X-Foretmap-Product': 'gl' };

test.describe('GL — écrans relus sans rechargement', () => {
  test('projection et console du prof dans deux onglets : chacun garde sa session et suit le tour', async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const ctx = await createTenirGame({ stamp: Date.now(), plateau: 1, playerCount: 8 });
    const gameId = Number(ctx.game.id);
    const prof = { Authorization: `Bearer ${ctx.adminToken}`, ...GL };
    const api = (path) => `/api/gl/games/${gameId}${path}`;
    const poster = async (path, data = {}, headers = prof) => {
      const res = await request.post(api(path), { headers, data });
      expect(res.ok(), `${path} : ${await res.text()}`).toBeTruthy();
      return res.json();
    };

    // Le serveur e2e tourne dans un autre processus : écrire par sa route périme son cache.
    const leve = await request.put('/api/gl/admin/settings/gameplay.tenir_enabled', {
      headers: prof,
      data: { value: true },
    });
    expect(leve.ok(), await leve.text()).toBeTruthy();
    const profil = await request.put(api('/tenir/profil'), {
      headers: prof,
      data: { profil: 'complet', overrides: { surface: 'tablette', des_mode: 'serveur' } },
    });
    expect(profil.ok(), await profil.text()).toBeTruthy();

    // --- Onglet 1 : la console du prof, sur « Jouer le tour » --------------------------------
    const navigateur = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageProf = await navigateur.newPage();
    pageProf.setDefaultTimeout(20_000);
    await mountGlSession(pageProf, {
      token: ctx.adminToken,
      auth: { userType: 'gl_admin', roleSlug: 'gl_admin', displayName: 'MJ e2e' },
      tab: 'mj',
    });
    await expect(pageProf.getByRole('heading', { name: 'Console MJ' })).toBeVisible();
    await pageProf
      .locator('tr', { hasText: ctx.game.name })
      .getByRole('button', { name: 'Ouvrir' })
      .click();
    const ecranTour = pageProf.getByTestId('gl-tour-screen');
    await expect(ecranTour).toBeVisible();
    await expect(ecranTour.getByRole('heading', { level: 2 }).first()).toContainText(
      'aucun tour ouvert',
    );

    // Mode séance : une ligne — la partie, le tour, « Menu » ; ni onglets ni compte.
    const barre = pageProf.getByTestId('gl-topbar-seance');
    await expect(barre).toBeVisible();
    await expect(barre).toContainText(ctx.game.name);
    await expect(barre).toContainText('Aucun tour ouvert');
    await expect(
      pageProf.getByRole('tablist', { name: 'Navigation Gnomes et Licornes' }),
    ).toHaveCount(0);
    expect((await barre.boundingBox()).height).toBeLessThanOrEqual(64);
    // « Menu » rend les onglets ; « Réduire le menu » revient à une ligne.
    await barre.getByRole('button', { name: 'Menu' }).click();
    await expect(
      pageProf.getByRole('tablist', { name: 'Navigation Gnomes et Licornes' }),
    ).toBeVisible();
    await pageProf.getByRole('button', { name: 'Réduire le menu' }).click();
    await expect(barre).toBeVisible();

    // --- Onglet 2, même navigateur : le lien de projection ----------------------------------
    const jeton = await poster('/projection-token');
    const pageProjection = await navigateur.newPage();
    pageProjection.setDefaultTimeout(20_000);
    await pageProjection.setExtraHTTPHeaders(GL);
    await pageProjection.goto(jeton.url || `/?projection=${encodeURIComponent(jeton.token)}`);
    const projection = pageProjection.getByTestId('gl-projection');
    await expect(projection).toBeVisible();
    await expect(projection).toContainText('Le prof ouvre bientôt le tour.');

    // J3 — le stockage partagé entre onglets porte toujours le compte du prof.
    const stockee = await pageProf.evaluate(() => JSON.parse(localStorage.getItem('gl_session')));
    expect(stockee.token).toBe(ctx.adminToken);
    expect(stockee.auth.userType).toBe('gl_admin');
    expect(stockee.auth.projection).toBeUndefined();
    // La projection survit à un F5 de son onglet (le jeton a quitté l'adresse).
    expect(new URL(pageProjection.url()).searchParams.get('projection')).toBeNull();
    await pageProjection.reload();
    await expect(projection).toBeVisible();
    await expect(projection).toContainText('Le prof ouvre bientôt le tour.');

    // Le prof joue depuis sa console : son jeton est toujours le sien (J3, conséquence).
    await ecranTour.getByRole('button', { name: 'Ouvrir le tour' }).click();
    await expect(ecranTour.getByRole('heading', { level: 2 }).first()).toContainText(
      'Tour 1 · Le tour s’ouvre',
    );
    // J1 — la projection suit, sans F5.
    await expect(projection).toContainText('Tour 1 — Le tour s’ouvre', { timeout: 15_000 });

    // --- La phase change depuis un autre poste (API) : les deux écrans suivent ---------------
    await poster('/tenir/tour/phase', { phase: 'jeu' });
    await expect(projection).toContainText('Tour 1 — À vous de jouer', { timeout: 15_000 });
    await expect(ecranTour.getByRole('heading', { level: 2 }).first()).toContainText(
      'Tour 1 · À vous de jouer',
      { timeout: 15_000 },
    );

    // --- Une équipe avance depuis ailleurs : la carte du prof se relit seule (J2) ------------
    const equipe = ctx.teams[0];
    const carte = pageProf.getByTestId(`gl-tour-team-${equipe.id}`);
    await expect(carte).toContainText('case 1');
    await expect(carte).not.toContainText('dés lancés');

    // Lot 5 — la barre suit le tour ; les demandes viennent avant les équipes ; la carte
    // d'équipe ne montre que le jet, l'avance libre est derrière « Corriger la position… ».
    await expect(barre).toContainText('Tour 1 — À vous de jouer');
    const yDemandes = (await pageProf.getByTestId('gl-demandes').boundingBox()).y;
    const yEquipes = (await carte.boundingBox()).y;
    expect(yDemandes).toBeLessThan(yEquipes);
    await expect(carte.getByLabel('Motif de l’avance libre')).toHaveCount(0);
    await expect(carte.getByRole('button', { name: 'Corriger la position…' })).toBeVisible();
    // Tablettes : une ligne, dépliée au toucher (aucune tablette connectée dans ce scénario).
    const tablettes = pageProf.getByTestId('gl-class-link-resume');
    await expect(tablettes).toContainText('Aucune tablette connectée');
    await expect(pageProf.getByTestId('gl-class-link-qr')).toHaveCount(0);
    // Les cartes d'équipe sont visibles sans défilement à 1440 × 900.
    expect(yEquipes).toBeLessThan(900);
    await pageProf.screenshot({
      path: 'docs/captures/ecrans-de-seance/apres/console-seance-1440x900.png',
    });
    await carte.getByRole('button', { name: 'Corriger la position…' }).click();
    await expect(carte.getByLabel('Motif de l’avance libre')).toBeVisible();
    await expect(carte.getByRole('button', { name: 'Avancer' })).toBeDisabled();
    await carte.getByRole('button', { name: 'Annuler' }).click();
    await expect(carte.getByLabel('Motif de l’avance libre')).toHaveCount(0);
    await poster('/tenir/lancer', {
      mode: 'libre',
      teamId: equipe.id,
      cases: 3,
      motif: 'jet venu d’un autre appareil (e2e)',
    });
    await expect(carte).toContainText('case 4', { timeout: 15_000 });
    // La projection aussi (J1).
    await expect(
      pageProjection.locator('.gl-projection__team', { hasText: equipe.name }),
    ).toContainText('case 4', { timeout: 15_000 });

    await navigateur.close();
  });
});
