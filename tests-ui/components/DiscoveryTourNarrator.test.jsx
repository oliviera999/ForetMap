// Lot 3 — portrait du narrateur dans la visite guidée.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { DiscoveryTour } from '../../src/components/DiscoveryTour';
import { DISCOVERY_TOURS, resolveDiscoveryExpression } from '../../src/constants/discoveryTour';
import { MASCOT_EXPRESSIONS } from '../../src/utils/mascotExpressions';

function portrait() {
  return document.querySelector('.discovery-tour__portrait');
}

function makeActive(step) {
  return { tab: 'map', index: 0, steps: [{ target: null, placement: 'center', ...step }] };
}

/** Force la media query compacte (le setup global renvoie `matches: false`). */
function matchCompactViewport(compact) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: compact && query.includes('480px'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

describe('DiscoveryTour — narrateur', () => {
  afterEach(() => {
    cleanup();
    matchCompactViewport(false);
  });

  it('rend le portrait, décoratif, à côté de la bulle', () => {
    render(<DiscoveryTour active={makeActive({ title: 'T', body: 'Corps' })} />);
    const speaker = portrait();
    expect(speaker).not.toBeNull();
    expect(speaker).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelector('.discovery-tour__scene .discovery-tour__bubble')).not.toBeNull();
  });

  it('transmet l’expression de l’étape', () => {
    render(
      <DiscoveryTour active={makeActive({ title: 'T', body: 'Corps', expression: 'montre' })} />,
    );
    expect(portrait()).toHaveAttribute('data-expression', 'montre');
  });

  it('retombe sur « neutre » pour une expression absente ou inconnue', () => {
    render(<DiscoveryTour active={makeActive({ title: 'T', body: 'Corps', expression: 'zzz' })} />);
    expect(portrait()).toHaveAttribute('data-expression', 'neutre');
  });

  it('affiche l’image du réglage quand elle existe, la silhouette sinon', () => {
    const narrator = {
      enabled: true,
      speakerName: 'OLU',
      fallbackSilhouette: 'olu',
      portraits: { neutre: { bust: '/uploads/olu.webp' } },
    };
    render(<DiscoveryTour active={makeActive({ title: 'T', body: 'C' })} narrator={narrator} />);
    expect(portrait()).toHaveAttribute('data-source', 'portrait');

    cleanup();
    render(<DiscoveryTour active={makeActive({ title: 'T', body: 'C' })} />);
    expect(portrait()).toHaveAttribute('data-source', 'svg');
  });

  it('l’interrupteur global retire le portrait sans toucher au texte', () => {
    render(
      <DiscoveryTour
        active={makeActive({ title: 'T', body: 'Corps' })}
        narrator={{ enabled: false, speakerName: 'OLU', portraits: {} }}
      />,
    );
    expect(portrait()).toBeNull();
    expect(document.querySelector('.discovery-tour__bubble')).toHaveTextContent('Corps');
  });

  it('passe en médaillon sous 480 px et garde la carte étroite (§9.3)', () => {
    matchCompactViewport(true);
    render(<DiscoveryTour active={makeActive({ title: 'T', body: 'C' })} />);
    expect(portrait()).toHaveAttribute('data-framing', 'face');
    expect(document.querySelector('.discovery-tour__scene')).toHaveClass('is-compact');
  });
});

describe('DISCOVERY_TOURS — expressions déclarées', () => {
  it('n’emploie que des expressions canoniques', () => {
    for (const [key, tour] of Object.entries(DISCOVERY_TOURS)) {
      for (const step of tour.steps) {
        if (step.expression === undefined) continue;
        expect(MASCOT_EXPRESSIONS, `parcours ${key}`).toContain(step.expression);
      }
    }
  });

  it('resolveDiscoveryExpression neutralise l’absence et l’inconnu', () => {
    expect(resolveDiscoveryExpression(undefined)).toBe('neutre');
    expect(resolveDiscoveryExpression({})).toBe('neutre');
    expect(resolveDiscoveryExpression({ expression: 'inconnue' })).toBe('neutre');
    expect(resolveDiscoveryExpression({ expression: 'complice' })).toBe('complice');
  });
});
