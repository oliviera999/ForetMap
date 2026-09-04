import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

/**
 * Cliquet du kit d'interface (lot 3) : les feuilles de tokens communes sont chargées par les
 * DEUX entrées, G&L n'en redéclare pas la valeur (alias `var(--…)` seulement) et les blocs
 * dédoublonnés (bannière aperçu rôle, panneau de modale) ne reviennent pas côté produit.
 */
describe('tokens et feuilles partagées', () => {
  const sheets = [
    'spacing-tokens.css',
    'state-inks.css',
    'role-preview-banner.css',
    'map-action.css',
    'data-list.css',
  ];

  test('chaque feuille commune est importée par index.css et gl/main.jsx', () => {
    const indexCss = read('src/index.css');
    const glMain = read('src/gl/main.jsx');
    for (const sheet of sheets) {
      expect(indexCss, sheet).toContain(`@import './shared/styles/${sheet}'`);
      expect(glMain, sheet).toContain(`import '../shared/styles/${sheet}'`);
    }
  });

  test('G&L aliasse les tokens communs sans en redéclarer la valeur', () => {
    const glTheme = read('src/gl/styles/gl-theme.css');
    for (let i = 1; i <= 6; i += 1) {
      expect(glTheme).toContain(`--gl-space-${i}: var(--space-${i});`);
    }
    expect(glTheme).toContain('--gl-tap-target: var(--tap-target);');
    for (const k of ['info', 'success', 'warning', 'danger']) {
      expect(glTheme).toContain(`--gl-ink-${k}: var(--ink-${k});`);
      expect(glTheme).toContain(`--gl-accent-${k}: var(--accent-${k});`);
    }
    const spacing = read('src/shared/styles/spacing-tokens.css');
    expect(spacing).toMatch(/--space-1: 4px;/);
    expect(spacing).toMatch(/--tap-target: 44px;/);
  });

  test('bannière aperçu rôle et panneau de modale : une seule définition', () => {
    const indexCss = read('src/index.css');
    const glBase = read('src/gl/styles/gl-base.css');
    expect(indexCss).not.toMatch(/\.role-preview-banner\s*\{/);
    expect(glBase).not.toMatch(/\.role-preview-banner\s*\{/);
    expect(read('src/shared/styles/role-preview-banner.css')).toMatch(/\.role-preview-banner\s*\{/);
    // `.modal` / `.log-modal` sont des alias du panneau partagé : plus de copie du bloc.
    expect(indexCss).not.toMatch(/\.log-modal \{\n\s*position:relative;/);
    expect(read('src/shared/styles/modal-shell.css')).toMatch(
      /\.fm-modal-panel,\n\.modal,\n\.log-modal \{/,
    );
  });
});
