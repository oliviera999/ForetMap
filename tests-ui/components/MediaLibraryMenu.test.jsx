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
    expect(document.querySelector('.media-library-menu__gallery-type')).toHaveTextContent('Audio');

    fireEvent.click(screen.getByRole('button', { name: /Copier l’URL — a\.png/i }));
    expect(onPickUrl).toHaveBeenCalledWith('/uploads/media-library/image/2026/06/a.png');
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
});
