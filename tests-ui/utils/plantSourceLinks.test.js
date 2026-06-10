import { describe, test, expect } from 'vitest';
import {
  isHttpLink,
  isLocalUploadsPath,
  isLikelyDirectImageUrl,
  parseCommonsFilePageFromUrl,
  commonsFilePageToDisplaySrc,
  parseCommonsCategoryFromUrl,
  getSourceLabel,
} from '../../src/utils/plantSourceLinks.js';

describe('isHttpLink', () => {
  test('http/https uniquement', () => {
    expect(isHttpLink('http://x.fr')).toBe(true);
    expect(isHttpLink('HTTPS://x.fr')).toBe(true);
    expect(isHttpLink('/uploads/a.png')).toBe(false);
    expect(isHttpLink('ftp://x.fr')).toBe(false);
  });
});

describe('isLocalUploadsPath', () => {
  test('chemin /uploads/ sans query/fragment/espace', () => {
    expect(isLocalUploadsPath('/uploads/plants/1.jpg')).toBe(true);
    expect(isLocalUploadsPath('/uploads/')).toBe(false);
    expect(isLocalUploadsPath('/media/a.jpg')).toBe(false);
  });
});

describe('isLikelyDirectImageUrl', () => {
  test('upload local : extension image requise', () => {
    expect(isLikelyDirectImageUrl('/uploads/a.png')).toBe(true);
    expect(isLikelyDirectImageUrl('/uploads/a.png?v=2')).toBe(true);
    expect(isLikelyDirectImageUrl('/uploads/a.txt')).toBe(false);
  });
  test('URL http : fichier image direct ou Special:FilePath', () => {
    expect(isLikelyDirectImageUrl('https://x.fr/a.jpg')).toBe(true);
    expect(isLikelyDirectImageUrl('https://commons.wikimedia.org/wiki/Special:FilePath/Foo.jpg')).toBe(true);
    expect(isLikelyDirectImageUrl('https://x.fr/page.html')).toBe(false);
    expect(isLikelyDirectImageUrl('pas une url')).toBe(false);
  });
});

describe('parseCommonsFilePageFromUrl', () => {
  test('extrait le titre de fichier d’une page /wiki/File:', () => {
    expect(parseCommonsFilePageFromUrl('https://commons.wikimedia.org/wiki/File:Rosa_canina.jpg')).toBe(
      'Rosa_canina.jpg'
    );
    expect(parseCommonsFilePageFromUrl('https://www.commons.wikimedia.org/wiki/File:A.png')).toBe('A.png');
  });
  test('null hors Commons / hors page fichier / non-URL', () => {
    expect(parseCommonsFilePageFromUrl('https://x.fr/wiki/File:A.png')).toBe(null);
    expect(parseCommonsFilePageFromUrl('https://commons.wikimedia.org/wiki/Category:Foo')).toBe(null);
    expect(parseCommonsFilePageFromUrl('pas une url')).toBe(null);
  });
});

describe('commonsFilePageToDisplaySrc', () => {
  test('page fichier → URL Special:FilePath', () => {
    expect(commonsFilePageToDisplaySrc('https://commons.wikimedia.org/wiki/File:Rosa.jpg')).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/Rosa.jpg'
    );
    expect(commonsFilePageToDisplaySrc('https://x.fr/a.jpg')).toBe(null);
  });
});

describe('parseCommonsCategoryFromUrl', () => {
  test('extrait + décode le titre de catégorie', () => {
    expect(parseCommonsCategoryFromUrl('https://commons.wikimedia.org/wiki/Category:Rosa%20canina')).toBe(
      'Category:Rosa canina'
    );
    expect(parseCommonsCategoryFromUrl('https://commons.wikimedia.org/wiki/File:A.png')).toBe(null);
    expect(parseCommonsCategoryFromUrl('http://x.fr')).toBe(null);
  });
});

describe('getSourceLabel', () => {
  test('libellé court selon la nature de la source', () => {
    expect(getSourceLabel('/uploads/a.png')).toBe('fichier local');
    expect(getSourceLabel('https://www.inpn.mnhn.fr/page')).toBe('inpn.mnhn.fr');
    expect(getSourceLabel('texte libre')).toBe('texte libre');
  });
});
