import { describe, test, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGLZoneMusicArrival } from '../../src/gl/hooks/useGLZoneMusicArrival.js';

const ZONE_POINTS = [
  { x: 40, y: 40 },
  { x: 60, y: 40 },
  { x: 60, y: 60 },
  { x: 40, y: 60 },
];
const MUSIC_ZONE = {
  id: 9,
  points: ZONE_POINTS,
  music_url: 'https://audio/foret.mp3',
  music_volume: 0.5,
};

function team(x, y) {
  return { id: 1, position_x_pct: x, position_y_pct: y };
}

function setup(initialProps) {
  return renderHook((props) => useGLZoneMusicArrival(props), { initialProps });
}

describe('useGLZoneMusicArrival', () => {
  test('déclenche onZoneMusicEnter quand une équipe entre dans une zone musicale', () => {
    const onZoneMusicEnter = vi.fn();
    const { rerender } = setup({
      teams: [team(10, 10)],
      kingdomZones: [MUSIC_ZONE],
      enabled: true,
      onZoneMusicEnter,
    });

    // Premier rendu : position de référence, pas de déclenchement.
    expect(onZoneMusicEnter).not.toHaveBeenCalled();

    rerender({
      teams: [team(50, 50)],
      kingdomZones: [MUSIC_ZONE],
      enabled: true,
      onZoneMusicEnter,
    });

    expect(onZoneMusicEnter).toHaveBeenCalledTimes(1);
    expect(onZoneMusicEnter).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 9,
        musicUrl: 'https://audio/foret.mp3',
        musicVolume: 0.5,
      }),
    );
  });

  test('ne se redéclenche pas sur une position identique', () => {
    const onZoneMusicEnter = vi.fn();
    const { rerender } = setup({
      teams: [team(10, 10)],
      kingdomZones: [MUSIC_ZONE],
      enabled: true,
      onZoneMusicEnter,
    });

    rerender({
      teams: [team(10, 10)],
      kingdomZones: [MUSIC_ZONE],
      enabled: true,
      onZoneMusicEnter,
    });

    expect(onZoneMusicEnter).not.toHaveBeenCalled();
  });

  test('ne se redéclenche pas lors d’un déplacement intra-zone', () => {
    const onZoneMusicEnter = vi.fn();
    const { rerender } = setup({
      teams: [team(10, 10)],
      kingdomZones: [MUSIC_ZONE],
      enabled: true,
      onZoneMusicEnter,
    });

    rerender({
      teams: [team(50, 50)],
      kingdomZones: [MUSIC_ZONE],
      enabled: true,
      onZoneMusicEnter,
    });
    rerender({
      teams: [team(55, 55)],
      kingdomZones: [MUSIC_ZONE],
      enabled: true,
      onZoneMusicEnter,
    });

    expect(onZoneMusicEnter).toHaveBeenCalledTimes(1);
  });

  test('inactif quand enabled=false, et repart d’une position de référence à la réactivation', () => {
    const onZoneMusicEnter = vi.fn();
    const { rerender } = setup({
      teams: [team(10, 10)],
      kingdomZones: [MUSIC_ZONE],
      enabled: false,
      onZoneMusicEnter,
    });

    rerender({
      teams: [team(50, 50)],
      kingdomZones: [MUSIC_ZONE],
      enabled: false,
      onZoneMusicEnter,
    });
    expect(onZoneMusicEnter).not.toHaveBeenCalled();

    // Réactivation : la première passe re-crée la référence, sans déclenchement.
    rerender({
      teams: [team(50, 50)],
      kingdomZones: [MUSIC_ZONE],
      enabled: true,
      onZoneMusicEnter,
    });
    expect(onZoneMusicEnter).not.toHaveBeenCalled();

    // Sortie puis retour dans la zone : déclenchement.
    rerender({
      teams: [team(10, 10)],
      kingdomZones: [MUSIC_ZONE],
      enabled: true,
      onZoneMusicEnter,
    });
    rerender({
      teams: [team(50, 50)],
      kingdomZones: [MUSIC_ZONE],
      enabled: true,
      onZoneMusicEnter,
    });
    expect(onZoneMusicEnter).toHaveBeenCalledTimes(1);
  });

  test('ignore une zone sans musique', () => {
    const onZoneMusicEnter = vi.fn();
    const silentZone = { id: 11, points: ZONE_POINTS };
    const { rerender } = setup({
      teams: [team(10, 10)],
      kingdomZones: [silentZone],
      enabled: true,
      onZoneMusicEnter,
    });

    rerender({
      teams: [team(50, 50)],
      kingdomZones: [silentZone],
      enabled: true,
      onZoneMusicEnter,
    });

    expect(onZoneMusicEnter).not.toHaveBeenCalled();
  });
});
