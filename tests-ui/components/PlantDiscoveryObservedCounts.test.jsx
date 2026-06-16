import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PlantDiscoveryObservedCounts } from '../../src/components/PlantDiscoveryObservedCounts.jsx';

describe('PlantDiscoveryObservedCounts', () => {
  test('affiche les compteurs de l’utilisateur et du site', () => {
    render(<PlantDiscoveryObservedCounts my={3} site={12} />);
    expect(screen.getByText('Mes observations : 3')).toBeTruthy();
    expect(screen.getByText('Tout le site : 12')).toBeTruthy();
  });

  test('expose une région live pour l’accessibilité', () => {
    const { container } = render(<PlantDiscoveryObservedCounts my={0} site={0} />);
    const wrap = container.querySelector('.plant-discovery-observed-counts');
    expect(wrap).toBeTruthy();
    expect(wrap.getAttribute('aria-live')).toBe('polite');
  });
});
