'use strict';

/**
 * Contrat de mise en page du bandeau de séance et de la barre basse élève sur téléphone
 * (sonde Playwright du 22/11/2026, PR #750 et suivante).
 *
 * Trois défauts fermés ici, tous invisibles au build et aux tests de rendu :
 * - le raccourci `padding:12px` de `.main` (< 1024 px) effaçait la réserve de la barre basse
 *   et celle du bandeau : le bas des pages passait dessous, même défilé à fond ;
 * - les surcouches plein écran ne réservaient que la hauteur du bandeau, pas son emprise
 *   (il surmonte la barre basse) ;
 * - en plein écran carte, le bandeau restait surélevé au-dessus d'une bande vide.
 *
 * Aucune base de données requise : ce sont des lectures de feuilles de style.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const read = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');
const compact = (s) => s.replace(/\s+/g, ' ');

test('téléphone : la page réserve la barre basse et le bandeau malgré le raccourci padding', () => {
  const css = compact(read('src/index.css'));
  assert.match(
    css,
    /\.main, \.teacher-main \{[^}]*padding:12px;[^}]*padding-bottom:calc\(12px \+ var\(--fm-session-banner-reserve, 0px\)\);/,
  );
  assert.match(
    css,
    /#app:has\(nav\.bottom-nav\) \.main:not\(\.teacher-main\) \{ padding-bottom:calc\(12px \+ var\(--fm-safe-bottom-nav\) \+ var\(--fm-session-banner-h, 0px\)\);/,
  );
  // Pied « Version » hors flux : il ne raccourcit plus `.main` sous la barre basse.
  assert.match(css, /#app:has\(nav\.bottom-nav\) \.app-footer \{ position:fixed;/);
});

test('les surcouches plein écran réservent l’emprise du bandeau, pas sa seule hauteur', () => {
  const files = [
    'src/shared/styles/modal-shell.css',
    'src/shared/styles/bottom-sheet.css',
    'src/shared/styles/map-fullscreen.css',
  ];
  for (const f of files) {
    assert.ok(read(f).includes('var(--fm-session-banner-reserve, 0px)'), f);
  }
});

test('plein écran carte : le bandeau descend au bas de l’écran (pas de bande vide)', () => {
  const css = compact(read('src/shared/styles/pedago-sessions.css'));
  assert.match(
    css,
    /:root:has\(#app nav\.bottom-nav\):has\(body\.fm-map-fullscreen-active\) \{ --fm-session-banner-lift: 0px; \}/,
  );
  assert.match(css, /\.pedago-session-banner \{[^}]*bottom: var\(--fm-session-banner-lift, 0px\);/);
});
