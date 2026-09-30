import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, test, expect } from 'vitest';

/**
 * Garde-fous de style du plan des personnels (recette stafflyautey du 30/09/2026).
 *
 * 1. La barre haute est **brune**.
 * La teinte `--plan-brand-accent` était déclarée sur `.staff-plan-body` mais seuls les encadrés
 * réservés s'en servaient : `.plan-topbar` restait bleu marine, comme sur le plan public. Or la
 * documentation (`docs/reference/plan/plan-des-personnels.md`) fait de cette couleur le repère
 * pour savoir laquelle des deux cartes on montre — celle d'un parent, ou celle des consignes.
 *
 * 2. Le complément réservé reste dans son encadré, même avec un lien long sans espace.
 */
const css = readFileSync(resolve(process.cwd(), 'src/staff/styles/staff-plan.css'), 'utf8');

describe('staff-plan.css — teinte et encadrés', () => {
  test('la barre haute du plan des personnels prend la teinte brune', () => {
    const rule = css.match(/\.staff-plan-body\s+\.plan-topbar\s*\{([^}]*)\}/);
    expect(rule, 'aucune règle `.staff-plan-body .plan-topbar`').toBeTruthy();
    expect(rule[1]).toMatch(/background:\s*var\(--plan-brand-accent/);
  });

  test('la teinte ne passe pas par le réglage d’identité partagé avec le plan public', () => {
    expect(css).not.toMatch(/--plan-brand-color-topbar\s*:/);
  });

  test('le complément réservé coupe une chaîne sans espace plutôt que de déborder', () => {
    const rule = css.match(/\.plan-place__restricted-text\s*\{([^}]*)\}/);
    expect(rule).toBeTruthy();
    expect(rule[1]).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
