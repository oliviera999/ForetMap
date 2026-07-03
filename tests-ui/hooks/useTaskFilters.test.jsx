import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useTaskFilters } from '../../src/hooks/useTaskFilters.js';

function setup(initialProps = { activeMapId: 'foret', mapLocationFocus: null }) {
  return renderHook(
    ({ activeMapId, mapLocationFocus }) => useTaskFilters(activeMapId, mapLocationFocus),
    { initialProps },
  );
}

describe('useTaskFilters', () => {
  it('valeurs par défaut : filtres vides, carte « active », statut non touché', () => {
    const { result } = setup();
    expect(result.current.filterText).toBe('');
    expect(result.current.filterZone).toBe('');
    expect(result.current.filterStatus).toBe('');
    expect(result.current.hasTouchedStatusFilter).toBe(false);
    expect(result.current.filterMap).toBe('active');
    expect(result.current.filterProject).toBe('');
    expect(result.current.filterGroupId).toBe('');
    expect(result.current.filterUrgentCategory).toBe('');
  });

  it('un focus carte présélectionne le filtre lieu (`kind:id`)', () => {
    const { result, rerender } = setup();
    rerender({ activeMapId: 'foret', mapLocationFocus: { kind: 'zone', id: 7 } });
    expect(result.current.filterZone).toBe('zone:7');
    rerender({ activeMapId: 'foret', mapLocationFocus: { kind: 'marker', id: 3 } });
    expect(result.current.filterZone).toBe('marker:3');
  });

  it('focus retiré (null) : le filtre lieu choisi par l’utilisateur est conservé', () => {
    const { result, rerender } = setup({
      activeMapId: 'foret',
      mapLocationFocus: { kind: 'zone', id: 7 },
    });
    expect(result.current.filterZone).toBe('zone:7');
    rerender({ activeMapId: 'foret', mapLocationFocus: null });
    expect(result.current.filterZone).toBe('zone:7');
  });

  it('un changement de carte active ramène le filtre carte sur « active »', () => {
    const { result, rerender } = setup();
    act(() => result.current.setFilterMap('all'));
    expect(result.current.filterMap).toBe('all');
    rerender({ activeMapId: 'verger', mapLocationFocus: null });
    expect(result.current.filterMap).toBe('active');
  });

  it('les setters exposés pilotent bien chaque filtre', () => {
    const { result } = setup();
    act(() => {
      result.current.setFilterText('houx');
      result.current.setFilterStatus('done');
      result.current.setHasTouchedStatusFilter(true);
      result.current.setFilterProject('12');
      result.current.setFilterGroupId('3');
      result.current.setFilterUrgentCategory('urgent');
      result.current.setFilterZone('zone:1');
    });
    expect(result.current.filterText).toBe('houx');
    expect(result.current.filterStatus).toBe('done');
    expect(result.current.hasTouchedStatusFilter).toBe(true);
    expect(result.current.filterProject).toBe('12');
    expect(result.current.filterGroupId).toBe('3');
    expect(result.current.filterUrgentCategory).toBe('urgent');
    expect(result.current.filterZone).toBe('zone:1');
  });
});
