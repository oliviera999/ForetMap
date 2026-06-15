import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { VisitMapMascot } from '../../src/components/VisitMapMascot.jsx';

function renderMascot(overrides = {}) {
  const props = {
    renderPct: { xp: 30, yp: 70 },
    walking: false,
    happy: false,
    prefersReducedMotion: false,
    faceRight: true,
    mascotState: 'idle',
    mascotId: '',
    extraCatalogEntries: [],
    dialogVisible: false,
    dialog: '',
    ...overrides,
  };
  return render(<VisitMapMascot {...props} />);
}

describe('VisitMapMascot', () => {
  test('positionne la mascotte en % sans classes d’état par défaut', () => {
    const { container } = renderMascot();
    const root = container.querySelector('.visit-map-mascot');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.style.left).toBe('30%');
    expect(root.style.top).toBe('70%');
    expect(root.className).toBe('visit-map-mascot');
  });

  test('applique les classes d’état marche / contente / mouvement réduit', () => {
    const { container } = renderMascot({
      walking: true,
      happy: true,
      prefersReducedMotion: true,
    });
    const root = container.querySelector('.visit-map-mascot');
    expect(root).toHaveClass('visit-map-mascot--walking');
    expect(root).toHaveClass('visit-map-mascot--happy');
    expect(root).toHaveClass('visit-map-mascot--reduced-motion');
  });

  test('oriente vers la gauche quand faceRight est faux', () => {
    const { container } = renderMascot({ faceRight: false });
    const inner = container.querySelector('.visit-map-mascot-inner');
    expect(inner.style.transform).toBe('translate(-50%, -100%) scaleX(-1)');
  });

  test('affiche la bulle de dialogue quand visible et non vide', () => {
    const { container } = renderMascot({ dialogVisible: true, dialog: 'Bonjour !' });
    const bubble = container.querySelector('.visit-map-mascot-dialog');
    expect(bubble).toBeInTheDocument();
    expect(bubble).toHaveAttribute('role', 'status');
    expect(bubble).toHaveAttribute('aria-live', 'polite');
    expect(bubble).toHaveTextContent('Bonjour !');
  });

  test('masque la bulle quand dialogVisible est faux', () => {
    const { container } = renderMascot({ dialogVisible: false, dialog: 'Caché' });
    expect(container.querySelector('.visit-map-mascot-dialog')).not.toBeInTheDocument();
  });
});
