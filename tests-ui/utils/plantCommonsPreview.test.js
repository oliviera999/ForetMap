import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchCommonsCategoryPreview,
  findFirstBiodivHeroPhotoCandidate,
} from '../../src/utils/plantCommonsPreview.js';

// ── fetchCommonsCategoryPreview ───────────────────────────────────────────────

const CATEGORY_URL = 'https://commons.wikimedia.org/wiki/Category:Solanum_lycopersicum';
const FILE_URL = 'https://commons.wikimedia.org/wiki/File:Tomato_je.jpg';
const DIRECT_URL = 'https://upload.wikimedia.org/wikipedia/commons/8/88/Salad_garden.jpg';

describe('fetchCommonsCategoryPreview', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('retourne null si l\'URL n\'est pas une catégorie Commons', async () => {
    const result = await fetchCommonsCategoryPreview('https://example.com/page');
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  test('retourne null si l\'URL est vide ou null', async () => {
    expect(await fetchCommonsCategoryPreview('')).toBeNull();
    expect(await fetchCommonsCategoryPreview(null)).toBeNull();
  });

  test('retourne null si la réponse HTTP est en erreur', async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    const result = await fetchCommonsCategoryPreview(CATEGORY_URL);
    expect(result).toBeNull();
  });

  test('retourne thumburl si disponible', async () => {
    const mockData = {
      query: {
        pages: {
          '-1': {
            imageinfo: [{ thumburl: 'https://example.com/thumb.jpg', url: 'https://example.com/full.jpg' }],
          },
        },
      },
    };
    fetch.mockResolvedValueOnce({ ok: true, json: async () => mockData });
    const result = await fetchCommonsCategoryPreview(CATEGORY_URL);
    expect(result).toBe('https://example.com/thumb.jpg');
  });

  test('retourne url si thumburl absent', async () => {
    const mockData = {
      query: {
        pages: {
          '1': {
            imageinfo: [{ url: 'https://example.com/full.jpg' }],
          },
        },
      },
    };
    fetch.mockResolvedValueOnce({ ok: true, json: async () => mockData });
    const result = await fetchCommonsCategoryPreview(CATEGORY_URL);
    expect(result).toBe('https://example.com/full.jpg');
  });

  test('retourne null si aucune page dans les résultats', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ query: { pages: {} } }) });
    const result = await fetchCommonsCategoryPreview(CATEGORY_URL);
    expect(result).toBeNull();
  });

  test('retourne null si imageinfo absent', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ query: { pages: { '1': {} } } }) });
    const result = await fetchCommonsCategoryPreview(CATEGORY_URL);
    expect(result).toBeNull();
  });
});

// ── findFirstBiodivHeroPhotoCandidate ─────────────────────────────────────────

describe('findFirstBiodivHeroPhotoCandidate', () => {
  test('retourne null si la plante n\'a pas de photo', () => {
    expect(findFirstBiodivHeroPhotoCandidate({})).toBeNull();
    expect(findFirstBiodivHeroPhotoCandidate({ photo: '', photo_species: '' })).toBeNull();
  });

  test('détecte une URL d\'image directe dans le champ photo', () => {
    const plant = { photo: DIRECT_URL };
    const result = findFirstBiodivHeroPhotoCandidate(plant);
    expect(result).toEqual({ kind: 'direct', src: DIRECT_URL });
  });

  test('détecte une page File: Commons dont le chemin se termine par .jpg comme image directe', () => {
    // /wiki/File:Tomato_je.jpg se termine par .jpg → isLikelyDirectImageUrl retourne true
    const plant = { photo: FILE_URL };
    const result = findFirstBiodivHeroPhotoCandidate(plant);
    expect(result?.kind).toBe('direct');
    // Le src est l'URL elle-même car isLikelyDirectImageUrl la reconnaît avant commonsFilePageToDisplaySrc
    expect(result?.src).toBe(FILE_URL);
  });

  test('résout une page File: Commons sans extension image via commonsFilePageToDisplaySrc', () => {
    const fileNoExt = 'https://commons.wikimedia.org/wiki/File:Tomato_plant';
    const plant = { photo: fileNoExt };
    const result = findFirstBiodivHeroPhotoCandidate(plant);
    expect(result?.kind).toBe('direct');
    expect(result?.src).toContain('FilePath');
    expect(result?.src).toContain('Tomato_plant');
  });

  test('détecte une catégorie Commons et retourne kind: category', () => {
    const plant = { photo: CATEGORY_URL };
    const result = findFirstBiodivHeroPhotoCandidate(plant);
    expect(result).toEqual({ kind: 'category', categoryUrl: CATEGORY_URL });
  });

  test('priorise le champ photo avant photo_species', () => {
    const plant = {
      photo: DIRECT_URL,
      photo_species: 'https://example.com/species.jpg',
    };
    const result = findFirstBiodivHeroPhotoCandidate(plant);
    expect(result?.src).toBe(DIRECT_URL);
  });

  test('utilise photo_species si photo est vide', () => {
    const speciesUrl = 'https://upload.wikimedia.org/wikipedia/commons/8/88/species.jpg';
    const plant = { photo: '', photo_species: speciesUrl };
    const result = findFirstBiodivHeroPhotoCandidate(plant);
    expect(result).toEqual({ kind: 'direct', src: speciesUrl });
  });

  test('ignore les URL non-HTTP (chemins relatifs, données invalides)', () => {
    const plant = { photo: 'juste-un-texte-sans-http', photo_species: '' };
    expect(findFirstBiodivHeroPhotoCandidate(plant)).toBeNull();
  });

  test('accepte un chemin /uploads/ local comme image directe si extension image', () => {
    const plant = { photo: '/uploads/plants/img.jpg' };
    const result = findFirstBiodivHeroPhotoCandidate(plant);
    expect(result).toEqual({ kind: 'direct', src: '/uploads/plants/img.jpg' });
  });

  test('retourne null si la plante est null/undefined', () => {
    expect(findFirstBiodivHeroPhotoCandidate(null)).toBeNull();
    expect(findFirstBiodivHeroPhotoCandidate(undefined)).toBeNull();
  });

  test('gère plusieurs liens séparés par retour ligne dans photo', () => {
    // La première entrée valide doit être retournée
    const plant = { photo: `invalid-url\n${DIRECT_URL}` };
    const result = findFirstBiodivHeroPhotoCandidate(plant);
    expect(result).toEqual({ kind: 'direct', src: DIRECT_URL });
  });
});
