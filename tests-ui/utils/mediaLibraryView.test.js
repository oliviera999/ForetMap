import { describe, test, expect } from 'vitest';
import {
  filterAndSortMediaLibraryItems,
  filterMediaLibraryItems,
  pruneMediaLibrarySelection,
  resolveMediaLibraryLayout,
  sortMediaLibraryItems,
} from '../../src/utils/mediaLibraryView.js';

const sampleItems = [
  {
    filename: 'zoo.mp3',
    mediaType: 'audio',
    size: 5000,
    updatedAt: '2026-06-01T10:00:00.000Z',
  },
  {
    filename: 'forêt.png',
    mediaType: 'image',
    size: 1200,
    updatedAt: '2026-06-07T12:00:00.000Z',
  },
  {
    filename: 'clip.mp4',
    mediaType: 'video',
    size: 9000,
    updatedAt: '2026-06-03T08:00:00.000Z',
  },
];

describe('mediaLibraryView', () => {
  test('filtre par type et recherche insensible aux accents', () => {
    const filtered = filterMediaLibraryItems(sampleItems, {
      filter: 'image',
      query: 'foret',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].filename).toBe('forêt.png');
  });

  test('tri par nom A→Z', () => {
    const sorted = sortMediaLibraryItems(sampleItems, 'name_asc');
    expect(sorted.map((item) => item.filename)).toEqual(['clip.mp4', 'forêt.png', 'zoo.mp3']);
  });

  test('tri par taille décroissante', () => {
    const sorted = sortMediaLibraryItems(sampleItems, 'size_desc');
    expect(sorted[0].filename).toBe('clip.mp4');
  });

  test('combine filtre et tri', () => {
    const rows = filterAndSortMediaLibraryItems(sampleItems, {
      filter: 'all',
      query: '',
      sort: 'updated_desc',
    });
    expect(rows[0].filename).toBe('forêt.png');
  });

  test('resolveMediaLibraryLayout — picker en galerie, gestion en liste', () => {
    expect(resolveMediaLibraryLayout({ onPickUrl: () => {} })).toBe('gallery');
    expect(resolveMediaLibraryLayout({})).toBe('list');
    expect(resolveMediaLibraryLayout({ layout: 'list', onPickUrl: () => {} })).toBe('gallery');
    expect(resolveMediaLibraryLayout({ layout: 'gallery' })).toBe('gallery');
  });

  test('pruneMediaLibrarySelection retire les chemins absents', () => {
    const pruned = pruneMediaLibrarySelection(
      new Set(['media-library/image/a.png', 'media-library/image/ghost.png']),
      [{ relativePath: 'media-library/image/a.png' }]
    );
    expect([...pruned]).toEqual(['media-library/image/a.png']);
  });
});
