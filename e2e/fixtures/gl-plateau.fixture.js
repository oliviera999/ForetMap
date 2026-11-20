/**
 * Image de plateau de substitution pour les e2e de Gnomes & Licornes.
 *
 * Les jeux d'essai n'ont pas d'image de plateau : le jeu se replie sur `public/maps/map-foret.svg`,
 * que Chromium n'affiche pas (SVG mal formé). Les specs qui regardent le plateau — mesures,
 * captures — servent donc ce fond à sa place, sans toucher à l'API ni aux données.
 */

/** Fond 16:10, sans texte : un sol, une rivière, des sous-bois. */
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

/** À appeler avant `page.goto` : le plateau de repli devient une image lisible. */
async function servirPlateau(page) {
  await page.route('**/maps/map-foret.svg', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: PLATEAU_SVG }),
  );
}

module.exports = { PLATEAU_SVG, servirPlateau };
