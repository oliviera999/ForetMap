import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  BiodivLocationMapBlock,
  PlantLocationPreviewMaps,
} from '../../../src/components/biodiv/BiodivLocationMaps.jsx';

const MAPS = [{ id: 'foret', label: 'La Forêt', map_image_url: '/uploads/maps/foret.jpg' }];
const MARKER = { id: 1, x_pct: 40, y_pct: 60 };

describe('BiodivLocationMapBlock', () => {
  test('aucune zone/repère traçable → ne rend rien', () => {
    const { container } = render(
      <BiodivLocationMapBlock mapId="foret" maps={MAPS} zones={[]} markers={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
  test('repère valide → rend le label de carte + un point SVG', () => {
    const { container } = render(
      <BiodivLocationMapBlock mapId="foret" maps={MAPS} zones={[]} markers={[MARKER]} />,
    );
    expect(screen.getByText('La Forêt')).toBeInTheDocument();
    expect(container.querySelectorAll('circle.biodiv-location-marker-dot').length).toBe(1);
  });
  test('repère aux coordonnées non finies → ignoré (rien)', () => {
    const { container } = render(
      <BiodivLocationMapBlock
        mapId="foret"
        maps={MAPS}
        zones={[]}
        markers={[{ id: 2, x_pct: 'x', y_pct: null }]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
  test('carte inconnue → repli du label sur le mapId', () => {
    render(<BiodivLocationMapBlock mapId="inconnue" maps={MAPS} zones={[]} markers={[MARKER]} />);
    expect(screen.getByText('inconnue')).toBeInTheDocument();
  });
});

describe('PlantLocationPreviewMaps', () => {
  test('aucun emplacement → ne rend rien', () => {
    const { container } = render(<PlantLocationPreviewMaps maps={MAPS} zones={[]} markers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  test('regroupe par carte et rend un bloc par groupe', () => {
    render(
      <PlantLocationPreviewMaps
        maps={MAPS}
        zones={[]}
        markers={[{ ...MARKER, map_id: 'foret' }]}
      />,
    );
    expect(screen.getByText('La Forêt')).toBeInTheDocument();
  });
});
