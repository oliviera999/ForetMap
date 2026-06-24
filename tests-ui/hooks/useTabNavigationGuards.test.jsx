import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useTabNavigationGuards } from '../../src/hooks/useTabNavigationGuards';

const baseProps = {
  tab: 'map',
  setTab: () => {},
  effectiveIsTeacher: false,
  canAccessStudentMapTasks: true,
  shouldUseDesktopSplit: true,
  canAccessForum: true,
  canViewGeneralStats: true,
  mergeTasksTutoNav: false,
  modules: {},
};

const run = (overrides) => {
  const setTab = vi.fn();
  renderHook(() => useTabNavigationGuards({ ...baseProps, setTab, ...overrides }));
  return setTab;
};

describe('useTabNavigationGuards', () => {
  it('ne redirige pas quand l’onglet courant reste valide', () => {
    const setTab = run({ tab: 'map' });
    expect(setTab).not.toHaveBeenCalled();
  });

  it('renvoie un visiteur sans accès carte/tâches vers visit', () => {
    const setTab = run({ tab: 'tasks', canAccessStudentMapTasks: false, isVisitor: true });
    expect(setTab).toHaveBeenCalledWith('visit');
  });

  it('renvoie un élève sans accès carte/tâches vers plants', () => {
    const setTab = run({ tab: 'tasks', canAccessStudentMapTasks: false, isVisitor: false });
    expect(setTab).toHaveBeenCalledWith('plants');
  });

  it('laisse un prof sur map/tasks même sans accès élève', () => {
    const setTab = run({ tab: 'tasks', effectiveIsTeacher: true, canAccessStudentMapTasks: false });
    expect(setTab).not.toHaveBeenCalledWith('plants');
  });

  it('replie maptasks vers map hors écran large', () => {
    const setTab = run({ tab: 'maptasks', shouldUseDesktopSplit: false });
    expect(setTab).toHaveBeenCalledWith('map');
  });

  it('replie un onglet de module désactivé vers map', () => {
    const setTab = run({ tab: 'visit', modules: { visit_enabled: false } });
    expect(setTab).toHaveBeenCalledWith('map');
  });

  it('replie forum vers about quand le forum est inaccessible', () => {
    const setTab = run({ tab: 'forum', canAccessForum: false });
    expect(setTab).toHaveBeenCalledWith('about');
  });

  it('replie stats vers map quand l’accès stats manque', () => {
    const setTab = run({ tab: 'stats', canViewGeneralStats: false });
    expect(setTab).toHaveBeenCalledWith('map');
  });

  it('bascule tuto vers tasks quand la fusion Tâches&tuto est active', () => {
    const setTab = run({ tab: 'tuto', mergeTasksTutoNav: true });
    expect(setTab).toHaveBeenCalledWith('tasks');
  });

  it('replie media_library vers about pour un non-prof', () => {
    const setTab = run({ tab: 'media_library', effectiveIsTeacher: false });
    expect(setTab).toHaveBeenCalledWith('about');
  });
});
