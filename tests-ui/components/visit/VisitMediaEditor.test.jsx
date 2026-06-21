import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { VisitMediaEditor } from '../../../src/components/visit/VisitMediaEditor.jsx';

const MEDIA = [
  { id: 1, image_url: '/uploads/a.jpg', caption: 'Photo A', sort_order: 0 },
  { id: 2, image_url: '/uploads/b.jpg', caption: 'Photo B', sort_order: 1 },
];

function setup(overrides = {}) {
  const props = {
    sortedVisitMedia: MEDIA,
    mapAssociatedPhotos: [],
    mediaUrl: '',
    onMediaUrlChange: vi.fn(),
    mediaCaption: '',
    onMediaCaptionChange: vi.fn(),
    mediaSaving: false,
    mediaUploading: false,
    mediaReorderBusy: false,
    mediaFileRef: React.createRef(),
    onAddFromFile: vi.fn(),
    onAddFromUrl: vi.fn(),
    onAssociateMapPhoto: vi.fn(),
    onEditCaption: vi.fn(),
    onDeleteMedia: vi.fn(),
    onReorder: vi.fn(),
    ...overrides,
  };
  render(<VisitMediaEditor {...props} />);
  return props;
}

describe('VisitMediaEditor', () => {
  test('rend une ligne par photo triée', () => {
    setup();
    expect(screen.getByText('Photo A')).toBeInTheDocument();
    expect(screen.getByText('Photo B')).toBeInTheDocument();
  });

  test('le champ URL est contrôlé et remonte les saisies', () => {
    const { onMediaUrlChange } = setup();
    const input = screen.getByPlaceholderText('https://… ou /uploads/…');
    fireEvent.change(input, { target: { value: 'http://x/y.png' } });
    expect(onMediaUrlChange).toHaveBeenCalledWith('http://x/y.png');
  });

  test('le bouton « Ajouter depuis URL » est désactivé sans URL et déclenche onAddFromUrl sinon', () => {
    const { onAddFromUrl } = setup({ mediaUrl: '  http://x  ' });
    const btn = screen.getByRole('button', { name: '+ Ajouter depuis URL' });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onAddFromUrl).toHaveBeenCalledTimes(1);
  });

  test('le bouton URL est désactivé quand mediaUrl est vide', () => {
    setup({ mediaUrl: '   ' });
    expect(screen.getByRole('button', { name: '+ Ajouter depuis URL' })).toBeDisabled();
  });

  test('édition et suppression de légende remontent la photo / l’id ciblé', () => {
    const { onEditCaption, onDeleteMedia } = setup();
    fireEvent.click(screen.getAllByLabelText('Modifier la légende')[0]);
    expect(onEditCaption).toHaveBeenCalledWith(MEDIA[0]);
    fireEvent.click(screen.getAllByLabelText('Supprimer la photo')[1]);
    expect(onDeleteMedia).toHaveBeenCalledWith(2);
  });

  test('le glisser-déposer recalcule l’ordre et appelle onReorder', () => {
    const { onReorder } = setup();
    const rows = document.querySelectorAll('.visit-media-row');
    const dataTransfer = {
      data: {},
      setData(type, val) {
        this.data[type] = val;
      },
      getData(type) {
        return this.data[type];
      },
    };
    fireEvent.dragStart(rows[1], { dataTransfer });
    fireEvent.drop(rows[0], { dataTransfer });
    expect(onReorder).toHaveBeenCalledTimes(1);
    const next = onReorder.mock.calls[0][0];
    expect(next.map((m) => m.id)).toEqual([2, 1]);
  });

  test('le bouton d’envoi de fichiers ouvre l’input file référencé', () => {
    const ref = React.createRef();
    setup({ mediaFileRef: ref });
    const clickSpy = vi.fn();
    // l'input file est rendu via la ref ; on espionne son click
    if (ref.current) ref.current.click = clickSpy;
    fireEvent.click(screen.getByRole('button', { name: /Ajouter des photos/ }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test('affiche les photos carte associables et remonte l’association', () => {
    const photo = { id: 'map-lead-9', image_url: '/uploads/m.jpg', caption: 'Carte' };
    const { onAssociateMapPhoto } = setup({ mapAssociatedPhotos: [photo] });
    fireEvent.click(screen.getByRole('button', { name: 'Associer à la visite' }));
    expect(onAssociateMapPhoto).toHaveBeenCalledWith(photo);
  });
});
