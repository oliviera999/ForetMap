import { describe, test, expect } from 'vitest';

import {
  GL_AUTH_TAGLINES,
  GL_AUTH_BASELINE,
  GL_AUTH_BACK_COVER,
  GL_AUTH_CTA_LABEL,
  pickGlAuthTagline,
} from '../../src/gl/constants/authCover.js';
import { findForbiddenString } from '../../src/shared/glGardeFousCore.js';

describe('authCover (page de garde GL)', () => {
  test('expose trois accroches, une par registre', () => {
    expect(GL_AUTH_TAGLINES).toHaveLength(3);
    expect(GL_AUTH_TAGLINES.map((t) => t.registre)).toEqual([
      'Mystère',
      'Mission',
      'Émerveillement',
    ]);
    for (const tagline of GL_AUTH_TAGLINES) {
      expect(typeof tagline.text).toBe('string');
      expect(tagline.text.length).toBeGreaterThan(0);
    }
  });

  test('CTA et baseline conformes au lore', () => {
    expect(GL_AUTH_CTA_LABEL).toBe('Franchir le miroir');
    expect(GL_AUTH_BASELINE).toMatch(/équateur au pôle/i);
    // Décision du 20/11 : la phrase d'appel tutoie et ne nomme plus le Souffle comme une force.
    expect(GL_AUTH_BASELINE).toBe(
      "De l'équateur au pôle, réécris le monde vivant avant qu'il ne s'efface.",
    );
  });

  test('accroche « mission » : quatre mondes, comme les quatre plateaux', () => {
    const mission = GL_AUTH_TAGLINES.find((t) => t.id === 'mission');
    expect(mission.text).toBe('Quatre mondes, une année, un carnet à sauver.');
  });

  test('quatrième de couverture : trois paragraphes fidèles au lore (~85 mots)', () => {
    expect(Array.isArray(GL_AUTH_BACK_COVER)).toBe(true);
    expect(GL_AUTH_BACK_COVER).toHaveLength(3);
    const full = GL_AUTH_BACK_COVER.join(' ');
    expect(full).toMatch(/équateur au pôle Nord/i);
    expect(full).toMatch(/le Souffle/);
    expect(full).toMatch(/Franchis le miroir/);
    expect(full).toMatch(/sous le Souffle, le monde se dessèche/);
    expect(full).toMatch(/Gnome/);
    expect(full).toMatch(/Licorne/);
    const words = full.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(70);
    expect(words).toBeLessThanOrEqual(100);
  });

  test('la connexion tutoie et ne personnifie pas le Souffle', () => {
    const textes = [
      GL_AUTH_BASELINE,
      ...GL_AUTH_BACK_COVER,
      ...GL_AUTH_TAGLINES.map((t) => t.text),
    ];
    for (const texte of textes) {
      expect(texte).not.toMatch(/(^|[^\p{L}])(vous|votre|vos)(?=[^\p{L}]|$)/iu);
      expect(texte).not.toMatch(/[a-zéèê]{3,}ez(?=[^\p{L}]|$)/iu);
      expect(texte).not.toMatch(/ronge|une force/i);
      expect(findForbiddenString(texte)).toBeNull();
    }
  });

  test('pickGlAuthTagline couvre tout l’éventail selon le tirage', () => {
    expect(pickGlAuthTagline(() => 0)).toBe(GL_AUTH_TAGLINES[0]);
    expect(pickGlAuthTagline(() => 0.5)).toBe(GL_AUTH_TAGLINES[1]);
    expect(pickGlAuthTagline(() => 0.999)).toBe(GL_AUTH_TAGLINES[2]);
  });

  test('pickGlAuthTagline borne les valeurs hors plage', () => {
    expect(pickGlAuthTagline(() => 1)).toBe(GL_AUTH_TAGLINES[2]);
    expect(pickGlAuthTagline(() => -1)).toBe(GL_AUTH_TAGLINES[0]);
    expect(pickGlAuthTagline(() => Number.NaN)).toBe(GL_AUTH_TAGLINES[0]);
  });

  test('sans argument, retourne une accroche valide du référentiel', () => {
    expect(GL_AUTH_TAGLINES).toContain(pickGlAuthTagline());
  });
});
