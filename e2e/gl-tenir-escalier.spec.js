const { test, expect } = require('@playwright/test');
const db = require('../database');
const { createTenirGame, importExempleChasse } = require('../tests/helpers/glTenirFixtures');
const { servirPlateau } = require('./fixtures/gl-plateau.fixture');

// Ensemble unifié, PR 2 (M8, M10) — l'escalier du chapitre 1, sur la tablette d'une équipe.
// Séance 1 : on avance et on cherche ; ni sorts ni voile. Le prof ouvre la suite : à la séance 3
// les sorts paraissent et la page témoin se pose. L'écran d'équipe montre trois choses : le
// plateau, **une** carte du moment (le gros bouton du geste à faire, avec l'appel du rôle) et
// Olu ; le reste est dans le tiroir « L'équipe ». À 1024 × 768, rien ne défile. À la clôture du
// tour, la projection accroche la séance suivante.
// Captures : docs/captures/tenir-v2/escalier-*.png et
// docs/captures/ecrans-de-seance/apres/tablette-*.png.

const TABLETTE = { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 };
const GL = { 'X-Foretmap-Product': 'gl' };
const INTERDITS = /faux|raté|perdu|monstre|ennemi|attaque|poursui|classement|corbeau|krâ|kraa/i;
const APRES = 'docs/captures/ecrans-de-seance/apres';

/** Où sont le plateau et la carte du moment, et la page défile-t-elle ? */
async function mesures(page) {
  return page.evaluate(() => {
    const racine = document.documentElement;
    const boite = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, bas: r.bottom, droite: r.right };
    };
    const action = document.querySelector('[data-testid="gl-tenir-action"]');
    return {
      vue: { w: window.innerWidth, h: window.innerHeight },
      page: { w: racine.scrollWidth, h: racine.scrollHeight },
      plateau: boite('[data-testid="gl-tenir-plateau"]'),
      scene: boite('[data-testid="gl-tenir-plateau"] .gl-board'),
      carte: boite('[data-testid="gl-tenir-moment"] .gl-tenir-moment__carte'),
      action: boite('[data-testid="gl-tenir-action"]'),
      // Ce que la colonne d'action cache sous son bord (0 : tout se voit sans défiler).
      actionCachee: action ? action.scrollHeight - action.clientHeight : null,
    };
  });
}

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
    await servirPlateau(page);
    await page.goto(`/?classe=${encodeURIComponent(jeton)}`);
    await page.getByTestId(`gl-class-link-team-${gnomes.id}`).click();
    // Sessions protégées (ensemble unifié, M13) : la tablette demande à rejoindre l'équipe ; le
    // prof l'accepte (« Tout accepter »).
    await expect(page.getByTestId('gl-class-link-attente')).toBeVisible();
    const acceptee = await request.post(api('/tenir/sessions/accepter-tout'), {
      headers: prof,
      data: {},
    });
    expect(acceptee.ok(), await acceptee.text()).toBeTruthy();
    await expect(page.getByTestId('gl-team-session')).toBeVisible();
    await poster('/tenir/tour/ouvrir');
    await poster('/tenir/tour/phase', { phase: 'jeu' });

    // L'écran d'équipe est là dès l'acceptation ; il passe seul au tour ouvert (temps réel).
    const equipe = page.getByTestId('gl-tenir-equipe');
    const moment = page.getByTestId('gl-tenir-moment');
    const etat = async (attendu, timeout = 30_000) => {
      await expect(async () => {
        if ((await moment.getAttribute('data-etat')) !== attendu) await page.reload();
        await expect(moment).toHaveAttribute('data-etat', attendu, { timeout: 8_000 });
      }).toPass({ timeout });
    };
    await expect(equipe).toBeVisible();
    await expect(moment).toHaveAttribute('data-etat', 'geste', { timeout: 30_000 });

    // Séance 1 : une seule carte du moment — le gros bouton du premier geste, l'appel du rôle
    // au-dessus, les autres gestes ouverts en puces. Aucun bouton de sort, même grisé.
    const maintenant = page.getByTestId('gl-tenir-maintenant');
    await expect(maintenant).toBeVisible();
    await expect(maintenant.locator('.gl-tenir-moment__role')).toHaveText('Gestionnaire');
    await expect(maintenant.locator('.gl-tenir-moment__gros')).toHaveAttribute(
      'data-geste',
      'lancer',
    );
    await expect(maintenant.locator('.gl-tenir-moment__gros')).toContainText('Lancer les dés');
    await expect(page.getByTestId('gl-tenir-puces').locator('[data-geste="fouiller"]')).toHaveText(
      'Fouiller · 2 fouilles',
    );
    await expect(equipe.locator('[data-geste="jeter"]')).toHaveCount(0);
    await expect(equipe.locator('[data-geste]:disabled')).toHaveCount(0);
    await expect(equipe.locator('[data-geste="lancer"]')).toBeEnabled();
    await expect(equipe).not.toContainText(INTERDITS);
    // Plus d'en-tête de session, plus de mot de surface, plus de bouton « Actualiser ».
    await expect(page.getByTestId('gl-tenir-bandeau')).toContainText(gnomes.name);
    await expect(page.getByTestId('gl-tenir-phase')).toHaveText('Tour 1 — À vous de jouer');
    await expect(equipe).not.toContainText(/tablette|Actualiser|Maintenant, vous pouvez/);
    await expect(page.getByTestId('gl-tenir-reconnexion')).toHaveCount(0);

    // 1024 × 768 : le plateau commence sous le bandeau (plus bas que 120 px : jamais), la carte
    // du moment est tout entière à l'écran, et la page ne défile pas.
    const m = await mesures(page);
    expect(m.page.h, 'la page ne défile pas').toBeLessThanOrEqual(m.vue.h);
    expect(m.page.w).toBeLessThanOrEqual(m.vue.w);
    expect(m.plateau.y, 'le plateau est en haut de l’écran').toBeLessThan(120);
    expect(m.plateau.w / m.vue.w).toBeGreaterThan(0.55);
    expect(m.scene.h, 'le plateau remplit sa zone').toBeGreaterThan(m.plateau.h - 4);
    expect(m.action.x).toBeGreaterThan(m.plateau.droite - 1);
    expect(m.action.w).toBeGreaterThanOrEqual(320);
    expect(m.carte.y).toBeGreaterThanOrEqual(0);
    expect(m.carte.bas, 'la carte du moment est entière à l’écran').toBeLessThanOrEqual(m.vue.h);
    expect(m.actionCachee, 'la colonne d’action ne défile pas').toBeLessThanOrEqual(1);
    await page.screenshot({ path: 'docs/captures/tenir-v2/escalier-seance-1-equipe.png' });
    await page.screenshot({ path: `${APRES}/tablette-geste-1024x768.png` });

    // Le tiroir « L'équipe » : fermé par défaut, il garde le reste (cases à venir, carnet…).
    await expect(page.getByTestId('gl-tenir-tiroir')).toHaveCount(0);
    await page.getByTestId('gl-tenir-tiroir-bouton').click();
    const tiroir = page.getByTestId('gl-tenir-tiroir');
    await expect(tiroir).toBeVisible();
    await expect(tiroir.getByTestId('gl-tenir-cases-a-venir')).toContainText('cases à venir');
    await expect(tiroir.getByTestId('gl-tenir-changer-equipe')).toBeVisible();
    await expect(tiroir).not.toContainText(INTERDITS);
    expect((await mesures(page)).page.h).toBeLessThanOrEqual(m.vue.h);
    await page.screenshot({ path: `${APRES}/tablette-tiroir-1024x768.png` });
    await page.getByTestId('gl-tenir-tiroir-fermer').click();
    await expect(tiroir).toHaveCount(0);

    // Fouiller : la carte du moment dit de toucher le plateau, qui prend le bord doré.
    await page.getByTestId('gl-tenir-puces').locator('[data-geste="fouiller"]').click();
    await expect(page.getByTestId('gl-tenir-fouilles')).toHaveText('Touchez la carte · 2 fouilles');
    const plateau = page.getByTestId('gl-tenir-plateau');
    await expect(plateau).toHaveClass(/is-fouille/);
    await expect(equipe.getByRole('button', { name: 'Arrêter de fouiller' })).toBeVisible();
    await page.screenshot({ path: `${APRES}/tablette-fouille-1024x768.png` });
    // Un toucher sur le plateau : le serveur dit froid, tiède ou chaud — ou ouvre la question
    // de la page qui dort là. Dans les deux cas, une seule chose à l'écran.
    const zone = await plateau.boundingBox();
    await page.mouse.click(zone.x + zone.width * 0.12, zone.y + zone.height * 0.88);
    await expect(moment).toHaveAttribute('data-etat', /^(retour|question)$/, { timeout: 20_000 });
    if ((await moment.getAttribute('data-etat')) === 'retour') {
      await expect(page.getByTestId('gl-tenir-retour')).toBeVisible();
      await expect(page.getByTestId('gl-tenir-retour')).not.toContainText(INTERDITS);
      await page.screenshot({ path: `${APRES}/tablette-retour-1024x768.png` });
      await page.getByTestId('gl-tenir-continuer').click();
    } else {
      await page.getByRole('button', { name: 'Fermer' }).click();
    }
    await expect(moment).toHaveAttribute('data-etat', 'geste');
    await expect(plateau).not.toHaveClass(/is-fouille/);
    await expect(page.getByTestId('gl-tenir-puces').locator('[data-geste="fouiller"]')).toHaveText(
      'Fouiller · 1 fouille',
    );

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

    // La tablette suit seule : le geste « Jeter un sort » paraît, en puce sous le gros bouton.
    const sorts = page.getByTestId('gl-tenir-puces').locator('[data-geste="jeter"]');
    await expect(async () => {
      if (!(await sorts.isVisible())) await page.reload();
      await expect(sorts).toBeVisible({ timeout: 8_000 });
    }).toPass({ timeout: 30_000 });
    await expect(sorts).toHaveText('Jeter un sort');
    await expect(sorts).toHaveAttribute('title', 'Assistante ou Assistant');
    await page.screenshot({ path: 'docs/captures/tenir-v2/escalier-seance-3-equipe.png' });

    // --- Fin de séance : la projection accroche la suivante ----------------------------------
    await poster('/tenir/tour/phase', { phase: 'souffle', faces: [2] });
    // Pendant que le voile avance, la tablette ne propose plus rien : elle le dit.
    await etat('souffle');
    await expect(page.getByTestId('gl-tenir-moment-souffle')).toContainText('Le voile avance.');
    await expect(page.getByTestId('gl-tenir-phase')).toHaveText('Tour 1 — Le voile avance');
    await expect(equipe.locator('[data-geste]')).toHaveCount(0);
    await poster('/tenir/tour/phase', { phase: 'clos' });
    await etat('clos');
    await expect(page.getByTestId('gl-tenir-moment-clos')).toContainText('Le tour est terminé.');
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
    // Mode tableau : la carte remplace l'écran, rien ne défile.
    await expect(ecran.page.getByTestId('gl-projection')).toHaveAttribute('data-vue', 'carte');
    await expect(ecran.page.getByTestId('gl-projection-board')).toHaveCount(0);
    expect(
      await ecran.page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
    ).toBe(true);
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
