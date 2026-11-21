import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { VisitMapChrome } from '../../../src/components/visit/VisitMapChrome.jsx';

/**
 * Vignettes du sélecteur de guide (lot J, audit UI/UX du 19/11/2026, U1 et U4) : une petite
 * image fixe par guide, la silhouette de repli sinon — jamais la planche de sprites.
 */

const THUMB = (id) => `/api/visit/mascot-packs/${id}/assets/_vignette.png`;
const UUID_A = '00000000-0000-4000-8000-00000000000a';
const UUID_B = '00000000-0000-4000-8000-00000000000b';

const MASCOTS = [
  {
    id: 'srv-a',
    label: 'Gnome néon',
    renderer: 'spritesheet',
    spritesheet: { src: '/assets/mascots/planche-complete.png' },
    thumbnailUrl: THUMB(UUID_A),
  },
  {
    id: 'srv-a-f',
    label: 'Gnome néon (femme)',
    renderer: 'sprite_cut',
    spriteCut: null,
    isPlaceholder: true,
    thumbnailUrl: THUMB(UUID_B),
  },
  { id: 'spore-rive', label: 'Spore', fallbackSilhouette: 'spore' },
];

function openMenu(overrides = {}) {
  const onChangeVisitMascotId = vi.fn();
  render(
    <VisitMapChrome
      title="Visite"
      onOpenPresentation={vi.fn()}
      onToggleImmersion={vi.fn()}
      onSelectMapId={vi.fn()}
      onChangeVisitMascotId={onChangeVisitMascotId}
      maps={[]}
      mapId="foret"
      visitMascotOptions={MASCOTS}
      visitMascotId="srv-a"
      {...overrides}
    />,
  );
  fireEvent.click(screen.getByTestId('visit-mascot-picker'));
  return {
    menu: screen.getByRole('menu', { name: 'Mascottes disponibles' }),
    onChangeVisitMascotId,
  };
}

describe('Sélecteur de guide — vignettes', () => {
  test('chaque guide doté d’une vignette l’affiche : image fixe, dimensions, chargement différé', () => {
    const { menu } = openMenu();
    const option = within(menu).getByRole('menuitemradio', { name: 'Gnome néon' });
    const img = within(option).getByTestId('visit-mascot-thumb');
    expect(img).toHaveAttribute('src', THUMB(UUID_A));
    expect(img).toHaveAttribute('width', '32');
    expect(img).toHaveAttribute('height', '32');
    expect(img).toHaveAttribute('loading', 'lazy');
    // Décorative : le nom du guide est le texte du bouton, il n'est pas répété.
    expect(img).toHaveAttribute('alt', '');
  });

  test('aucune planche de sprites n’est chargée par le menu', () => {
    const { menu } = openMenu();
    const sources = Array.from(menu.querySelectorAll('img')).map((img) => img.getAttribute('src'));
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((src) => src.endsWith('/_vignette.png'))).toBe(true);
  });

  test('sans vignette : silhouette de repli, pas d’image', () => {
    const { menu } = openMenu();
    const option = within(menu).getByRole('menuitemradio', { name: 'Spore' });
    expect(within(option).queryByTestId('visit-mascot-thumb')).toBeNull();
    expect(option.querySelector('.visit-mascot-picker__thumb svg')).not.toBeNull();
  });

  test('vignette illisible : la silhouette prend le relais', () => {
    const { menu } = openMenu();
    const option = within(menu).getByRole('menuitemradio', { name: 'Gnome néon' });
    fireEvent.error(within(option).getByTestId('visit-mascot-thumb'));
    expect(within(option).queryByTestId('visit-mascot-thumb')).toBeNull();
    expect(option.querySelector('.visit-mascot-picker__thumb svg')).not.toBeNull();
  });

  test('version féminine cochée : le personnage montre la vignette de sa variante', () => {
    const { menu } = openMenu({
      visitMascotId: 'srv-a-f',
      visitMascotVariantOfById: new Map([['srv-a-f', 'srv-a']]),
    });
    const option = within(menu).getByRole('menuitemradio', { name: 'Gnome néon' });
    expect(within(option).getByTestId('visit-mascot-thumb')).toHaveAttribute('src', THUMB(UUID_B));
  });

  test('le choix d’un guide reste celui du bouton', () => {
    const { menu, onChangeVisitMascotId } = openMenu();
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Spore' }));
    expect(onChangeVisitMascotId).toHaveBeenCalledWith('spore-rive');
  });
});
