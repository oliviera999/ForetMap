import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';

import {
  PctStatusDots,
  PctStatusDotsLayer,
  statusDotsLabel,
} from '../../../src/shared/pct-map/PctStatusDotsLayer.jsx';
import { PctMarkersLayer } from '../../../src/shared/pct-map/PctMarkersLayer.jsx';
import { PctZonesLayer } from '../../../src/shared/pct-map/PctZonesLayer.jsx';
import { PctClusterLayer } from '../../../src/shared/pct-map/PctClusterLayer.jsx';

const TASK_DOT = { variant: 'alert', label: 'Tâche à faire', placement: 'top-right' };
const TUTORIAL_DOT = { variant: 'info', label: '2 tutoriels liés', placement: 'bottom-left' };

describe('PctStatusDots', () => {
  test('rien à poser → aucun nœud', () => {
    const { container } = render(<PctStatusDots dots={[]} />);
    expect(container.querySelector('.fm-pct-status-dots')).toBeNull();
    expect(render(<PctStatusDots dots={null} />).container.firstChild).toBeNull();
  });

  test('une classe par ton et par coin, libellé en infobulle', () => {
    const { container } = render(<PctStatusDots dots={[TASK_DOT, TUTORIAL_DOT]} />);
    const dots = container.querySelectorAll('.fm-pct-status-dot');
    expect(dots).toHaveLength(2);
    expect(dots[0].classList.contains('fm-pct-status-dot--alert')).toBe(true);
    expect(dots[0].classList.contains('fm-pct-status-dot--top-right')).toBe(true);
    expect(dots[0].getAttribute('title')).toBe('Tâche à faire');
    expect(dots[1].classList.contains('fm-pct-status-dot--info')).toBe(true);
    expect(dots[1].classList.contains('fm-pct-status-dot--bottom-left')).toBe(true);
  });

  test('groupe décoratif : le libellé est repris ailleurs, pas annoncé deux fois', () => {
    const { container } = render(<PctStatusDots dots={[TASK_DOT]} />);
    expect(container.querySelector('.fm-pct-status-dots')).toHaveAttribute('aria-hidden');
    expect(statusDotsLabel([TASK_DOT, TUTORIAL_DOT])).toBe('Tâche à faire — 2 tutoriels liés');
    expect(statusDotsLabel(null)).toBe('');
  });
});

describe('PctStatusDotsLayer', () => {
  test('une ancre positionnée en pourcentage par lieu', () => {
    const { container } = render(
      <PctStatusDotsLayer
        anchors={[{ id: 'zone:7', xp: 25, yp: 60, dots: [TASK_DOT, TUTORIAL_DOT] }]}
      />,
    );
    const anchor = container.querySelector('.fm-pct-status-anchor');
    expect(anchor).toHaveStyle({ left: '25%', top: '60%' });
    expect(anchor.querySelectorAll('.fm-pct-status-dot')).toHaveLength(2);
  });

  test('aucune ancre → calque absent (pas de nœud vide sur la carte)', () => {
    expect(render(<PctStatusDotsLayer anchors={[]} />).container.firstChild).toBeNull();
  });
});

describe('pastilles d’état sur les lieux', () => {
  test('repère : pastille rendue et libellé joint au nom accessible', () => {
    const { container } = render(
      <PctMarkersLayer
        markers={[{ id: 'm1', x_pct: 10, y_pct: 20, label: 'Composteur', emoji: '🪱' }]}
        onMarkerClick={() => {}}
        getStatusDots={() => [TASK_DOT]}
      />,
    );
    const button = container.querySelector('.fm-pct-marker');
    expect(button.querySelector('.fm-pct-status-dot--alert')).toBeTruthy();
    expect(button).toHaveAttribute('aria-label', 'Composteur — Tâche à faire');
  });

  test('repère sans pastille : nom accessible inchangé', () => {
    const { container } = render(
      <PctMarkersLayer
        markers={[{ id: 'm1', x_pct: 10, y_pct: 20, label: 'Composteur' }]}
        onMarkerClick={() => {}}
        getStatusDots={() => []}
      />,
    );
    const button = container.querySelector('.fm-pct-marker');
    expect(button.querySelector('.fm-pct-status-dot')).toBeNull();
    expect(button).toHaveAttribute('aria-label', 'Composteur');
  });

  test('zone : le libellé des pastilles complète le nom accessible du polygone', () => {
    const zones = [
      {
        id: 'z1',
        name: 'Verger',
        points: '[{"xp":0,"yp":0},{"xp":20,"yp":0},{"xp":20,"yp":20}]',
      },
    ];
    const { container } = render(
      <PctZonesLayer
        zones={zones}
        onZoneClick={() => {}}
        getStatusLabel={() => 'Tâche en cours'}
      />,
    );
    expect(container.querySelector('.fm-pct-zone')).toHaveAttribute(
      'aria-label',
      'Verger — Tâche en cours',
    );
  });
});

describe('PctClusterLayer — pastilles d’un groupe de repères', () => {
  const CLUSTER = {
    id: 'cluster:m1:2',
    x_pct: 40,
    y_pct: 50,
    count: 2,
    lead: { id: 'm1', label: 'Composteur', emoji: '🪵' },
    markers: [{ id: 'm1' }, { id: 'm2' }],
  };

  function renderLayer(statusDotsOf) {
    return render(
      <PctClusterLayer
        clusters={[CLUSTER]}
        onClusterClick={() => {}}
        renderMarker={() => null}
        statusDotsOf={statusDotsOf}
      />,
    );
  }

  test('le groupe porte les pastilles de ses membres, libellé joint au nom accessible', () => {
    // Régression : au dézoom (l'état d'arrivée sur la carte), les repères regroupés
    // perdaient toute pastille d'état — les tâches à faire devenaient invisibles.
    const { container } = renderLayer(() => [TASK_DOT]);
    const button = container.querySelector('.fm-pct-cluster');
    expect(button.querySelector('.fm-pct-status-dot--alert')).not.toBeNull();
    expect(button.querySelector('.fm-pct-cluster__dots')).not.toBeNull();
    expect(button).toHaveAttribute(
      'aria-label',
      '2 lieux regroupés, dont Composteur — Tâche à faire',
    );
  });

  test('sans règle d’agrégation ou sans état : pas de pastille, nom accessible inchangé', () => {
    const { container } = renderLayer(null);
    const button = container.querySelector('.fm-pct-cluster');
    expect(button.querySelector('.fm-pct-status-dot')).toBeNull();
    expect(button).toHaveAttribute('aria-label', '2 lieux regroupés, dont Composteur');
    expect(renderLayer(() => []).container.querySelectorAll('.fm-pct-status-dot')).toHaveLength(0);
  });
});
