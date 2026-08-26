import { describe, test, expect } from 'vitest';
import { sanitizeMascotPackDraft } from '../../src/shared/mascot-pack/validationUi.js';
import { getPackStrictValidation } from '../../src/utils/visitMascotPackManager.js';

/**
 * `sanitizeMascotPackDraft` est le passage obligé du studio : l'éditeur y fait transiter le pack
 * à l'ouverture, à chaque validation d'aperçu et à l'enregistrement. Elle a donc un devoir simple
 * et absolu — **ne jamais rendre invalide un pack qui était valide**.
 *
 * Elle l'a pourtant fait : elle écrivait `stateFrames` sans regarder le moteur, posant un `{}` sur
 * les packs `rive` et `spritesheet`. La validation le refusait aussitôt (« Champ « stateFrames »
 * réservé aux packs « sprite_cut » »), et ces packs devenaient impossibles à enregistrer — l'erreur
 * s'affichant à l'ouverture, sans que personne ait rien modifié.
 *
 * D'où deux niveaux de garde ici : la propriété générale (le passage préserve la validité, quel que
 * soit le moteur), qui attrapera la prochaine fuite quel que soit le champ ; et la vérification que
 * la fonction fait toujours son travail sur `sprite_cut`, pour qu'on ne puisse pas la « réparer »
 * en la neutralisant.
 */

const PACK_ID = '00000000-0000-4000-8000-000000000001';

const PACK_RIVE = {
  mascotPackVersion: 1,
  id: 'test-rive',
  label: 'Test Rive',
  renderer: 'rive',
  fallbackSilhouette: 'gnome',
  rive: { src: '/assets/rive/test.riv', stateAnimations: { idle: ['idle'] } },
};

const PACK_SPRITESHEET = {
  mascotPackVersion: 1,
  id: 'test-sheet',
  label: 'Test Sheet',
  renderer: 'spritesheet',
  fallbackSilhouette: 'gnome',
  spritesheet: {
    src: `/api/visit/mascot-packs/${PACK_ID}/assets/sheet.png`,
    frameWidth: 32,
    frameHeight: 32,
    stateFrames: { idle: { row: 0, frames: 2, fps: 8 } },
  },
};

const PACK_SPRITE_CUT = {
  mascotPackVersion: 1,
  id: 'test-cut',
  label: 'Test Cut',
  renderer: 'sprite_cut',
  frameWidth: 32,
  frameHeight: 32,
  fallbackSilhouette: 'gnome',
  framesBase: `/api/visit/mascot-packs/${PACK_ID}/assets/`,
  stateFrames: { idle: { files: ['a.png'], fps: 8 } },
};

describe('sanitizeMascotPackDraft — le passage par le studio ne casse aucun moteur', () => {
  test.each([
    ['rive', PACK_RIVE],
    ['spritesheet', PACK_SPRITESHEET],
    ['sprite_cut', PACK_SPRITE_CUT],
  ])('un pack « %s » valide le reste après le studio', (_renderer, pack) => {
    expect(getPackStrictValidation(pack, PACK_ID).ok).toBe(true);
    expect(getPackStrictValidation(sanitizeMascotPackDraft(pack), PACK_ID).ok).toBe(true);
  });

  test.each([
    ['rive', PACK_RIVE],
    ['spritesheet', PACK_SPRITESHEET],
  ])('aucun `stateFrames` n’est injecté dans un pack « %s »', (_renderer, pack) => {
    expect(sanitizeMascotPackDraft(pack)).not.toHaveProperty('stateFrames');
  });

  test('un `stateFrames` hérité d’un pack non sprite_cut est retiré, pas conservé', () => {
    // Un JSON écrit à la main peut porter les deux : la validation le refuserait. Le brouillon
    // doit donc l'écarter, sinon le pack reste inenregistrable sans qu'on sache quoi corriger.
    const bancal = { ...PACK_RIVE, stateFrames: { idle: { files: ['a.png'], fps: 8 } } };
    expect(getPackStrictValidation(bancal, PACK_ID).ok).toBe(false);
    expect(getPackStrictValidation(sanitizeMascotPackDraft(bancal), PACK_ID).ok).toBe(true);
  });

  test('sur un pack sprite_cut, le nettoyage des états opère toujours', () => {
    // Garde-fou anti-« réparation par neutralisation » : la fonction doit continuer à normaliser
    // les fps et à écarter les états sans image.
    const brut = {
      ...PACK_SPRITE_CUT,
      stateFrames: {
        idle: { files: ['a.png'], fps: 0 },
        walking: { files: [] },
        happy: { files: ['  b.png  ', ''], fps: 12 },
      },
    };
    const propre = sanitizeMascotPackDraft(brut);
    expect(propre.stateFrames.idle.fps).toBe(8);
    expect(propre.stateFrames).not.toHaveProperty('walking');
    expect(propre.stateFrames.happy.files).toEqual(['b.png']);
  });
});
