const { test, expect } = require('@playwright/test');
const { queryOne, execute } = require('../database');
const { createTenirGame } = require('../tests/helpers/glTenirFixtures');
const { mountGlSession } = require('./fixtures/gl.fixture');

// « Tenir à deux », lot 2 — jeu en parallèle sur tablettes de classe.
// Quatre tablettes ouvrent le lien de la classe (trois par le QR, une par le code à huit
// caractères), touchent chacune la mascotte de leur équipe et **attendent d'être acceptées**
// (ensemble unifié, M13 : le prof accepte la première tablette de chaque équipe, « Tout
// accepter »). Le prof ouvre le tour : chacun est présent d'office (rien à confirmer), l'une
// jette les dés. Un cinquième appareil, connecté avec un compte d'élève, arrive sur le même
// écran d'équipe.
// Second scénario : trois appareils dans UNE équipe (deux tablettes et un compte) — la seconde
// tablette acceptée par la première, la main (« … prépare un sort »), la version d'état.
// Captures : docs/captures/tenir-v2/tablette-*.png, appareils-*.png.

const TABLETTE = { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 };
const GL = { 'X-Foretmap-Product': 'gl' };

async function ouvrirTablette(browser) {
  const context = await browser.newContext(TABLETTE);
  const page = await context.newPage();
  // Un geste qui n'aboutit pas échoue à sa ligne, pas au délai global du test.
  page.setDefaultTimeout(20_000);
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
  // Case du plateau d'exemple marquée « Défi d'équipe » le temps du test, puis remise.
  let caseMarquee = null;
  test.afterEach(async () => {
    if (!caseMarquee) return;
    await execute('UPDATE gl_chapter_markers SET event_config_json = ? WHERE id = ?', [
      caseMarquee.avant,
      caseMarquee.id,
    ]);
    caseMarquee = null;
  });

  test('quatre tablettes rejoignent leur équipe et jouent en parallèle, sans présence à confirmer ; un compte élève arrive sur le même écran', async ({
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
      // Sessions protégées (M13) : la tablette demande à rejoindre l'équipe, et attend.
      await expect(t.page.getByTestId('gl-class-link-attente')).toBeVisible({ timeout: 20_000 });
      await expect(t.page.getByTestId('gl-class-link-attente')).toContainText(team.name);
      if (i === 0) {
        await t.page.screenshot({ path: 'docs/captures/tenir-v2/tablette-attente.png' });
      }
      tablettes.push({ ...t, team });
    }
    // Le prof voit quatre demandes et les accepte d'un appui (« Tout accepter »).
    const enAttente = await (await request.get(api('/tenir/sessions'), { headers: prof })).json();
    expect(enAttente.sessions).toHaveLength(0);
    expect(new Set(enAttente.demandes.map((d) => Number(d.teamId))).size).toBe(4);
    const tout = await request.post(api('/tenir/sessions/accepter-tout'), {
      headers: prof,
      data: {},
    });
    expect(tout.ok(), await tout.text()).toBeTruthy();
    expect((await tout.json()).acceptees).toBe(4);
    for (const t of tablettes) {
      await expect(t.page.getByTestId('gl-team-session')).toBeVisible({ timeout: 20_000 });
      await expect(t.page.getByTestId('gl-team-session')).toContainText(t.team.name);
      // Hors tour : lecture seule, on attend le prof.
      await expect(t.page.getByTestId('gl-team-session-attente')).toBeVisible();
      // Le jeton du lien ne reste pas dans l'adresse de la tablette.
      expect(t.page.url()).not.toContain('classe=');
    }
    const sessions = await (await request.get(api('/tenir/sessions'), { headers: prof })).json();
    expect(new Set(sessions.sessions.map((s) => Number(s.teamId))).size).toBe(4);
    expect(sessions.demandes).toHaveLength(0);

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
      // Ensemble unifié (M14) : tout le monde est là d'office. Rien à confirmer pour jouer,
      // seulement un bouton discret « Il manque quelqu'un ? ».
      const ouvrir = t.page.getByTestId('gl-presence-ouvrir');
      await expect(ouvrir).toBeVisible({ timeout: 15_000 });
      await expect(t.page.getByTestId('gl-presence')).toBeHidden();
      if (t === tablettes[0]) {
        // Une équipe ouvre le panneau : personne ne manque, « C'est bon » le referme.
        await ouvrir.getByRole('button').click();
        await expect(t.page.getByTestId('gl-presence')).toBeVisible();
        await t.page.screenshot({ path: 'docs/captures/tenir-v2/tablette-presences.png' });
        await t.page.getByTestId('gl-presence-ok').click();
        await expect(t.page.getByTestId('gl-presence')).toBeHidden({ timeout: 15_000 });
      }
    }
    // Aucune demande de présence n'attend dans la file du prof.
    const demandesPresence = await queryOne(
      "SELECT COUNT(*) AS n FROM gl_game_demandes WHERE game_id = ? AND kind = 'presence_a_confirmer'",
      [gameId],
    );
    expect(Number(demandesPresence.n)).toBe(0);

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

    // Le pot d'un sort sur la tablette : part automatique des présents. « Pas moi » ne se dit
    // plus d'ici (M13, bourses au propriétaire) : depuis son propre compte, ou au prof.
    const potier = tablettes[1].page;
    // Sentier (gnome, 2 cœurs, chapitre 1 : ensemble unifié M6 — Abri s’ouvre au chapitre 2).
    await potier.getByRole('button', { name: 'Jeter un sort' }).click();
    await potier.getByTestId('gl-sorts-moments').locator('[data-sort="SL042"]').click();
    const lignes = potier.locator('[data-testid^="gl-pot-ligne-"]');
    await expect(lignes).toHaveCount(2, { timeout: 15_000 });
    await expect(lignes.first()).toContainText('❤️ 1');
    await expect(potier.getByRole('button', { name: 'pas moi' })).toHaveCount(0);
    await expect(potier.getByTestId('gl-pot-comptes')).toContainText(
      '« Pas moi » se dit depuis son propre compte, ou au prof.',
    );
    await potier.screenshot({ path: 'docs/captures/tenir-v2/tablette-pot-pas-moi.png' });
    await potier.getByRole('button', { name: 'Annuler le brouillon' }).click();
    await expect(lignes).toHaveCount(0, { timeout: 15_000 });
    const assistant = potier.getByRole('dialog');
    if (await assistant.isVisible()) {
      await assistant.getByRole('button', { name: 'Fermer' }).first().click();
    }
    await expect(assistant).toBeHidden({ timeout: 15_000 });
    const fermerSorts = potier.getByRole('button', { name: 'Fermer les sorts' });
    if (await fermerSorts.isVisible()) await fermerSorts.click();

    // Le Marché ne s'ouvre plus depuis la tablette d'équipe (M13) : « Qui agit ? » a disparu,
    // l'écran dit où aller, et le serveur refuse quoi qu'on lui envoie.
    await expect(tablettes[1].page.getByTestId('gl-team-session-marche')).toHaveCount(0);
    await expect(tablettes[1].page.getByTestId('gl-team-session-comptes')).toContainText(
      'Le Marché et le Seuil s’ouvrent depuis le compte de chacun.',
    );
    const jetonTablette = await tablettes[1].page.evaluate(
      () => JSON.parse(sessionStorage.getItem('gl_team_session') || '{}').token || null,
    );
    expect(jetonTablette).toBeTruthy();
    const marcheur = ctx.players.find((p) => Number(p.teamId) === Number(tablettes[1].team.id));
    const marche = await request.get('/api/gl/market/annonces', {
      headers: {
        Authorization: `Bearer ${jetonTablette}`,
        'X-GL-On-Behalf-Of': String(marcheur.id),
        ...GL,
      },
    });
    expect(marche.status()).toBe(403);
    expect((await marche.json()).code).toBe('BOURSE_AU_PROPRIETAIRE');

    // Rien ne classe, aucun mot ne punit, aucune bourse d'une autre équipe.
    const texte = await tablettes[1].page.locator('body').innerText();
    expect(texte).not.toMatch(/classement|\brang\b|premier de/i);
    expect(texte).not.toMatch(/\b(faux|raté|perdu)\b/i);

    // --- Défi de case : Licornes B s'arrête sur une case « Défi d'équipe » -------------------
    // La case « Étape » (trois cases après le départ) est marquée le temps du test.
    const caseDefi = ctx.markers[3];
    caseMarquee = {
      id: caseDefi.id,
      avant: (
        await queryOne('SELECT event_config_json FROM gl_chapter_markers WHERE id = ?', [
          caseDefi.id,
        ])
      ).event_config_json,
    };
    await execute('UPDATE gl_chapter_markers SET event_config_json = ? WHERE id = ?', [
      JSON.stringify({ version: 2, tenir: { defi: true } }),
      caseDefi.id,
    ]);
    const avance = await request.post(api('/tenir/lancer'), {
      headers: prof,
      data: { mode: 'libre', teamId: ctx.teams[3].id, cases: 3, motif: 'case Défi (e2e)' },
    });
    expect(avance.ok(), await avance.text()).toBeTruthy();
    const defiRecu = (await (await request.get(api('/defis-case'), { headers: prof })).json())
      .defis[0];
    expect(defiRecu.statut).toBe('a_preparer');
    expect(defiRecu.critere).toBeTruthy();
    const pageDefi = tablettes[3].page;
    const panneauDefi = pageDefi.getByTestId('gl-defis-case');
    await expect(async () => {
      if (!(await panneauDefi.isVisible())) {
        await pageDefi.getByRole('button', { name: 'Actualiser' }).first().click();
      }
      await expect(panneauDefi).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    await expect(panneauDefi).toContainText(defiRecu.titre);
    // Le critère de réussite est pour le prof seul.
    expect(await pageDefi.locator('body').innerText()).not.toContain(defiRecu.critere);
    await panneauDefi.scrollIntoViewIfNeeded();
    await pageDefi.screenshot({ path: 'docs/captures/tenir-v2/tablette-defi-de-case.png' });

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
    // La ligne du défi : consigne, critère pour le prof seul, « Relevé » / « Pas encore ».
    const ligneDefi = demandes.locator('[data-kind="defi_case"]');
    await expect(ligneDefi).toContainText('Licornes B');
    await expect(ligneDefi.getByTestId('gl-defi-critere')).toContainText(defiRecu.critere);
    await ligneDefi.getByRole('button', { name: 'Sablier' }).click();
    await expect(ligneDefi.getByTestId('gl-defi-sablier')).toBeVisible();
    await ligneDefi.scrollIntoViewIfNeeded();
    await ligneDefi.screenshot({ path: 'docs/captures/tenir-v2/console-defi-a-juger.png' });
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
    // Présent d'office, comme sa tablette d'équipe : aucun écran de présence à passer.
    await expect(pageEleve.getByTestId('gl-presence')).toBeHidden();
    await expect(pageEleve.getByTestId('gl-tenir-cases-a-venir')).toBeVisible();

    // --- Le prof clôt : la file est vide, les tablettes reviennent à l'attente --------------
    for (const body of [{ phase: 'souffle', dort: true }, { phase: 'clos' }]) {
      const res = await request.post(api('/tenir/tour/phase'), { headers: prof, data: body });
      expect(res.ok(), await res.text()).toBeTruthy();
    }
    // Seuls les défis à préparer passent la clôture du tour ; jugés, il ne reste rien. Les dés
    // sont tirés par le serveur : une équipe dont le jet (2 + 1) s'arrête sur la case marquée
    // reçoit elle aussi un défi quand son jet en suspens s'applique à la clôture.
    const file = await (await request.get(api('/tenir/demandes'), { headers: prof })).json();
    const restantes = file.demandes.map((d) => d.kind);
    expect(restantes.length).toBeGreaterThanOrEqual(1);
    expect(restantes.every((kind) => kind === 'defi_case')).toBe(true);
    const juge = await request.post(api(`/defis-case/${defiRecu.id}/decider`), {
      headers: prof,
      data: { releve: true },
    });
    expect(juge.ok(), await juge.text()).toBeTruthy();
    expect((await juge.json()).statut).toBe('releve');
    const autres = (await (await request.get(api('/defis-case'), { headers: prof })).json()).defis;
    for (const defi of autres.filter((d) => d.statut === 'a_preparer')) {
      const res = await request.post(api(`/defis-case/${defi.id}/decider`), {
        headers: prof,
        data: { releve: true },
      });
      expect(res.ok(), await res.text()).toBeTruthy();
    }
    const vide = await (await request.get(api('/tenir/demandes'), { headers: prof })).json();
    expect(vide.total).toBe(0);
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
  test('trois appareils dans une équipe : deux tablettes et un compte — acceptation, la main, la version d’état', async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const ctx = await createTenirGame({ stamp: Date.now(), plateau: 1, playerCount: 8 });
    const gameId = Number(ctx.game.id);
    const prof = { Authorization: `Bearer ${ctx.adminToken}`, ...GL };
    const api = (path) => `/api/gl/games/${gameId}${path}`;
    const team = ctx.teams[0];
    const eleve = ctx.players.find((p) => Number(p.teamId) === Number(team.id));
    // Prénom de l'élève : c'est lui que les autres appareils liront (« Lina prépare un sort… »).
    await execute("UPDATE gl_players SET first_name = 'Lina', last_name = 'Secret' WHERE id = ?", [
      eleve.id,
    ]);

    const avant = await queryOne(
      "SELECT value_json FROM gl_settings WHERE `key` = 'gameplay.tenir_enabled'",
    );
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
    const lien = await (
      await request.get(`/api/gl/classes/${ctx.cls.id}/lien`, { headers: prof })
    ).json();
    const jeton = new URL(lien.url, 'http://gl.local/').searchParams.get('classe');

    // --- Première tablette : acceptée par le prof ------------------------------------------
    const a = await ouvrirTablette(browser);
    await a.page.goto(`/?classe=${encodeURIComponent(jeton)}`);
    await a.page.getByTestId(`gl-class-link-team-${team.id}`).click();
    await expect(a.page.getByTestId('gl-class-link-attente')).toBeVisible({ timeout: 20_000 });
    const tout = await request.post(api('/tenir/sessions/accepter-tout'), {
      headers: prof,
      data: {},
    });
    expect((await tout.json()).acceptees).toBe(1);
    await expect(a.page.getByTestId('gl-team-session')).toBeVisible({ timeout: 20_000 });

    // Le prof ouvre le tour : la suite se joue à trois appareils.
    for (const [path, data] of [
      ['/tenir/tour/ouvrir', {}],
      ['/tenir/tour/phase', { phase: 'jeu' }],
    ]) {
      const res = await request.post(api(path), { headers: prof, data });
      expect(res.ok(), await res.text()).toBeTruthy();
    }
    const ecranEquipe = async (page) => {
      const equipe = page.getByTestId('gl-tenir-equipe');
      await expect(async () => {
        if (!(await equipe.isVisible())) {
          const actualiser = page.getByRole('button', { name: 'Actualiser' });
          if (await actualiser.first().isVisible()) await actualiser.first().click();
        }
        await expect(equipe).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
      return equipe;
    };
    await ecranEquipe(a.page);

    // --- Seconde tablette : c'est la première, déjà dans l'équipe, qui l'accepte ------------
    const b = await ouvrirTablette(browser);
    await b.page.goto(`/?classe=${encodeURIComponent(jeton)}`);
    await b.page.getByTestId(`gl-class-link-team-${team.id}`).click();
    await expect(b.page.getByTestId('gl-class-link-attente')).toBeVisible({ timeout: 20_000 });
    const demande = a.page.getByTestId('gl-tenir-appareils');
    await expect(async () => {
      if (!(await demande.isVisible())) {
        await a.page.getByRole('button', { name: 'Actualiser' }).first().click();
      }
      await expect(demande).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    await expect(demande).toContainText('Une tablette demande à rejoindre l’équipe.');
    await demande.scrollIntoViewIfNeeded();
    await a.page.screenshot({ path: 'docs/captures/tenir-v2/appareils-demande.png' });
    await demande.getByRole('button', { name: 'Accepter' }).click();
    await expect(b.page.getByTestId('gl-team-session')).toBeVisible({ timeout: 20_000 });
    await ecranEquipe(b.page);
    await expect(a.page.getByTestId('gl-tenir-appareils')).toBeHidden({ timeout: 15_000 });
    const acceptees = await queryOne(
      `SELECT SUM(accepted_by = 'mj') AS prof, SUM(accepted_by = 'equipe') AS equipe
         FROM gl_guest_tokens WHERE game_id = ? AND kind = 'team_session'`,
      [gameId],
    );
    expect([Number(acceptees.prof), Number(acceptees.equipe)]).toEqual([1, 1]);

    // --- Troisième appareil : le compte d'un élève de l'équipe, même écran ------------------
    const c = await browser.newContext(TABLETTE);
    const pageEleve = await c.newPage();
    pageEleve.setDefaultTimeout(20_000);
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
    await ecranEquipe(pageEleve);

    // --- La main : l'élève prépare un sort depuis son compte, les deux tablettes attendent ---
    await pageEleve.getByRole('button', { name: 'Jeter un sort' }).click();
    await pageEleve.getByTestId('gl-sorts-moments').locator('[data-sort="SL042"]').click();
    // Avec un compte, l'assistant demande d'abord quelle équipe lance : la sienne.
    await pageEleve
      .getByRole('dialog')
      .getByRole('button', { name: /Gnomes A/ })
      .click();
    await expect(pageEleve.locator('[data-testid^="gl-pot-ligne-"]').first()).toBeVisible({
      timeout: 15_000,
    });
    for (const t of [a, b]) {
      const main = t.page.getByTestId('gl-tenir-main');
      await expect(async () => {
        if (!(await main.isVisible())) {
          await t.page.getByRole('button', { name: 'Actualiser' }).first().click();
        }
        await expect(main).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
      // Prénom seul, jamais le nom de famille ; les gestes de l'écran sont éteints.
      await expect(main).toHaveText('Lina prépare un sort…');
      await expect(t.page.locator('[data-geste="lancer"]')).toBeDisabled();
      expect(await t.page.locator('body').innerText()).not.toContain('Secret');
    }
    await a.page.getByTestId('gl-tenir-main').scrollIntoViewIfNeeded();
    await a.page.screenshot({ path: 'docs/captures/tenir-v2/appareils-la-main.png' });
    // Le serveur refuse proprement le geste d'une tablette qui passerait outre l'écran.
    const jetonA = await a.page.evaluate(
      () => JSON.parse(sessionStorage.getItem('gl_team_session') || '{}').token || null,
    );
    const force = await request.post(api('/tenir/lancer'), {
      headers: { Authorization: `Bearer ${jetonA}`, ...GL },
      data: { mode: 'serveur' },
    });
    expect(force.status()).toBe(409);
    const refus = await force.json();
    expect(refus.code).toBe('MAIN_AILLEURS');
    expect(refus.error).toBe('Lina prépare un sort… Attendez la fin de son geste.');
    // L'élève annule son brouillon : la main revient à l'équipe, les tablettes se rallument.
    await pageEleve.getByRole('button', { name: 'Annuler le brouillon' }).click();
    for (const t of [a, b]) {
      await expect(t.page.getByTestId('gl-tenir-main')).toBeHidden({ timeout: 30_000 });
      await expect(t.page.locator('[data-geste="lancer"]')).toBeEnabled({ timeout: 15_000 });
    }
    const assistant = pageEleve.getByRole('dialog');
    if (await assistant.isVisible()) {
      await assistant.getByRole('button', { name: 'Fermer' }).first().click();
    }

    // --- La version d'état : les deux tablettes jettent les dés au même instant -------------
    const jeter = async (t) => {
      await t.page
        .getByTestId('gl-tenir-equipe')
        .getByRole('button', { name: 'Lancer', exact: true })
        .click();
      return t.page.getByTestId('gl-tour-des').getByRole('button', { name: /^Lancer \d+ dés$/ });
    };
    const [boutonA, boutonB] = [await jeter(a), await jeter(b)];
    await Promise.all([boutonA.click(), boutonB.click()]);
    await expect
      .poll(
        async () =>
          Number(
            (
              await queryOne(
                "SELECT COUNT(*) AS n FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'dice_roll'",
                [gameId, team.id],
              )
            ).n,
          ),
        { timeout: 20_000 },
      )
      .toBe(1);
    // Un seul jet au journal ; l'écran qui arrive en second lit où en est l'équipe.
    let second = null;
    await expect
      .poll(
        async () => {
          for (const t of [a, b]) {
            if (await t.page.getByTestId('gl-tenir-etat-perime').isVisible()) second = t;
          }
          return second != null;
        },
        { timeout: 10_000 },
      )
      .toBe(true);
    await expect(second.page.getByTestId('gl-tenir-etat-perime')).toHaveText(
      'L’équipe a déjà joué ce geste. Voici où vous en êtes.',
    );
    await second.page.screenshot({ path: 'docs/captures/tenir-v2/appareils-etat-perime.png' });
    for (const t of [a, b]) {
      await expect(t.page.getByTestId('gl-tenir-cases-a-venir')).toBeHidden({ timeout: 20_000 });
    }
    const texteDesEcrans = `${await a.page.locator('body').innerText()}\n${await b.page.locator('body').innerText()}`;
    const jets = await queryOne(
      "SELECT COUNT(*) AS n FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'dice_roll'",
      [gameId, team.id],
    );
    expect(Number(jets.n)).toBe(1);
    // Rien ne classe, aucun mot ne punit.
    expect(texteDesEcrans).not.toMatch(/classement|\b(faux|raté|perdu)\b/i);

    for (const t of [a, b]) await t.context.close();
    await c.close();
    if (!avant || JSON.parse(String(avant.value_json)) !== true) {
      await request.put('/api/gl/admin/settings/gameplay.tenir_enabled', {
        headers: prof,
        data: { value: false },
      });
    }
  });
});
