const { test, expect } = require('@playwright/test');
const { queryOne } = require('../database');
const { createTenirGame } = require('../tests/helpers/glTenirFixtures');
const { mountGlSession } = require('./fixtures/gl.fixture');

// « Tenir à deux », lot 2 — jeu en parallèle sur tablettes de classe.
// Quatre tablettes ouvrent le lien de la classe (trois par le QR, une par le code à huit
// caractères), touchent chacune la mascotte de leur équipe et arrivent sur l'écran d'équipe.
// Le prof ouvre le tour : chaque tablette confirme sa présence, l'une jette les dés. Un
// cinquième appareil, connecté avec un compte d'élève, arrive sur le même écran d'équipe.
// Captures : docs/captures/tenir-v2/tablette-*.png.

const TABLETTE = { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 };
const GL = { 'X-Foretmap-Product': 'gl' };

async function ouvrirTablette(browser) {
  const context = await browser.newContext(TABLETTE);
  const page = await context.newPage();
  await page.setExtraHTTPHeaders(GL);
  // L'intro et les visites guidées ne sont pas l'objet du test.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('gl_intro_seen', '1');
    } catch (_) {
      /* stockage indisponible : l'intro s'affichera, le test la passera */
    }
  });
  return { context, page };
}

test.describe('GL — tablettes d’équipe par le lien de classe', () => {
  test('quatre tablettes rejoignent leur équipe, confirment leur présence et jouent en parallèle ; un compte élève arrive sur le même écran', async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const ctx = await createTenirGame({ stamp: Date.now(), plateau: 1, playerCount: 8 });
    const gameId = Number(ctx.game.id);
    const prof = { Authorization: `Bearer ${ctx.adminToken}`, ...GL };
    const api = (path) => `/api/gl/games/${gameId}${path}`;

    // Le serveur e2e tourne dans un autre processus : une écriture par sa propre route périme
    // son cache de réglages (le mode « Tenir à deux » vient d'être levé par la fixture).
    const avant = await queryOne(
      "SELECT value_json FROM gl_settings WHERE `key` = 'gameplay.tenir_enabled'",
    );
    const leve = await request.put('/api/gl/admin/settings/gameplay.tenir_enabled', {
      headers: prof,
      data: { value: true },
    });
    expect(leve.ok(), await leve.text()).toBeTruthy();

    // Dés tirés par le serveur sur les tablettes (réglage de la partie, sans validation du prof).
    const profil = await request.put(api('/tenir/profil'), {
      headers: prof,
      data: { profil: 'complet', overrides: { surface: 'tablette', des_mode: 'serveur' } },
    });
    expect(profil.ok(), await profil.text()).toBeTruthy();

    const lienRes = await request.get(`/api/gl/classes/${ctx.cls.id}/lien`, { headers: prof });
    expect(lienRes.ok(), await lienRes.text()).toBeTruthy();
    const lien = await lienRes.json();
    expect(lien.code).toMatch(/^[A-Z0-9]{8}$/);
    const jeton = new URL(lien.url, 'http://gl.local/').searchParams.get('classe');
    expect(jeton).toBeTruthy();

    // --- Quatre tablettes, hors tour : chacune choisit son équipe ---------------------------
    const tablettes = [];
    for (const [i, team] of ctx.teams.entries()) {
      const t = await ouvrirTablette(browser);
      if (i < 3) {
        await t.page.goto(`/?classe=${encodeURIComponent(jeton)}`);
      } else {
        // La quatrième n'a pas d'appareil photo : elle tape le code de la feuille du prof.
        await t.page.goto('/');
        await t.page.getByRole('button', { name: 'J’ai le code de la classe' }).click();
        await t.page.getByTestId('gl-class-link-code').fill(lien.code);
        await t.page.getByRole('button', { name: 'Continuer' }).click();
      }
      await expect(t.page.getByTestId('gl-class-link')).toBeVisible({ timeout: 20_000 });
      if (i === 0) {
        await expect(t.page.getByTestId(`gl-class-link-team-${ctx.teams[3].id}`)).toBeVisible();
        await t.page.screenshot({ path: 'docs/captures/tenir-v2/tablette-choix-equipe.png' });
      }
      await t.page.getByTestId(`gl-class-link-team-${team.id}`).click();
      await expect(t.page.getByTestId('gl-team-session')).toBeVisible({ timeout: 20_000 });
      await expect(t.page.getByTestId('gl-team-session')).toContainText(team.name);
      // Hors tour : lecture seule, on attend le prof.
      await expect(t.page.getByTestId('gl-team-session-attente')).toBeVisible();
      // Le jeton du lien ne reste pas dans l'adresse de la tablette.
      expect(t.page.url()).not.toContain('classe=');
      tablettes.push({ ...t, team });
    }
    const sessions = await (await request.get(api('/tenir/sessions'), { headers: prof })).json();
    expect(new Set(sessions.sessions.map((s) => Number(s.teamId))).size).toBe(4);

    // --- Le prof ouvre le tour : les quatre équipes jouent en même temps --------------------
    const ouvert = await request.post(api('/tenir/tour/ouvrir'), { headers: prof, data: {} });
    expect(ouvert.ok(), await ouvert.text()).toBeTruthy();
    const jeu = await request.post(api('/tenir/tour/phase'), {
      headers: prof,
      data: { phase: 'jeu' },
    });
    expect(jeu.ok(), await jeu.text()).toBeTruthy();

    for (const t of tablettes) {
      // L'écran passe seul au tour ouvert (temps réel, sinon « Actualiser »).
      const equipe = t.page.getByTestId('gl-tenir-equipe');
      await expect(async () => {
        if (!(await equipe.isVisible())) {
          const actualiser = t.page.getByRole('button', { name: 'Actualiser' });
          if (await actualiser.isVisible()) await actualiser.click();
        }
        await expect(equipe).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
      // « Il manque quelqu'un ? » : personne ne manque.
      await expect(t.page.getByTestId('gl-presence')).toBeVisible({ timeout: 15_000 });
      await t.page.getByTestId('gl-presence-ok').click();
      await expect(t.page.getByTestId('gl-presence')).toBeHidden({ timeout: 15_000 });
    }
    const presences = await queryOne(
      'SELECT COUNT(*) AS n FROM gl_game_round_presences WHERE game_id = ?',
      [gameId],
    );
    expect(Number(presences.n)).toBe(4);

    // Deux tablettes jettent les dés au même instant : chacune garde son propre jet.
    const jeter = async (t) => {
      const equipe = t.page.getByTestId('gl-tenir-equipe');
      await equipe.getByRole('button', { name: 'Lancer', exact: true }).click();
      await t.page
        .getByTestId('gl-tour-des')
        .getByRole('button', { name: /^Lancer \d+ dés$/ })
        .click();
    };
    await Promise.all([jeter(tablettes[0]), jeter(tablettes[2])]);
    await expect
      .poll(
        async () =>
          Number(
            (
              await queryOne(
                "SELECT COUNT(DISTINCT team_id) AS n FROM gl_game_events WHERE game_id = ? AND event_type = 'dice_roll'",
                [gameId],
              )
            ).n,
          ),
        { timeout: 20_000 },
      )
      .toBe(2);
    const acteurs = await queryOne(
      "SELECT COUNT(*) AS n FROM gl_game_events WHERE game_id = ? AND actor_id LIKE 'equipe-%'",
      [gameId],
    );
    expect(Number(acteurs.n)).toBeGreaterThan(0);
    await tablettes[0].page.screenshot({
      path: 'docs/captures/tenir-v2/tablette-ecran-equipe.png',
    });

    // Le Marché depuis la tablette : « Qui agit ? », puis la place au nom de l'élève choisi.
    const marcheur = ctx.players.find((p) => Number(p.teamId) === Number(tablettes[1].team.id));
    await tablettes[1].page.getByTestId('gl-team-session-marche').click();
    const marche = tablettes[1].page.getByTestId('gl-marche-tablette');
    await expect(marche).toContainText('Qui agit ?');
    await tablettes[1].page.getByTestId(`gl-qui-agit-${marcheur.id}`).click();
    await expect(tablettes[1].page.getByTestId('gl-qui-agit-choisi')).toContainText(
      marcheur.pseudo,
    );
    await expect(marche.getByRole('tab', { name: 'La place' })).toBeVisible({ timeout: 15_000 });
    await expect(marche.locator('.gl-error-banner')).toHaveCount(0);
    await tablettes[1].page.screenshot({ path: 'docs/captures/tenir-v2/tablette-qui-agit.png' });
    await marche.getByRole('button', { name: 'Fermer le Marché' }).click();
    await expect(marche).toBeHidden();

    // Rien ne classe, aucun mot ne punit, aucune bourse d'une autre équipe.
    const texte = await tablettes[1].page.locator('body').innerText();
    expect(texte).not.toMatch(/classement|\brang\b|premier de/i);
    expect(texte).not.toMatch(/\b(faux|raté|perdu)\b/i);

    // --- La console du prof : file « Demandes » (jets en suspens) et feuille du QR -----------
    const consoleProf = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const pageProf = await consoleProf.newPage();
    await mountGlSession(pageProf, {
      token: ctx.adminToken,
      auth: { userType: 'gl_admin', roleSlug: 'gl_admin', displayName: 'MJ e2e' },
      tab: 'mj',
    });
    await expect(pageProf.getByRole('heading', { name: 'Console MJ' })).toBeVisible({
      timeout: 20_000,
    });
    await pageProf
      .locator('tr', { hasText: ctx.game.name })
      .getByRole('button', { name: 'Ouvrir' })
      .click();
    await expect(pageProf.getByTestId('gl-tour-screen')).toBeVisible({ timeout: 20_000 });
    const demandes = pageProf.getByTestId('gl-demandes');
    await expect(demandes).toBeVisible();
    await expect(pageProf.getByTestId('gl-class-link-sessions-count')).toContainText(
      '4 équipes sur 4',
    );
    await demandes.scrollIntoViewIfNeeded();
    await pageProf.screenshot({ path: 'docs/captures/tenir-v2/console-demandes.png' });
    await pageProf.getByTestId('gl-class-link-qr').click();
    const feuille = pageProf.getByTestId('gl-class-link-sheet');
    // L'image du QR est enveloppée par le bouton « Agrandir l'image » de l'app.
    await expect(feuille.locator('img.gl-class-link-sheet__qr')).toBeVisible({ timeout: 15_000 });
    await expect(feuille).toContainText('Code de la classe');
    await feuille.scrollIntoViewIfNeeded();
    await feuille.screenshot({ path: 'docs/captures/tenir-v2/qr-de-la-classe.png' });
    await consoleProf.close();

    // --- Un cinquième appareil : compte élève, même écran d'équipe ---------------------------
    const eleve = ctx.players.find((p) => Number(p.teamId) === Number(ctx.teams[1].id));
    const cinquieme = await browser.newContext(TABLETTE);
    const pageEleve = await cinquieme.newPage();
    await mountGlSession(pageEleve, {
      token: eleve.token,
      auth: {
        userType: 'gl_player',
        roleSlug: 'gl_player',
        displayName: eleve.pseudo,
        userId: String(eleve.id),
        teamId: Number(eleve.teamId),
      },
      tab: 'maps',
    });
    await expect(pageEleve.getByTestId('gl-tenir-equipe')).toBeVisible({ timeout: 30_000 });
    // Sa tablette d'équipe a déjà confirmé la présence : on ne la lui redemande pas.
    await expect(pageEleve.getByTestId('gl-presence')).toBeHidden();
    await expect(pageEleve.getByTestId('gl-tenir-cases-a-venir')).toBeVisible();

    // --- Le prof clôt : la file est vide, les tablettes reviennent à l'attente --------------
    for (const body of [{ phase: 'souffle', dort: true }, { phase: 'clos' }]) {
      const res = await request.post(api('/tenir/tour/phase'), { headers: prof, data: body });
      expect(res.ok(), await res.text()).toBeTruthy();
    }
    const file = await (await request.get(api('/tenir/demandes'), { headers: prof })).json();
    expect(file.total).toBe(0);
    await expect(async () => {
      const attente = tablettes[3].page.getByTestId('gl-team-session-attente');
      if (!(await attente.isVisible())) await tablettes[3].page.reload();
      await expect(attente).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });

    for (const t of tablettes) await t.context.close();
    await cinquieme.close();
    if (!avant || JSON.parse(String(avant.value_json)) !== true) {
      await request.put('/api/gl/admin/settings/gameplay.tenir_enabled', {
        headers: prof,
        data: { value: false },
      });
    }
  });
});
