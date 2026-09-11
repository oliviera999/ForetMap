import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { VisitBiodiversityPanel } from '../../../src/components/visit/VisitBiodiversityPanel.jsx';

const PLANTS = [
  {
    id: 12,
    name: 'Consoude',
    emoji: '🌿',
    scientific_name: 'Symphytum officinale',
    ecosystem_role: 'Remonte les minéraux du sous-sol.',
    photo: 'https://exemple.test/consoude.jpg',
  },
  {
    id: 13,
    name: 'Ortie',
    emoji: '🍃',
    description: 'Plante pionnière des sols riches en azote.',
  },
];

function setup(overrides = {}) {
  const props = {
    locationKind: 'zone',
    names: ['Consoude'],
    species: [{ id: 12, name: 'Consoude', emoji: '🌿' }],
    plants: PLANTS,
    namesOnlyOnTasks: [],
    onOpenPlant: vi.fn(),
    ...overrides,
  };
  const utils = render(<VisitBiodiversityPanel {...props} />);
  return { ...utils, props };
}

describe('VisitBiodiversityPanel', () => {
  test('aucune espèce → rien de rendu', () => {
    const { container } = setup({ names: [], species: [], namesOnlyOnTasks: [] });
    expect(container).toBeEmptyDOMElement();
  });

  test('titre selon la nature du lieu', () => {
    const { unmount } = setup();
    expect(
      screen.getByRole('heading', { name: /Biodiversité de cette zone/i }),
    ).toBeInTheDocument();
    unmount();
    setup({ locationKind: 'marker' });
    expect(screen.getByRole('heading', { name: /Biodiversité de ce repère/i })).toBeInTheDocument();
  });

  test('vignette cliquable : nom, nom scientifique, extrait et ouverture de la fiche', () => {
    const { props } = setup();
    const tile = screen.getByRole('button', { name: /Ouvrir la fiche de Consoude/i });
    expect(tile).toHaveTextContent('Consoude');
    expect(tile).toHaveTextContent('Symphytum officinale');
    expect(tile).toHaveTextContent('Remonte les minéraux du sous-sol.');
    fireEvent.click(tile);
    expect(props.onOpenPlant).toHaveBeenCalledWith(12);
  });

  test('photo directe affichée, emoji conservé à côté du nom', () => {
    const { container } = setup();
    const img = container.querySelector('.visit-biodiv-tile__visual img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://exemple.test/consoude.jpg');
    expect(container.querySelector('.visit-biodiv-tile__name-emoji')).not.toBeNull();
  });

  test('photo injoignable : la vignette retombe sur l’emoji', () => {
    const { container } = setup();
    const img = container.querySelector('.visit-biodiv-tile__visual img');
    fireEvent.error(img);
    expect(container.querySelector('.visit-biodiv-tile__visual img')).toBeNull();
    expect(container.querySelector('.visit-biodiv-tile__emoji')).toHaveTextContent('🌿');
  });

  test('sans photo : emoji en visuel (celui du catalogue)', () => {
    const { container } = setup({
      names: ['Ortie'],
      species: [{ id: 13, name: 'Ortie', emoji: '🍃' }],
    });
    expect(container.querySelector('.visit-biodiv-tile__visual img')).toBeNull();
    expect(container.querySelector('.visit-biodiv-tile__emoji')).toHaveTextContent('🍃');
  });

  test('espèce sans fiche catalogue : annoncée, non cliquable', () => {
    const { container } = setup({
      names: ['Herbe mystère'],
      species: [],
      plants: PLANTS,
    });
    expect(screen.queryByRole('button')).toBeNull();
    const tile = container.querySelector('.visit-biodiv-tile--static');
    expect(tile).toHaveTextContent('Herbe mystère');
    // Aucune invitation à toucher quand rien n'est ouvrable.
    expect(screen.queryByText(/Touche une espèce/i)).toBeNull();
  });

  test('catalogue encore absent : emoji du contenu de visite, vignette inerte', () => {
    const { container } = setup({ plants: [] });
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('.visit-biodiv-tile__emoji')).toHaveTextContent('🌿');
  });

  test('espèces des missions regroupées à part, sans doublon avec le lieu', () => {
    setup({ names: ['Consoude'], namesOnlyOnTasks: ['Consoude', 'Ortie'] });
    expect(
      screen.getByRole('heading', { name: /Également dans les missions/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Ouvrir la fiche de Consoude/i })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Ouvrir la fiche de Ortie/i })).toBeInTheDocument();
  });

  test('sans callback d’ouverture, les vignettes restent informatives', () => {
    setup({ onOpenPlant: null });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Consoude')).toBeInTheDocument();
  });
});
