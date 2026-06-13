import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  MediaLibraryGalleryTile,
  resolveMediaUrl,
} from '../../../src/components/media/MediaLibraryGalleryTile.jsx';

const imageItem = {
  filename: 'photo.png',
  url: '/uploads/photo.png',
  relativePath: 'uploads/photo.png',
  mediaType: 'image',
  size: 2048,
  stableKey: 'photo-slug',
};

describe('resolveMediaUrl', () => {
  test('chaîne vide tolérée', () => {
    expect(typeof resolveMediaUrl('')).toBe('string');
  });
});

describe('MediaLibraryGalleryTile', () => {
  test('rend la légende, le slug et clic → onPickUrl avec l’URL brute', () => {
    const onPickUrl = vi.fn();
    render(<MediaLibraryGalleryTile item={imageItem} onPickUrl={onPickUrl} showMeta />);
    expect(screen.getByText('photo.png')).toBeTruthy();
    expect(screen.getByText('photo-slug')).toBeTruthy();
    // méta de taille affichée
    expect(screen.getByText('2 Ko')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Copier l’URL — photo.png'));
    expect(onPickUrl).toHaveBeenCalledWith('/uploads/photo.png');
  });

  test('showSelect → case à cocher reliée à onToggleSelect', () => {
    const onToggle = vi.fn();
    render(
      <MediaLibraryGalleryTile
        item={imageItem}
        showSelect
        selected={false}
        onToggleSelect={onToggle}
      />,
    );
    const checkbox = screen.getByLabelText('Sélectionner photo.png');
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  test('type vidéo → libellé « Vidéo »', () => {
    render(<MediaLibraryGalleryTile item={{ ...imageItem, mediaType: 'video' }} />);
    expect(screen.getByText('Vidéo')).toBeTruthy();
  });

  test('type audio → libellé « Audio »', () => {
    render(<MediaLibraryGalleryTile item={{ ...imageItem, mediaType: 'audio' }} />);
    expect(screen.getByText('Audio')).toBeTruthy();
  });

  test('showUsage → MediaUsageInfo monté', () => {
    render(<MediaLibraryGalleryTile item={imageItem} showUsage usageReady={false} />);
    expect(screen.getByText('Usage…')).toBeTruthy();
  });
});
