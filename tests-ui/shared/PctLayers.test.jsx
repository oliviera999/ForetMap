import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { PctImageLayer } from '../../src/shared/pct-map/PctImageLayer.jsx';
import { PctMarkersLayer } from '../../src/shared/pct-map/PctMarkersLayer.jsx';
import { PctZonesLayer } from '../../src/shared/pct-map/PctZonesLayer.jsx';

const ZONES = [
  {
    id: 'z1',
    name: 'Verger',
    emoji: '🍏',
    color: '#abcdef',
    points: '[{"xp":0,"yp":0},{"xp":20,"yp":0},{"xp":20,"yp":20}]',
  },
  { id: 'z2', name: 'Trop peu de points', points: '[{"xp":0,"yp":0}]' },
  { id: 'z3', name: 'Points illisibles', points: 'pas du json' },
];

describe('PctImageLayer', () => {
  test('image non déplaçable avec texte alternatif et repli d’erreur', () => {
    const onError = vi.fn();
    render(<PctImageLayer src="/plan.jpg" alt="Plan test" onError={onError} />);
    const img = screen.getByAltText('Plan test');
    expect(img.getAttribute('src')).toBe('/plan.jpg');
    expect(img.draggable).toBe(false);
    fireEvent.error(img);
    expect(onError).toHaveBeenCalled();
  });
});

describe('PctZonesLayer', () => {
  test('trace un polygone par zone valide, ignore les géométries inexploitables', () => {
    const { container } = render(<PctZonesLayer zones={ZONES} onZoneClick={() => {}} />);
    const polygons = container.querySelectorAll('polygon');
    expect(polygons).toHaveLength(1);
    expect(polygons[0].getAttribute('points')).toBe('0,0 20,0 20,20');
    expect(container.querySelector('svg').getAttribute('viewBox')).toBe('0 0 100 100');
    expect(screen.getByText('Verger')).toBeTruthy();
    expect(screen.getByText('🍏')).toBeTruthy();
  });

  test('clic : renvoie la zone ; zone active marquée', () => {
    const onZoneClick = vi.fn();
    const { container } = render(
      <PctZonesLayer zones={ZONES} onZoneClick={onZoneClick} activeZoneId="z1" />,
    );
    const group = container.querySelector('.fm-pct-zone');
    expect(group.classList.contains('is-active')).toBe(true);
    fireEvent.click(group);
    expect(onZoneClick.mock.calls[0][0].id).toBe('z1');
  });

  test('showLabels=false : polygone sans emoji ni nom', () => {
    const { container } = render(
      <PctZonesLayer zones={ZONES} onZoneClick={() => {}} showLabels={false} />,
    );
    expect(container.querySelectorAll('text')).toHaveLength(0);
  });
});

describe('PctMarkersLayer', () => {
  const MARKERS = [
    { id: 'm1', label: 'Infirmerie', emoji: '🏥', x_pct: 40, y_pct: 60 },
    { id: 'm2', label: '', x_pct: 10, y_pct: 20 },
  ];

  test('positionne chaque repère en pourcentage et nomme le bouton', () => {
    render(<PctMarkersLayer markers={MARKERS} onMarkerClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'Infirmerie' });
    expect(button.style.left).toBe('40%');
    expect(button.style.top).toBe('60%');
    expect(screen.getByRole('button', { name: 'Lieu' })).toBeTruthy();
    expect(screen.getByText('📍')).toBeTruthy();
  });

  test('clic : renvoie le repère ; repère actif marqué', () => {
    const onMarkerClick = vi.fn();
    render(<PctMarkersLayer markers={MARKERS} onMarkerClick={onMarkerClick} activeMarkerId="m1" />);
    const button = screen.getByRole('button', { name: 'Infirmerie' });
    expect(button.classList.contains('is-active')).toBe(true);
    fireEvent.click(button);
    expect(onMarkerClick.mock.calls[0][0].id).toBe('m1');
  });

  test('liste vide ou absente → rien', () => {
    const { container } = render(<PctMarkersLayer markers={null} onMarkerClick={() => {}} />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});
