const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

/**
 * Régression : les popovers/modales GL (QCM, « J'ai appris », feuillets…) sont
 * rendues via createPortal(document.body), donc HORS de `.gl-app`. Les variables
 * de thème GL doivent être déclarées sur `body.gl-body` (ancêtre commun du
 * `.gl-app` et des portails) — sinon `background: var(--gl-color-primary)` sans
 * fallback retombe sur `transparent` et les boutons primaires deviennent
 * invisibles (texte blanc sur fond transparent).
 */
test('gl-theme.css : les variables de palette sont déclarées sur body.gl-body (portails visibles)', () => {
  const css = readFileSync(join(__dirname, '../src/gl/styles/gl-theme.css'), 'utf8');
  const bodyBlockMatch = css.match(/body\.gl-body\s*\{([\s\S]*?)\}/);
  assert.ok(bodyBlockMatch, 'bloc body.gl-body introuvable');
  const bodyBlock = bodyBlockMatch[1];
  for (const varName of [
    '--gl-color-primary',
    '--gl-color-secondary',
    '--gl-border',
    '--gl-accent-danger',
    '--gl-surface',
  ]) {
    assert.match(
      bodyBlock,
      new RegExp(`${varName}\\s*:`),
      `${varName} doit être déclarée sur body.gl-body pour les portails hors .gl-app`,
    );
  }
});
