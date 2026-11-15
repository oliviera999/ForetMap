import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { GLCarnetClasseView } from '../../src/gl/components/tenir/GLCarnetClasseView.jsx';
import zonesFile from '../../data/gl/tenir/chasse-zones.json';

/**
 * Indices scientifiques des zones de chasse (14 novembre 2026) : des énigmes de près de cent
 * caractères. Dans le carnet de la classe, l'indice s'affiche en entier — ni coupé dans le
 * composant, ni tronqué par la feuille de style.
 */
const zones = zonesFile.zones;
const plusLong = [...zones].sort((a, b) => b.indice.length - a.indice.length)[0];

function chasseAvec(pages) {
  return {
    carnet: { total: pages.length, tenues: 0, trouvees: 0, pages },
    page: null,
    busy: false,
    ouvrir: vi.fn(),
    closePage: vi.fn(),
  };
}

describe('carnet de la classe : indice en entier', () => {
  test('les 36 indices tiennent dans la limite de l’import et le plus long s’affiche tel quel', () => {
    expect(zones).toHaveLength(36);
    for (const z of zones) expect(z.indice.length).toBeLessThanOrEqual(99);
    const pages = zones.slice(0, 8).map((z) => ({
      zoneKey: z.zone_key,
      indice: z.indice,
      etat: 'endormie',
      palissementPct: 0,
    }));
    pages.push({ zoneKey: plusLong.zone_key, indice: plusLong.indice, etat: 'endormie' });
    render(<GLCarnetClasseView chasse={chasseAvec(pages)} teamId={2} />);
    expect(screen.getAllByText(plusLong.indice).length).toBeGreaterThan(0);
    for (const p of pages) expect(screen.getAllByText(p.indice).length).toBeGreaterThan(0);
  });

  test('page trouvée : le titre, puis l’indice entier', () => {
    const page = {
      zoneKey: 'z',
      titre: 'La page du calao',
      indice: plusLong.indice,
      etat: 'trouvee',
    };
    const { container } = render(<GLCarnetClasseView chasse={chasseAvec([page])} teamId={2} />);
    expect(container.textContent).toContain(plusLong.indice);
  });

  test('aucune troncature dans les styles du carnet (ni points de suspension, ni lignes limitées)', () => {
    const css = readFileSync('src/gl/styles/gl-tenir.css', 'utf8');
    const blocs =
      css.match(/\.gl-(?:carnet-page|carnet-classe|projection__carnet)[^{]*\{[^}]*\}/g) || [];
    expect(blocs.length).toBeGreaterThan(3);
    for (const bloc of blocs) {
      expect(bloc).not.toMatch(/text-overflow|line-clamp|white-space:\s*nowrap/);
    }
  });
});
