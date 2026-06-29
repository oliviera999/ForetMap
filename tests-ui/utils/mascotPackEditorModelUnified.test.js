import { describe, test, expect } from 'vitest';
import { packToUnifiedForm } from '../../src/utils/mascotPackEditorModel.js';
import { validateMascotPackV1 } from '../../src/utils/mascotPack.js';

describe('packToUnifiedForm', () => {
  const pack = {
    mascotPackVersion: 1,
    id: 'u',
    label: 'U',
    renderer: 'sprite_cut',
    framesBase: '/assets/mascots/u/frames/',
    frameWidth: 16,
    frameHeight: 16,
    fallbackSilhouette: 'gnome',
    customStates: [{ key: 'magie', label: 'Magie' }],
    stateAliases: { magie: 'idle' },
    stateFrames: {
      idle: { files: ['a.png'], fps: 2 },
      magie: { files: ['m.png'], fps: 8 },
    },
  };

  test('remplace stateFrames/customStates par states[], conserve le reste', () => {
    const out = packToUnifiedForm(pack);
    expect(out.stateFrames).toBeUndefined();
    expect(out.customStates).toBeUndefined();
    expect(Array.isArray(out.states)).toBe(true);
    expect(out.stateAliases).toEqual({ magie: 'idle' });
    const magie = out.states.find((s) => s.key === 'magie');
    expect(magie).toMatchObject({ key: 'magie', label: 'Magie', files: ['m.png'], fps: 8 });
  });

  test('round-trip : la forme unifiée revalide à l’identique', () => {
    const unified = packToUnifiedForm(pack);
    const r = validateMascotPackV1(unified, { relaxAssetPrefix: false });
    expect(r.ok).toBe(true);
    expect(r.spriteCut.stateFrames.idle).toBeTruthy();
    expect(r.spriteCut.stateFrames.magie).toBeTruthy();
    expect(r.pack.customStates[0].key).toBe('magie');
  });
});
