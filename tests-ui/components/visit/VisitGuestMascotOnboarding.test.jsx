import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { VisitGuestMascotOnboarding } from '../../../src/components/visit/VisitGuestMascotOnboarding.jsx';

vi.mock('../../../src/components/VisitMapMascotRenderer.jsx', () => ({
  default: () => null,
}));

const OPTIONS = [
  { id: 'gnome', label: 'Gnome' },
  { id: 'spore', label: 'Spore' },
];

function setup(overrides = {}) {
  const props = {
    requested: true,
    mascotId: 'gnome',
    mascotOptions: OPTIONS,
    onChangeMascotId: vi.fn(),
    extraCatalogEntries: null,
    onDone: vi.fn(),
    ...overrides,
  };
  const utils = render(<VisitGuestMascotOnboarding {...props} />);
  return { ...utils, props };
}

describe('VisitGuestMascotOnboarding', () => {
  test('chaque mascotte reste un bouton à bascule annonçant le choix courant', () => {
    setup();
    const current = screen.getByRole('button', { name: 'Gnome' });
    expect(current).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Spore' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('la grille est un groupe nommé, pas une liste', () => {
    const { container } = setup();
    expect(screen.getByRole('group', { name: 'Mascottes disponibles' })).toBeInTheDocument();
    expect(container.querySelector('[role="list"]')).toBeNull();
    expect(container.querySelector('[role="listitem"]')).toBeNull();
  });

  test('sélectionner une mascotte remonte son identifiant', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Spore' }));
    expect(props.onChangeMascotId).toHaveBeenCalledWith('spore');
  });

  test('« Commencer la visite » ferme la modale et prévient le parent', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Commencer la visite/i }));
    expect(props.onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('non demandée → rien n’est rendu', () => {
    const { container } = setup({ requested: false });
    expect(container).toBeEmptyDOMElement();
  });
});
