import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGLKingdomZoneEditor } from '../../src/gl/hooks/useGLKingdomZoneEditor.js';

const AUDIO_A = '/uploads/media-library/audio/a.mp3';
const AUDIO_B = '/uploads/media-library/audio/b.mp3';

function makeZone(overrides = {}) {
  return {
    id: 5,
    label: 'Nord',
    color: '#22c55e',
    points: [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ],
    musicUrls: [],
    ...overrides,
  };
}

describe('useGLKingdomZoneEditor — l’autovalidation ne doit pas écraser le brouillon en cours', () => {
  test('un reload de la même zone (nouvelle référence, même id) ne réinitialise pas draftMusicUrls', () => {
    const zoneV1 = makeZone();
    const { result, rerender } = renderHook(
      ({ zones }) => useGLKingdomZoneEditor({ zones, zoneMusicEnabled: true }),
      { initialProps: { zones: [zoneV1] } },
    );

    act(() => {
      result.current.selectZone(5);
    });
    // L'utilisateur ajoute une piste puis sélectionne une URL via la bibliothèque.
    act(() => {
      result.current.setDraftMusicUrls([AUDIO_A]);
    });
    expect(result.current.draftMusicUrls).toEqual([AUDIO_A]);

    // reload() post-autosave : nouvel objet zone (même id), contenu serveur encore vide.
    rerender({ zones: [makeZone()] });

    // Régression « le menu se replie / la piste ne s'applique pas » : le brouillon survit.
    expect(result.current.draftMusicUrls).toEqual([AUDIO_A]);
  });

  test('changer de zone sélectionnée recharge bien les brouillons depuis la zone', () => {
    const zoneA = makeZone({ id: 1, label: 'A', musicUrls: [AUDIO_A] });
    const zoneB = makeZone({ id: 2, label: 'B', musicUrls: [AUDIO_B] });
    const { result } = renderHook(() =>
      useGLKingdomZoneEditor({ zones: [zoneA, zoneB], zoneMusicEnabled: true }),
    );

    act(() => {
      result.current.selectZone(1);
    });
    expect(result.current.draftMusicUrls).toEqual([AUDIO_A]);
    expect(result.current.draftLabel).toBe('A');

    act(() => {
      result.current.selectZone(2);
    });
    expect(result.current.draftMusicUrls).toEqual([AUDIO_B]);
    expect(result.current.draftLabel).toBe('B');
  });

  test('désélectionner puis re-sélectionner la même zone recharge la valeur serveur', () => {
    const { result, rerender } = renderHook(
      ({ zones }) => useGLKingdomZoneEditor({ zones, zoneMusicEnabled: true }),
      { initialProps: { zones: [makeZone({ musicUrls: [AUDIO_A] })] } },
    );

    act(() => {
      result.current.selectZone(5);
    });
    expect(result.current.draftMusicUrls).toEqual([AUDIO_A]);

    // Désélection : cancelDrawMode réinitialise selectedZoneId à null.
    act(() => {
      result.current.cancelDrawMode();
    });
    expect(result.current.selectedZone).toBeNull();

    rerender({ zones: [makeZone({ musicUrls: [AUDIO_B] })] });
    act(() => {
      result.current.selectZone(5);
    });
    expect(result.current.draftMusicUrls).toEqual([AUDIO_B]);
  });
});
