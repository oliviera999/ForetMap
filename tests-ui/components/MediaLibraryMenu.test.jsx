import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MediaLibraryMenu } from '../../src/components/MediaLibraryMenu.jsx';

vi.mock('../../src/services/api.js', () => ({
  withAppBase: (path) => path,
}));

describe('MediaLibraryMenu layout gallery', () => {
  test('affiche une grille de miniatures cliquables', async () => {
    const onPickUrl = vi.fn();
    render(
      <MediaLibraryMenu
        defaultOpen
        showToggle={false}
        layout="gallery"
        fetchItems={async () => ([
          {
            relativePath: 'media-library/image/2026/06/a.png',
            url: '/uploads/media-library/image/2026/06/a.png',
            filename: 'a.png',
            mediaType: 'image',
          },
          {
            relativePath: 'media-library/audio/2026/06/track.mp3',
            url: '/uploads/media-library/audio/2026/06/track.mp3',
            filename: 'track.mp3',
            mediaType: 'audio',
          },
        ])}
        uploadDataUrl={vi.fn()}
        removeItem={vi.fn()}
        onPickUrl={onPickUrl}
        canUpload={false}
        canRemove={false}
      />
    );

    expect(await screen.findByRole('button', { name: /Copier l’URL — a\.png/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copier l’URL — track\.mp3/i })).toBeInTheDocument();
    const trackBtn = screen.getByRole('button', { name: /Copier l’URL — track\.mp3/i });
    expect(trackBtn.querySelector('.media-library-menu__gallery-type')).toHaveTextContent('Audio');

    fireEvent.click(screen.getByRole('button', { name: /Copier l’URL — a\.png/i }));
    expect(onPickUrl).toHaveBeenCalledWith('/uploads/media-library/image/2026/06/a.png');
  });

  test('utilise la galerie par défaut quand onPickUrl est fourni', async () => {
    render(
      <MediaLibraryMenu
        defaultOpen
        showToggle={false}
        fetchItems={async () => ([
          {
            relativePath: 'media-library/image/2026/06/pick.png',
            url: '/uploads/media-library/image/2026/06/pick.png',
            filename: 'pick.png',
            mediaType: 'image',
          },
        ])}
        uploadDataUrl={vi.fn()}
        removeItem={vi.fn()}
        onPickUrl={vi.fn()}
        canUpload={false}
        canRemove={false}
      />
    );

    expect(await screen.findByRole('button', { name: /Copier l’URL — pick\.png/i })).toBeInTheDocument();
    expect(document.querySelector('.media-library-menu__gallery')).toBeTruthy();
  });

  test('affiche le slug de la ressource sous la miniature', async () => {
    render(
      <MediaLibraryMenu
        defaultOpen
        showToggle={false}
        layout="gallery"
        fetchItems={async () => ([
          {
            relativePath: 'media-library/image/2026/06/a.png',
            url: '/uploads/media-library/image/2026/06/a.png',
            filename: 'a.png',
            mediaType: 'image',
            stableKey: 'embleme_foret',
          },
        ])}
        uploadDataUrl={vi.fn()}
        removeItem={vi.fn()}
        onPickUrl={vi.fn()}
        canUpload={false}
        canRemove={false}
      />
    );

    expect(await screen.findByText('embleme_foret')).toBeInTheDocument();
    expect(document.querySelector('.media-library-menu__gallery-slug')).toHaveTextContent('embleme_foret');
  });

  test('recherche aussi sur le slug', async () => {
    render(
      <MediaLibraryMenu
        defaultOpen
        showToggle={false}
        layout="gallery"
        fetchItems={async () => ([
          {
            relativePath: 'media-library/image/2026/06/a.png',
            url: '/uploads/media-library/image/2026/06/a.png',
            filename: 'a.png',
            mediaType: 'image',
            stableKey: 'embleme_foret',
          },
          {
            relativePath: 'media-library/image/2026/06/b.png',
            url: '/uploads/media-library/image/2026/06/b.png',
            filename: 'b.png',
            mediaType: 'image',
            stableKey: 'plateau-1_jungle',
          },
        ])}
        uploadDataUrl={vi.fn()}
        removeItem={vi.fn()}
        onPickUrl={vi.fn()}
        canUpload={false}
        canRemove={false}
      />
    );

    expect(await screen.findByText('2 médias')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Nom de fichier…'), { target: { value: 'jungle' } });
    expect(await screen.findByText('1 / 2 médias')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copier l’URL — a\.png/i })).not.toBeInTheDocument();
  });

  test('affiche l’usage de chaque ressource (utilisée / inutilisée)', async () => {
    const fetchUsage = vi.fn(async () => ({
      'media-library/image/2026/06/a.png': {
        count: 2,
        locations: [
          { app: 'gl', kind: 'Chapitre', label: 'Forêt', field: 'image de carte', id: 7 },
          { app: 'gl', kind: 'Feuillet de Sélène', label: 'Le copiste', field: 'illustration', id: 3 },
        ],
      },
    }));

    render(
      <MediaLibraryMenu
        defaultOpen
        showToggle={false}
        layout="gallery"
        fetchItems={async () => ([
          {
            relativePath: 'media-library/image/2026/06/a.png',
            url: '/uploads/media-library/image/2026/06/a.png',
            filename: 'a.png',
            mediaType: 'image',
            stableKey: 'embleme_foret',
          },
          {
            relativePath: 'media-library/image/2026/06/b.png',
            url: '/uploads/media-library/image/2026/06/b.png',
            filename: 'b.png',
            mediaType: 'image',
            stableKey: 'orphelin',
          },
        ])}
        fetchUsage={fetchUsage}
        uploadDataUrl={vi.fn()}
        removeItem={vi.fn()}
        onPickUrl={vi.fn()}
        canUpload={false}
        canRemove={false}
      />
    );

    expect(await screen.findByText('Utilisée · 2')).toBeInTheDocument();
    expect(screen.getByText('Chapitre — Forêt (image de carte)')).toBeInTheDocument();
    expect(screen.getByText('Inutilisée')).toBeInTheDocument();
    expect(fetchUsage).toHaveBeenCalled();
  });

  test('filtre par recherche et affiche le décompte', async () => {
    render(
      <MediaLibraryMenu
        defaultOpen
        showToggle={false}
        layout="gallery"
        fetchItems={async () => ([
          {
            relativePath: 'media-library/audio/2026/06/track.mp3',
            url: '/uploads/media-library/audio/2026/06/track.mp3',
            filename: 'track.mp3',
            mediaType: 'audio',
            size: 1024,
          },
          {
            relativePath: 'media-library/image/2026/06/b.png',
            url: '/uploads/media-library/image/2026/06/b.png',
            filename: 'b.png',
            mediaType: 'image',
            size: 2048,
          },
        ])}
        uploadDataUrl={vi.fn()}
        removeItem={vi.fn()}
        onPickUrl={vi.fn()}
        canUpload={false}
        canRemove={false}
      />
    );

    expect(await screen.findByText('2 médias')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Nom de fichier…'), { target: { value: 'track' } });
    expect(await screen.findByText('1 / 2 médias')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copier l’URL — b\.png/i })).not.toBeInTheDocument();
  });

  test('sélection multiple et suppression groupée', async () => {
    const removeItem = vi.fn().mockResolvedValue({ ok: true });
    window.confirm = vi.fn(() => true);

    render(
      <MediaLibraryMenu
        defaultOpen
        showToggle={false}
        layout="gallery"
        enableGalleryBulkActions
        fetchItems={async () => ([
          {
            relativePath: 'media-library/image/2026/06/a.png',
            url: '/uploads/media-library/image/2026/06/a.png',
            filename: 'a.png',
            mediaType: 'image',
          },
          {
            relativePath: 'media-library/image/2026/06/b.png',
            url: '/uploads/media-library/image/2026/06/b.png',
            filename: 'b.png',
            mediaType: 'image',
          },
        ])}
        uploadDataUrl={vi.fn()}
        removeItem={removeItem}
        onPickUrl={vi.fn()}
        canUpload={false}
        canRemove
      />
    );

    expect(await screen.findByRole('button', { name: 'Tout sélectionner' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tout sélectionner' }));
    expect(screen.getByText(/2 sélectionnés/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la sélection (2)' }));
    expect(window.confirm).toHaveBeenCalled();
    await screen.findByText('2 médias supprimés.');
    expect(removeItem).toHaveBeenCalledTimes(2);
  });
});
