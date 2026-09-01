'use strict';

// C5 (audit stabilité/perf 2026-09) — le HTML des fiches servi par
// GET /api/tutorials/:id/view est ASSAINI côté serveur avant enrichissement : un script
// glissé dans une fiche importée ne s'exécute plus avec l'origine de l'application
// (jeton de session en localStorage). Arbitrage produit : option « assainissement
// serveur » retenue par le mainteneur.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { sanitizeTutorialViewHtml } = require('../lib/tutorialViewSanitize');
const { injectGlossaryAutolinkScript } = require('../lib/foretmapGlossaryAutolink');
const { injectTutorialViewIframeLinkScript } = require('../lib/tutorialRouteHelpers');

const HOSTILE_FICHE = `<!DOCTYPE html>
<html>
<head>
  <style>h1 { color: #2d6a4f; }</style>
  <script>fetch('/exfiltre?jeton=' + localStorage.getItem('token'));</script>
</head>
<body>
  <h1 onclick="alert(1)">La haie champêtre</h1>
  <p data-note="pédago">Un <b>texte</b> légitime.</p>
  <a href="javascript:alert(2)">piégé</a>
  <a href="https://exemple.org/fiche" target="_blank">source externe</a>
  <img src="haie.png" onerror="alert(3)" alt="haie">
  <form action="/api/auth/login" method="post"><input name="x"><button>go</button></form>
  <iframe src="https://mechant.example"></iframe>
</body>
</html>`;

test('sanitize : les vecteurs d’exécution disparaissent, le contenu légitime reste', () => {
  const out = sanitizeTutorialViewHtml(HOSTILE_FICHE);
  // Vecteurs retirés.
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /onclick|onerror/i);
  assert.doesNotMatch(out, /javascript:/i);
  assert.doesNotMatch(out, /<form|<input|<button/i);
  assert.doesNotMatch(out, /<iframe/i);
  // Contenu légitime conservé.
  assert.match(out, /<style>h1 \{ color: #2d6a4f; \}<\/style>/);
  assert.match(out, /<h1>La haie champêtre<\/h1>/);
  assert.match(out, /data-note="pédago"/);
  assert.match(out, /href="https:\/\/exemple\.org\/fiche" target="_blank"/);
  assert.match(out, /<img src="haie\.png" alt="haie">/);
  // Le doctype est restitué : la fiche garde son mode de rendu standards.
  assert.match(out, /^<!doctype html>/i);
});

test('sanitize : un fragment sans doctype ne s’en voit pas inventer un', () => {
  const out = sanitizeTutorialViewHtml('<p>fragment</p>');
  assert.doesNotMatch(out, /<!doctype/i);
  assert.match(out, /<p>fragment<\/p>/);
});

test('sanitize : entrées vides inchangées', () => {
  assert.strictEqual(sanitizeTutorialViewHtml(''), '');
  assert.strictEqual(sanitizeTutorialViewHtml(null), '');
  assert.strictEqual(sanitizeTutorialViewHtml('   '), '   ');
});

test('pipeline : seuls les scripts de l’application survivent dans la sortie servie', () => {
  // Même ordre que enrichTutorialHtmlWithGlossary (routes/tutorials.js) : assainir PUIS
  // injecter les scripts de l'application (liens iframe + relais glossaire).
  const served = injectGlossaryAutolinkScript(
    injectTutorialViewIframeLinkScript(sanitizeTutorialViewHtml(HOSTILE_FICHE)),
  );
  const scripts = served.match(/<script[\s\S]*?<\/script>/gi) || [];
  assert.strictEqual(scripts.length, 2, 'exactement les deux scripts de l’application');
  assert.ok(scripts.some((s) => s.includes('foretmap:glossary')));
  assert.doesNotMatch(served, /exfiltre|localStorage\.getItem/);
  assert.ok(served.trimEnd().endsWith('</script></body></html>'));
});

test('convention : la route assainit AVANT de poser les auto-liens', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'tutorials.js'), 'utf8');
  assert.match(
    source,
    /const safe = sanitizeTutorialViewHtml\(html\);\s*\n\s*const linked = autolinkHtmlTextNodes\(safe, entries\);/,
    'enrichTutorialHtmlWithGlossary doit assainir le HTML importé avant tout enrichissement',
  );
});

test('convention : un .html sous /tutos n’est jamais rendu brut sur notre origine', () => {
  // Le statique /tutos contournerait l'assainissement de /view : la garde redirige vers
  // la vue assainie quand la fiche existe, sinon force le téléchargement.
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const guardIndex = source.search(/\\.html\?\$\/i\.test\(cleanPath\)/);
  const staticIndex = source.indexOf("app.use('/tutos', express.static");
  assert.ok(guardIndex !== -1, 'la garde /tutos sur les .html doit exister');
  assert.ok(staticIndex !== -1, 'le statique /tutos doit exister');
  assert.ok(guardIndex < staticIndex, 'la garde doit précéder le statique');
  assert.match(source, /res\.redirect\(302, `\/api\/tutorials\/\$\{row\.id\}\/view`\)/);
  assert.match(source, /Content-Disposition', 'attachment'/);
});
