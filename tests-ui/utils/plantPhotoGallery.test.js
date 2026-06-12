import { describe, test, expect } from 'vitest';
import {
  filterNonEmptyFiles,
  planGalleryPhotoSlots,
  galleryUploadToastMessages,
} from '../../src/utils/plantPhotoGallery.js';

const FIELDS = [
  { key: 'photo', label: 'Photo (illustration principale)' },
  { key: 'photo_species', label: 'Photo espèce' },
  { key: 'photo_leaf', label: 'Photo feuille' },
  { key: 'photo_flower', label: 'Photo fleur' },
];

describe('filterNonEmptyFiles', () => {
  test('garde les fichiers de taille > 0, ignore vides et null', () => {
    const files = [{ size: 10 }, { size: 0 }, null, undefined, { size: 3 }];
    expect(filterNonEmptyFiles(files)).toEqual([{ size: 10 }, { size: 3 }]);
  });

  test('FileList absente → tableau vide', () => {
    expect(filterNonEmptyFiles(null)).toEqual([]);
    expect(filterNonEmptyFiles(undefined)).toEqual([]);
  });
});

describe('planGalleryPhotoSlots', () => {
  test('champ de départ inconnu → null', () => {
    expect(planGalleryPhotoSlots(FIELDS, 'nope', 2)).toBe(null);
  });

  test('répartit les fichiers sur les champs suivants dans l’ordre', () => {
    const plan = planGalleryPhotoSlots(FIELDS, 'photo_species', 2);
    expect(plan.assignments).toEqual([
      { fileIndex: 0, fieldKey: 'photo_species', label: 'Photo espèce' },
      { fileIndex: 1, fieldKey: 'photo_leaf', label: 'Photo feuille' },
    ]);
    expect(plan.skipped).toBe(0);
    expect(plan.startLabel).toBe('Photo espèce');
  });

  test('fichiers au-delà du dernier champ → comptés skipped', () => {
    const plan = planGalleryPhotoSlots(FIELDS, 'photo_leaf', 5);
    expect(plan.assignments.map((a) => a.fieldKey)).toEqual(['photo_leaf', 'photo_flower']);
    expect(plan.skipped).toBe(3);
    expect(plan.startLabel).toBe('Photo feuille');
  });

  test('départ au dernier champ avec 1 fichier → aucune perte', () => {
    const plan = planGalleryPhotoSlots(FIELDS, 'photo_flower', 1);
    expect(plan.assignments).toHaveLength(1);
    expect(plan.skipped).toBe(0);
  });

  test('0 fichier → aucune affectation, skipped 0', () => {
    const plan = planGalleryPhotoSlots(FIELDS, 'photo', 0);
    expect(plan.assignments).toEqual([]);
    expect(plan.skipped).toBe(0);
  });
});

describe('galleryUploadToastMessages', () => {
  test('1 photo importée sans perte → message singulier', () => {
    expect(galleryUploadToastMessages({ ok: 1, skipped: 0, startLabel: 'Photo espèce' }))
      .toEqual(['Photo importée ✓']);
  });

  test('plusieurs photos importées → message pluriel', () => {
    expect(galleryUploadToastMessages({ ok: 3, skipped: 0, startLabel: 'Photo espèce' }))
      .toEqual(['3 photos importées ✓']);
  });

  test('pertes → avertissement en premier, puis succès pluriel', () => {
    expect(galleryUploadToastMessages({ ok: 2, skipped: 1, startLabel: 'Photo feuille' }))
      .toEqual([
        '1 photo(s) non importée(s) — plus de champ disponible après « Photo feuille ».',
        '2 photos importées ✓',
      ]);
  });

  test('1 seule importée mais avec perte → pas de message singulier (comportement historique)', () => {
    expect(galleryUploadToastMessages({ ok: 1, skipped: 2, startLabel: 'Photo fleur' }))
      .toEqual(['2 photo(s) non importée(s) — plus de champ disponible après « Photo fleur ».']);
  });

  test('aucune réussite ni perte → aucun message', () => {
    expect(galleryUploadToastMessages({ ok: 0, skipped: 0, startLabel: 'Photo' })).toEqual([]);
  });
});
