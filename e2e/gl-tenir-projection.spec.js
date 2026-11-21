const { test, expect } = require('@playwright/test');
const db = require('../database');
const { createTenirGame, importExempleChasse } = require('../tests/helpers/glTenirFixtures');

// Chantier « écrans de séance », étape 3 — la projection en mode tableau, à 1920×1080.
// Une grille plein écran lue du fond de la salle : bandeau, plateau, équipes en pastilles,
// carnet en pages, trois faits marquants. Rien ne défile, rien ne se touche pendant le jeu.
// À la clôture du tour, la carte « À la prochaine séance » remplace l'écran.
// Captures : docs/captures/ecrans-de-seance/apres/projection-*.png.

const TABLEAU = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 };
const GL = { 'X-Foretmap-Product': 'gl' };
const INTERDITS = /faux|raté|perdu|monstre|ennemi|attaque|poursui|classement|krâ|kraa/i;
const CAPTURES = 'docs/captures/ecrans-de-seance/apres';
/** Fond de plateau de substitution (16:10), sans texte : un sol, une rivière, des sous-bois. */
const PLATEAU_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
  <rect width="1600" height="1000" fill="#e3f0dc"/>
  <path d="M0 640 C 300 560 520 760 820 660 S 1320 520 1600 620 V1000 H0 Z" fill="#cfe5c4"/>
  <path d="M0 520 C 260 470 420 600 700 540 S 1240 400 1600 470" fill="none" stroke="#a9d3e6" stroke-width="46" stroke-linecap="round"/>
  <g fill="#9cc58f">
    <circle cx="210" cy="820" r="70"/><circle cx="330" cy="860" r="54"/>
    <circle cx="1240" cy="800" r="76"/><circle cx="1370" cy="850" r="58"/>
    <circle cx="760" cy="880" r="62"/><circle cx="1490" cy="250" r="64"/>
    <circle cx="130" cy="220" r="58"/>
  </g>
</svg>`;

/** Mesures de l'écran : la page ne défile pas, et rien n'est coupé dans la colonne de droite. */
async function mesures(page) {
  return page.evaluate(() => {
    const racine = document.documentElement;
    const boite = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, bas: r.bottom, droite: r.right };
    };
    const cote = document.querySelector('.gl-projection__cote');
    return {
      vue: { w: window.innerWidth, h: window.innerHeight },
      page: { w: racine.scrollWidth, h: racine.scrollHeight },
      projection: boite('.gl-projection'),
      plateau: boite('.gl-projection__board'),
      image: boite('.gl-projection__board .gl-board'),
      cote: boite('.gl-projection__cote'),
      faits: boite('.gl-projection__faits'),
      carte: boite('.gl-projection__carte'),
      coteCoupe: cote ? cote.scrollHeight - cote.clientHeight : null,
      corps: parseFloat(getComputedStyle(document.querySelector('.gl-projection')).fontSize),
      titre: parseFloat(getComputedStyle(document.querySelector('.gl-projection h1')).fontSize),
    };
  });
}

function sansDefilement(m) {
  expect(m.page.h, 'pas de barre de défilement verticale').toBeLessThanOrEqual(m.vue.h);
  expect(m.page.w, 'pas de barre de défilement horizontale').toBeLessThanOrEqual(m.vue.w);
  expect(Math.round(m.projection.h)).toBe(m.vue.h);
}

test.describe('GL — projection, mode tableau', () => {
  test('1920×1080 : rien ne défile ; à la clôture, « À la prochaine séance » remplace l’écran', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const ctx = await createTenirGame({ stamp: Date.now(), plateau: 1, playerCount: 8 });
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
    const profil = await request.put(api('/tenir/profil'), {
      headers: prof,
      data: { profil: 'complet', overrides: { surface: 'tablette', des_mode: 'serveur' } },
    });
    expect(profil.ok(), await profil.text()).toBeTruthy();

    // --- Un tour en jeu : chaque équipe a avancé d'un nombre de cases différent --------------
    await poster('/tenir/tour/ouvrir');
    await poster('/tenir/tour/phase', { phase: 'jeu' });
    for (const [i, equipe] of ctx.teams.entries()) {
      await poster('/tenir/lancer', {
        mode: 'libre',
        teamId: equipe.id,
        cases: 2 + i * 2,
        motif: 'projection (e2e)',
      });
    }

    // --- La projection, au tableau ------------------------------------------------------------
    const jeton = await poster('/projection-token');
    const context = await browser.newContext(TABLEAU);
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.setExtraHTTPHeaders(GL);
    // Le plateau d'exemple n'a pas d'image, et l'image de repli du dépôt ne s'affiche pas
    // (SVG mal formé) : on en sert une, en 16:10, pour que la capture et la mesure du plateau
    // ressemblent à une vraie séance. Aucune réponse de l'API n'est touchée.
    await page.route('**/maps/map-foret.svg', (route) =>
      route.fulfill({ contentType: 'image/svg+xml', body: PLATEAU_SVG }),
    );
    await page.goto(jeton.url || `/?projection=${encodeURIComponent(jeton.token)}`);
    const projection = page.getByTestId('gl-projection');
    await expect(projection).toBeVisible({ timeout: 30_000 });
    await expect(projection).toHaveAttribute('data-vue', 'plateau');
    await expect(page.getByTestId('gl-projection-tour')).toContainText('Tour 1 — À vous de jouer');
    // Le plateau, en scène épurée : son image est là, sans aucun bouton.
    const plateau = page.getByTestId('gl-projection-board');
    await expect(plateau.locator('[data-presentation="projection"]')).toBeVisible();
    await expect(plateau.locator('.gl-board-fit-layer img').first()).toBeVisible();
    // Une pastille par équipe, avec sa mascotte et sa case.
    const pastilles = page.locator('.gl-projection__team');
    await expect(pastilles).toHaveCount(ctx.teams.length);
    for (const [i, equipe] of ctx.teams.entries()) {
      const pastille = page.locator('.gl-projection__team', { hasText: equipe.name });
      await expect(pastille).toContainText(`case ${3 + i * 2}`);
      await expect(pastille.locator('.gl-mascot-avatar')).toBeVisible();
    }
    // Le carnet de la classe en pages : des états en mots, jamais un indice.
    const pages = page.locator('.gl-projection__page');
    expect(await pages.count()).toBeGreaterThan(0);
    await expect(pages.first()).toContainText('dort encore');
    await expect(page.getByTestId('gl-projection-carnet')).not.toContainText('Là où');
    // Rien à toucher pendant le jeu : les cases du plateau elles-mêmes ne sont plus des boutons.
    await expect(projection.locator('button')).toHaveCount(0);
    expect(await plateau.locator('.gl-board-marker--statique').count()).toBeGreaterThan(0);
    await expect(projection).not.toContainText(INTERDITS);

    const jeu = await mesures(page);
    sansDefilement(jeu);
    // Corps de texte lisible du fond de la salle, titres au double.
    expect(jeu.corps).toBeGreaterThanOrEqual(20);
    expect(jeu.corps).toBeLessThanOrEqual(32);
    expect(jeu.titre).toBeCloseTo(jeu.corps * 2, 0);
    // Le plateau à gauche, sur environ 70 % de la largeur ; la colonne à droite, sans coupe.
    expect(jeu.plateau.x).toBeLessThan(40);
    expect(jeu.plateau.w / jeu.vue.w).toBeGreaterThan(0.62);
    expect(jeu.plateau.w / jeu.vue.w).toBeLessThan(0.72);
    expect(jeu.image.h).toBeGreaterThan(jeu.vue.h * 0.55);
    expect(jeu.cote.x).toBeGreaterThan(jeu.plateau.droite - 1);
    expect(jeu.coteCoupe, 'la colonne de droite tient sans défiler').toBeLessThanOrEqual(1);
    expect(jeu.faits.bas).toBeLessThanOrEqual(jeu.vue.h);
    await page.screenshot({ path: `${CAPTURES}/projection-1920x1080.png` });

    // --- Le souffle : le voile avance, cerné d'un contour ; le fait marquant paraît en bas ----
    await poster('/tenir/tour/phase', { phase: 'souffle', faces: [2] });
    await expect(page.getByTestId('gl-projection-tour')).toContainText('Tour 1 — Le voile avance', {
      timeout: 15_000,
    });
    const voile = plateau.getByTestId('gl-voile-layer');
    await expect(voile).toBeVisible({ timeout: 15_000 });
    await expect(voile).toHaveClass(/gl-voile-layer--projection/);
    await expect(voile.locator('.gl-voile-contour')).toHaveCount(1);
    const faits = page.getByTestId('gl-projection-faits');
    await expect(faits).toContainText('Le voile avance', { timeout: 15_000 });
    expect(await faits.locator('li').count()).toBeLessThanOrEqual(3);
    // Ni jet ni réglage dans les faits marquants.
    await expect(faits).not.toContainText('Jet de dés');
    sansDefilement(await mesures(page));
    await page.screenshot({ path: `${CAPTURES}/projection-souffle-1920x1080.png` });

    // --- La clôture : la carte « À la prochaine séance » remplace l'écran ---------------------
    await poster('/tenir/tour/phase', { phase: 'clos' });
    const accroche = page.getByTestId('gl-projection-accroche');
    await expect(accroche).toBeVisible({ timeout: 15_000 });
    await expect(projection).toHaveAttribute('data-vue', 'carte');
    await expect(accroche.getByRole('heading', { level: 2 })).toHaveText('À la prochaine séance');
    await expect(page.getByTestId('gl-projection-accroche-indice')).toContainText(
      'Une page dort encore',
    );
    await expect(plateau).toHaveCount(0);
    await expect(page.getByTestId('gl-projection-cote')).toHaveCount(0);
    const fin = await mesures(page);
    sansDefilement(fin);
    // Plein écran : la carte prend toute la largeur, sous le bandeau, jusqu'en bas.
    expect(fin.carte.w / fin.vue.w).toBeGreaterThan(0.95);
    expect(fin.carte.bas).toBeGreaterThan(fin.vue.h - 40);
    await page.screenshot({ path: `${CAPTURES}/projection-accroche-1920x1080.png` });

    // « Voir le plateau » ramène au plateau ; le bandeau rouvre la carte.
    await page.getByRole('button', { name: 'Voir le plateau' }).click();
    await expect(plateau).toBeVisible();
    await expect(accroche).toHaveCount(0);
    sansDefilement(await mesures(page));
    await page.getByRole('button', { name: 'À la prochaine séance' }).click();
    await expect(accroche).toBeVisible();

    await context.close();
  });
});
