import { describe, test, expect } from 'vitest';
import {
  buildMapAssociatedPhotos,
  parseVisitMascotAllowedIds,
} from '../../src/utils/visitEditorHelpers.js';

// --- buildMapAssociatedPhotos ---

describe('buildMapAssociatedPhotos', () => {
  test('retourne [] si selected est null', () => {
    expect(buildMapAssociatedPhotos(null)).toEqual([]);
  });

  test('retourne [] si selected est undefined', () => {
    expect(buildMapAssociatedPhotos(undefined)).toEqual([]);
  });

  test('retourne [] si selected na pas de photos', () => {
    expect(buildMapAssociatedPhotos({ id: 1 })).toEqual([]);
  });

  test('inclut map_lead_photo si image_url est present', () => {
    const selected = {
      map_lead_photo: { id: 42, image_url: '/img/lead.jpg', thumb_url: '/img/lead-t.jpg', caption: 'Photo principale' },
    };
    const result = buildMapAssociatedPhotos(selected);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('map-lead-42');
    expect(result[0].image_url).toBe('/img/lead.jpg');
    expect(result[0].thumb_url).toBe('/img/lead-t.jpg');
    expect(result[0].caption).toBe('Photo principale');
  });

  test('utilise "x" comme id de map_lead_photo si id est absent', () => {
    const selected = { map_lead_photo: { image_url: '/img/a.jpg' } };
    const result = buildMapAssociatedPhotos(selected);
    expect(result[0].id).toBe('map-lead-x');
  });

  test("n'inclut pas map_lead_photo si image_url est absent", () => {
    const selected = { map_lead_photo: { thumb_url: '/img/t.jpg' } };
    expect(buildMapAssociatedPhotos(selected)).toEqual([]);
  });

  test('inclut les map_extra_photos avec image_url valide', () => {
    const selected = {
      map_extra_photos: [
        { id: 5, image_url: '/img/e1.jpg', thumb_url: '/img/e1-t.jpg', caption: 'Extra 1' },
        { id: 6, image_url: '/img/e2.jpg', caption: 'Extra 2' },
      ],
    };
    const result = buildMapAssociatedPhotos(selected);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('map-extra-5');
    expect(result[0].caption).toBe('Extra 1');
    expect(result[1].id).toBe('map-extra-6');
    expect(result[1].thumb_url).toBeUndefined();
  });

  test('omet les extra photos sans image_url', () => {
    const selected = {
      map_extra_photos: [
        { id: 7, thumb_url: '/img/t.jpg' },
        { id: 8, image_url: '/img/ok.jpg' },
      ],
    };
    const result = buildMapAssociatedPhotos(selected);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('map-extra-8');
  });

  test('combine lead + extras dans l\'ordre', () => {
    const selected = {
      map_lead_photo: { id: 1, image_url: '/img/lead.jpg', caption: '' },
      map_extra_photos: [
        { id: 2, image_url: '/img/e1.jpg', caption: '' },
        { id: 3, image_url: '/img/e2.jpg', caption: '' },
      ],
    };
    const result = buildMapAssociatedPhotos(selected);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('map-lead-1');
    expect(result[1].id).toBe('map-extra-2');
    expect(result[2].id).toBe('map-extra-3');
  });

  test('caption est "" par defaut si absent', () => {
    const selected = { map_lead_photo: { id: 1, image_url: '/img/a.jpg' } };
    expect(buildMapAssociatedPhotos(selected)[0].caption).toBe('');
  });
});

// --- parseVisitMascotAllowedIds ---

describe('parseVisitMascotAllowedIds', () => {
  test('retourne [] pour null', () => {
    expect(parseVisitMascotAllowedIds(null)).toEqual([]);
  });

  test('retourne [] pour undefined', () => {
    expect(parseVisitMascotAllowedIds(undefined)).toEqual([]);
  });

  test('retourne [] pour un nombre', () => {
    expect(parseVisitMascotAllowedIds(42)).toEqual([]);
  });

  test('retourne [] pour un objet', () => {
    expect(parseVisitMascotAllowedIds({})).toEqual([]);
  });

  test('tableau de strings : trim et filtre les vides', () => {
    expect(parseVisitMascotAllowedIds(['renard', ' lapin ', '', 'cerf'])).toEqual([
      'renard', 'lapin', 'cerf',
    ]);
  });

  test('tableau de non-strings : convertit en string et filtre les vides', () => {
    expect(parseVisitMascotAllowedIds([1, null, 'cerf'])).toEqual(['1', 'cerf']);
  });

  test('chaine CSV separee par des virgules', () => {
    expect(parseVisitMascotAllowedIds('renard,lapin,cerf')).toEqual(['renard', 'lapin', 'cerf']);
  });

  test('chaine separee par des sauts de ligne', () => {
    expect(parseVisitMascotAllowedIds('renard\nlapin\ncerf')).toEqual(['renard', 'lapin', 'cerf']);
  });

  test('chaine separee par des points-virgules', () => {
    expect(parseVisitMascotAllowedIds('renard;lapin;cerf')).toEqual(['renard', 'lapin', 'cerf']);
  });

  test('trim des espaces parasites dans les ids de la chaine', () => {
    expect(parseVisitMascotAllowedIds(' renard , lapin ')).toEqual(['renard', 'lapin']);
  });

  test('filtre les segments vides de la chaine', () => {
    expect(parseVisitMascotAllowedIds('renard,,lapin')).toEqual(['renard', 'lapin']);
  });

  test('chaine vide retourne []', () => {
    expect(parseVisitMascotAllowedIds('')).toEqual([]);
  });

  test('tableau vide retourne []', () => {
    expect(parseVisitMascotAllowedIds([])).toEqual([]);
  });
});
