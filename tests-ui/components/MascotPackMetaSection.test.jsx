import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import MascotPackMetaSection from '../../src/components/MascotPackMetaSection.jsx';

function makePack(overrides = {}) {
  return {
    id: 'mon-pack',
    label: 'Mon pack',
    framesBase: '/assets/mascots/',
    frameWidth: 64,
    frameHeight: 64,
    pixelated: true,
    displayScale: 1,
    fallbackSilhouette: 'gnome',
    ...overrides,
  };
}

describe('MascotPackMetaSection', () => {
  test('affiche les champs id et label avec les valeurs du pack', () => {
    render(
      <MascotPackMetaSection
        pack={makePack()}
        patchPack={vi.fn()}
        setFramesBaseServer={vi.fn()}
        packWarnings={[]}
      />,
    );
    expect(screen.getByText('Métadonnées')).toBeTruthy();
    expect(screen.getByDisplayValue('mon-pack')).toBeTruthy();
    expect(screen.getByDisplayValue('Mon pack')).toBeTruthy();
  });

  test('editer le champ id remonte la mise a jour via patchPack', () => {
    const patchPack = vi.fn();
    render(
      <MascotPackMetaSection
        pack={makePack()}
        patchPack={patchPack}
        setFramesBaseServer={vi.fn()}
        packWarnings={[]}
      />,
    );
    fireEvent.change(screen.getByDisplayValue('mon-pack'), { target: { value: 'autre-pack' } });
    expect(patchPack).toHaveBeenCalledWith({ id: 'autre-pack' });
  });

  test('le bouton URL serveur n est rendu que si packUuid est fourni', () => {
    const setFramesBaseServer = vi.fn();
    const { rerender } = render(
      <MascotPackMetaSection
        pack={makePack()}
        patchPack={vi.fn()}
        setFramesBaseServer={setFramesBaseServer}
        packWarnings={[]}
      />,
    );
    expect(screen.queryByText('Utiliser l’URL des fichiers de ce pack (serveur)')).toBeNull();

    rerender(
      <MascotPackMetaSection
        pack={makePack()}
        patchPack={vi.fn()}
        packUuid="abc-123"
        setFramesBaseServer={setFramesBaseServer}
        packWarnings={[]}
      />,
    );
    const btn = screen.getByText('Utiliser l’URL des fichiers de ce pack (serveur)');
    fireEvent.click(btn);
    expect(setFramesBaseServer).toHaveBeenCalledTimes(1);
  });

  test('affiche les avertissements non bloquants quand presents', () => {
    render(
      <MascotPackMetaSection
        pack={makePack()}
        patchPack={vi.fn()}
        setFramesBaseServer={vi.fn()}
        packWarnings={['Avertissement A', 'Avertissement B']}
      />,
    );
    expect(screen.getByText('Avertissements non bloquants')).toBeTruthy();
    expect(screen.getByText('Avertissement A')).toBeTruthy();
    expect(screen.getByText('Avertissement B')).toBeTruthy();
  });
});
