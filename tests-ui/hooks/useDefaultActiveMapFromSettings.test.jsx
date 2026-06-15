import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useDefaultActiveMapFromSettings } from '../../src/hooks/useDefaultActiveMapFromSettings';

const MAP_KEY = 'foretmap_active_map';

const publicSettings = {
  map: {
    default_map_student: 'mapStudent',
    default_map_teacher: 'mapTeacher',
    default_map_visit: 'mapVisit',
  },
};

describe('useDefaultActiveMapFromSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('ne fait rien tant que les réglages publics ne sont pas prêts', () => {
    const setActiveMapId = vi.fn();
    renderHook(() => useDefaultActiveMapFromSettings({
      publicSettingsReady: false,
      publicSettings,
      effectiveIsTeacher: false,
      showPublicVisit: false,
      setActiveMapId,
    }));
    expect(setActiveMapId).not.toHaveBeenCalled();
  });

  it('choisit la carte élève par défaut quand aucune carte n’est mémorisée', () => {
    const setActiveMapId = vi.fn();
    renderHook(() => useDefaultActiveMapFromSettings({
      publicSettingsReady: true,
      publicSettings,
      effectiveIsTeacher: false,
      showPublicVisit: false,
      setActiveMapId,
    }));
    expect(setActiveMapId).toHaveBeenCalledTimes(1);
    const updater = setActiveMapId.mock.calls[0][0];
    expect(updater('')).toBe('mapStudent');
  });

  it('choisit la carte prof par défaut en vue enseignant', () => {
    const setActiveMapId = vi.fn();
    renderHook(() => useDefaultActiveMapFromSettings({
      publicSettingsReady: true,
      publicSettings,
      effectiveIsTeacher: true,
      showPublicVisit: false,
      setActiveMapId,
    }));
    const updater = setActiveMapId.mock.calls[0][0];
    expect(updater('')).toBe('mapTeacher');
  });

  it('choisit la carte visite par défaut en mode visite invité (priorité sur le statut prof)', () => {
    const setActiveMapId = vi.fn();
    renderHook(() => useDefaultActiveMapFromSettings({
      publicSettingsReady: true,
      publicSettings,
      effectiveIsTeacher: true,
      showPublicVisit: true,
      setActiveMapId,
    }));
    const updater = setActiveMapId.mock.calls[0][0];
    expect(updater('')).toBe('mapVisit');
  });

  it('ne touche à rien si une carte est déjà mémorisée', () => {
    localStorage.setItem(MAP_KEY, 'mapDejaChoisie');
    const setActiveMapId = vi.fn();
    renderHook(() => useDefaultActiveMapFromSettings({
      publicSettingsReady: true,
      publicSettings,
      effectiveIsTeacher: false,
      showPublicVisit: false,
      setActiveMapId,
    }));
    expect(setActiveMapId).not.toHaveBeenCalled();
  });

  it('ne touche à rien si aucune carte par défaut n’est configurée', () => {
    const setActiveMapId = vi.fn();
    renderHook(() => useDefaultActiveMapFromSettings({
      publicSettingsReady: true,
      publicSettings: { map: {} },
      effectiveIsTeacher: false,
      showPublicVisit: false,
      setActiveMapId,
    }));
    expect(setActiveMapId).not.toHaveBeenCalled();
  });
});
