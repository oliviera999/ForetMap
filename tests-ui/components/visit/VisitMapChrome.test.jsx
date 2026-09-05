import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { VisitMapChrome } from '../../../src/components/visit/VisitMapChrome.jsx';

function setup(overrides = {}) {
  const props = {
    title: '🧭 Visite de la carte',
    onOpenPresentation: vi.fn(),
    onToggleImmersion: vi.fn(),
    onCycleMapTextSize: vi.fn(),
    onChangeVisitMascotId: vi.fn(),
    onSelectMapId: vi.fn(),
    maps: [],
    mapId: 'foret',
    ...overrides,
  };
  const utils = render(<VisitMapChrome {...props} />);
  return { ...utils, props };
}

describe('VisitMapChrome', () => {
  test('un rechargement affiche une pastille discrète au lieu de masquer la carte', () => {
    setup({ refreshing: true });
    const pill = screen.getByTestId('visit-refresh-pill');
    expect(pill).toHaveTextContent('Actualisation');
    expect(pill).toHaveAttribute('role', 'status');
  });

  test('hors rechargement, aucune pastille', () => {
    setup();
    expect(screen.queryByTestId('visit-refresh-pill')).toBeNull();
  });

  test('le bouton taille de texte reprend son libellé visible dans son nom accessible', () => {
    setup({ mapTextSizeLabel: 'A+' });
    const btn = screen.getByTestId('visit-map-text-size');
    expect(btn).toHaveTextContent('A+');
    // WCAG 2.5.3 « Label in Name » : le nom accessible doit contenir le texte visible.
    expect(btn.getAttribute('aria-label')).toContain('A+');
  });
});
