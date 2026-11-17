const { test, expect } = require('@playwright/test');
const db = require('../database');
const { createTenirGame, importExempleChasse } = require('../tests/helpers/glTenirFixtures');

// Ensemble unifié, PR 2 (M8, M10) — l'escalier du chapitre 1, sur la tablette d'une équipe.
// Séance 1 : on avance et on cherche ; ni sorts ni voile. Le prof ouvre la suite : à la séance 3
// les sorts paraissent et la page témoin se pose. En tête de l'écran, « Maintenant, vous
// pouvez… » appelle les rôles. À la clôture du tour, la projection accroche la séance suivante.
// Captures : docs/captures/tenir-v2/escalier-*.png.

const TABLETTE = { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 };
const GL = { 'X-Foretmap-Product': 'gl' };
const INTERDITS = /faux|raté|perdu|monstre|ennemi|attaque|poursui|classement|corbeau|krâ|kraa/i;

async function ouvrir(browser, options = TABLETTE) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.setExtraHTTPHeaders(GL);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('gl_intro_seen', '1');
    } catch (_) {
      /* stockage indisponible : l'intro s'affichera, le test la passera */
    }
  });
  return { context, page };
}

test.describe('GL — escalier du chapitre 1', () => {
  test('séance 1 sans sorts ni voile, « Maintenant, vous pouvez… », puis la suite s’ouvre : sorts et page témoin', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const ctx = await createTenirGame({
      stamp: Date.now(),
      plateau: 1,
      playerCount: 8,
      overrides: { escalier: true, escalier_pas: 1 },
    });
    await importExempleChasse(db, { game: ctx.game });
    const gameId = Number(ctx.game.id);
    const prof = { Authorization: `Bearer ${ctx.adminToken}`, ...GL };
    const api = (path) => `/api/gl/games/${gameId}${path}`;
    const poster = async (path, data = {}) => {
      const res = await request.post(api(path), { headers: prof, data });
      expect(res.ok(), `${path} : ${await res.text()}`).toBeTruthy();
      return res.json();
    };

    // Le serveur e2e tourne dans un autre processus : écrire par sa route périme son cache.
    const leve = await request.put('/api/gl/admin/settings/gameplay.tenir_enabled', {
      headers: prof,
      data: { value: true },
    });
    expect(leve.ok(), await leve.text()).toBeTruthy();
    // Le profil garde l'escalier (son pas appartient au serveur), sur tablette, dés tirés par l'app.
    const profil = await request.put(api('/tenir/profil'), {
      headers: prof,
      data: {
        profil: 'complet',
        overrides: { surface: 'tablette', des_mode: 'serveur', escalier: true },
      },
    });
    expect(profil.ok(), await profil.text()).toBeTruthy();
    expect((await profil.json()).settings.escalier_pas).toBe(1);

    // --- Une tablette rejoint les Gnomes ; le prof ouvre le tour -----------------------------
    const lien = await (
      await request.get(`/api/gl/classes/${ctx.cls.id}/lien`, { headers: prof })
    ).json();
    const jeton = new URL(lien.url, 'http://gl.local/').searchParams.get('classe');
    const gnomes = ctx.teams.find((t) => t.type === 'gnome');
    const { context, page } = await ouvrir(browser);
    await page.goto(`/?classe=${encodeURIComponent(jeton)}`);
    await page.getByTestId(`gl-class-link-team-${gnomes.id}`).click();
    await expect(page.getByTestId('gl-team-session')).toBeVisible();
    await poster('/tenir/tour/ouvrir');
    await poster('/tenir/tour/phase', { phase: 'jeu' });

    const equipe = page.getByTestId('gl-tenir-equipe');
    const actualiser = async () => {
      const bouton = page.getByRole('button', { name: 'Actualiser' });
      if (await bouton.isVisible()) await bouton.click();
    };
    await expect(async () => {
      if (!(await equipe.isVisible())) await actualiser();
      await expect(equipe).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });

    // Séance 1 : les gestes ouverts, avec l'appel du rôle ; aucun bouton de sort, même grisé.
    const maintenant = page.getByTestId('gl-tenir-maintenant');
    await expect(maintenant).toBeVisible();
    await expect(maintenant).toContainText('Maintenant, vous pouvez…');
    await expect(maintenant).toContainText('Gestionnaire : lancer les dés');
    await expect(maintenant).toContainText('Opératrice ou Opérateur : 2 fouilles');
    await expect(maintenant).not.toContainText('les sorts');
    await expect(equipe.locator('[data-geste="jeter"]')).toHaveCount(0);
    await expect(equipe.locator('[data-geste="lancer"]')).toBeEnabled();
    await expect(equipe.locator('[data-geste="fouiller"]')).toBeEnabled();
    await expect(equipe).not.toContainText(INTERDITS);
    await page.screenshot({ path: 'docs/captures/tenir-v2/escalier-seance-1-equipe.png' });

    // --- Le prof ouvre la suite, deux fois : séance 3 ----------------------------------------
    const s2 = await poster('/tenir/escalier/suite');
    expect(s2.escalier.pas).toBe(2);
    const s3 = await poster('/tenir/escalier/suite');
    expect(s3.escalier.pas).toBe(3);
    expect(s3.ouvert.modules).toEqual(['voile', 'page_temoin', 'sorts', 'lumiere']);
    // La page témoin : une zone encore endormie a pâli, une seule fois.
    const temoin = await db.queryAll(
      "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'page_temoin'",
      [gameId],
    );
    expect(temoin).toHaveLength(1);
    const palies = await db.queryOne(
      "SELECT COUNT(*) AS n FROM gl_game_chasse_pages WHERE game_id = ? AND etat = 'palie'",
      [gameId],
    );
    expect(Number(palies.n)).toBe(1);

    // La tablette suit : le bouton des sorts paraît, la liste l'annonce.
    await expect(async () => {
      if (!(await equipe.locator('[data-geste="jeter"]').isVisible())) await actualiser();
      await expect(equipe.locator('[data-geste="jeter"]')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    await expect(maintenant).toContainText('Assistante ou Assistant : les sorts');
    await page.screenshot({ path: 'docs/captures/tenir-v2/escalier-seance-3-equipe.png' });

    // --- Fin de séance : la projection accroche la suivante ----------------------------------
    await poster('/tenir/tour/phase', { phase: 'souffle', faces: [2] });
    await poster('/tenir/tour/phase', { phase: 'clos' });
    const jetonProjection = await poster('/projection-token');
    expect(jetonProjection.url || jetonProjection.token).toBeTruthy();
    const ecran = await ouvrir(browser, {
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const urlProjection =
      jetonProjection.url || `/?projection=${encodeURIComponent(jetonProjection.token)}`;
    await ecran.page.goto(urlProjection);
    const accroche = ecran.page.getByTestId('gl-projection-accroche');
    await expect(accroche).toBeVisible({ timeout: 30_000 });
    await expect(accroche).toContainText('À la prochaine séance');
    // L'indice d'une zone qui dort encore (la page du Passeur, elle, vient du corpus : ses mots
    // sont les siens, relus ailleurs).
    const indice = ecran.page.getByTestId('gl-projection-accroche-indice');
    await expect(indice).toContainText('Une page dort encore');
    await expect(indice).not.toContainText(INTERDITS);
    await accroche.scrollIntoViewIfNeeded();
    await ecran.page.screenshot({
      path: 'docs/captures/tenir-v2/escalier-accroche-projection.png',
    });

    await ecran.context.close();
    await context.close();
    // Le pas n'a fait que monter : deux avances du prof, puis la clôture du tour.
    const fin = await (await request.get(api('/tenir'), { headers: prof })).json();
    expect(fin.escalier.pas).toBe(4);
    expect(fin.escalier.monte).toBe(true);
  });
});
