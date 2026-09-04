import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';

import { GLAppVersionBadge } from '../../src/gl/components/GLAppVersionBadge.jsx';

/**
 * Garde-fou : la pastille G&L réutilise `.app-version-badge`, qui n'était défini que
 * dans `src/index.css` (jamais chargé par le point d'entrée G&L). Le style vit
 * désormais dans une feuille partagée importée par le composant lui-même.
 */
const SHARED_SHEET = 'src/shared/styles/version-badge.css';
const css = readFileSync(resolve(process.cwd(), SHARED_SHEET), 'utf8');
const componentSource = readFileSync(
  resolve(process.cwd(), 'src/gl/components/GLAppVersionBadge.jsx'),
  'utf8',
);

describe('GLAppVersionBadge', () => {
  test('rend la classe partagée et la version', () => {
    render(<GLAppVersionBadge appVersion="3.4.5" />);
    const badge = screen.getByLabelText('Version 3.4.5');
    expect(badge).toHaveClass('app-version-badge');
    expect(badge).toHaveClass('gl-app-version-badge');
    expect(badge.querySelector('.app-version-badge__version')).toHaveTextContent('v3.4.5');
  });

  test('affiche un signe d’attente tant que la version est inconnue', () => {
    render(<GLAppVersionBadge appVersion={null} />);
    expect(screen.getByLabelText('Version …')).toHaveTextContent('v…');
  });

  test('la feuille partagée définit le sélecteur et est importée par le composant', () => {
    expect(css).toMatch(/\.app-version-badge\s*\{/);
    expect(css).toMatch(/\.app-version-badge__version\s*\{/);
    expect(componentSource).toMatch(/import\s+'\.\.\/\.\.\/shared\/styles\/version-badge\.css'/);
  });
});
