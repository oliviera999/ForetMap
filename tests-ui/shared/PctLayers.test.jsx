import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { PctImageLayer } from '../../src/shared/pct-map/PctImageLayer.jsx';
import { PctMarkersLayer } from '../../src/shared/pct-map/PctMarkersLayer.jsx';
import { PctLabelsLayer } from '../../src/shared/pct-map/PctLabelsLayer.jsx';
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

  test('zone atteignable au clavier et annoncée (audit C4)', () => {
    const onZoneClick = vi.fn();
    render(<PctZonesLayer zones={ZONES} onZoneClick={onZoneClick} />);
    const zone = screen.getByRole('button', { name: 'Verger' });
    expect(zone.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(zone, { key: 'Enter' });
    fireEvent.keyDown(zone, { key: ' ' });
    fireEvent.keyDown(zone, { key: 'a' });
    expect(onZoneClick).toHaveBeenCalledTimes(2);
  });

  test('emoji de tête retiré du nom dessiné (audit B3)', () => {
    render(
      <PctZonesLayer
        zones={[{ ...ZONES[0], name: '🍏 Verger', emoji: '🍏' }]}
        onZoneClick={() => {}}
      />,
    );
    // Une seule occurrence de l'emoji, et le nom sans son préfixe.
    expect(screen.getAllByText('🍏')).toHaveLength(1);
    expect(screen.getByText('Verger')).toBeTruthy();
  });

  test('sans handler de clic : ni rôle ni tabulation (calque décoratif)', () => {
    const { container } = render(<PctZonesLayer zones={ZONES} onZoneClick={null} />);
    const group = container.querySelector('.fm-pct-zone');
    expect(group.getAttribute('role')).toBe(null);
    expect(group.getAttribute('tabindex')).toBe(null);
  });
});

describe('PctLabelsLayer', () => {
  test('étiquette posée en % avec sa largeur maximale, calque non cliquable', () => {
    const { container } = render(
      <PctLabelsLayer
        labels={[{ id: 'zone:z1', xp: 30, yp: 40, emoji: '📚', name: 'CDI', maxWidthPx: 56 }]}
      />,
    );
    const label = container.querySelector('.fm-pct-label');
    expect(label.style.left).toBe('30%');
    expect(label.style.top).toBe('40%');
    expect(label.style.maxWidth).toBe('56px');
    expect(screen.getByText('CDI')).toBeTruthy();
    // Le nom accessible est porté par le polygone, pas par ce calque décoratif.
    expect(container.querySelector('.fm-pct-labels').getAttribute('aria-hidden')).toBe('true');
  });

  test('nom masqué par la résolution de collisions : l’emoji reste, le nom disparaît', () => {
    const { container } = render(
      <PctLabelsLayer labels={[{ id: 'zone:z1', xp: 10, yp: 10, emoji: '📚', name: '' }]} />,
    );
    expect(container.querySelector('.fm-pct-label__emoji')).toBeTruthy();
    expect(container.querySelector('.fm-pct-label__name')).toBe(null);
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
