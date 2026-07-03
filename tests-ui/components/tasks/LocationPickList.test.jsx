import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  LocationPickList,
  filterSelectableZones,
  filterSelectableMarkers,
  toggledLocationIds,
} from '../../../src/components/tasks/LocationPickList.jsx';

const ZONES = [
  { id: 'z1', name: 'Mare', map_id: 'foret' },
  { id: 'z2', name: 'Potager', map_id: 'jardin' },
  { id: 'z3', name: 'Spéciale', map_id: 'foret', special: true },
];
const MARKERS = [
  { id: 'm1', label: 'Ruche', emoji: '🐝', map_id: 'foret' },
  { id: 'm2', label: 'Composteur', map_id: 'jardin' },
];

function renderList(overrides = {}) {
  const onToggleZone = vi.fn();
  const onToggleMarker = vi.fn();
  render(
    <LocationPickList
      zones={[ZONES[0], ZONES[1]]}
      markers={MARKERS}
      selectedZoneIds={[]}
      selectedMarkerIds={[]}
      onToggleZone={onToggleZone}
      onToggleMarker={onToggleMarker}
      zoneLabel={(z) => z.name}
      {...overrides}
    />,
  );
  return { onToggleZone, onToggleMarker };
}

describe('LocationPickList', () => {
  test('liste zones et repères avec sous-titres quand les deux types sont présents', () => {
    renderList();
    expect(screen.getByText('Zones')).toBeTruthy();
    expect(screen.getByText('Repères')).toBeTruthy();
    expect(screen.getByLabelText('Mare')).toBeTruthy();
    expect(screen.getByLabelText('🐝 Ruche')).toBeTruthy();
  });

  test('pas de sous-titres quand un seul type est présent', () => {
    renderList({ markers: [] });
    expect(screen.queryByText('Zones')).toBeNull();
    expect(screen.queryByText('Repères')).toBeNull();
    expect(screen.getByLabelText('Mare')).toBeTruthy();
  });

  test('repère sans emoji : repli 📍 par défaut', () => {
    renderList({ zones: [] });
    expect(screen.getByLabelText('📍 Composteur')).toBeTruthy();
  });

  test('markerLabel personnalisé (comportement tutoriel, sans repli)', () => {
    renderList({
      zones: [],
      markers: [MARKERS[0]],
      markerLabel: (m) => (
        <>
          {m.emoji} {m.label}
        </>
      ),
    });
    expect(screen.getByLabelText('🐝 Ruche')).toBeTruthy();
  });

  test('texte vide par défaut et personnalisable', () => {
    renderList({ zones: [], markers: [] });
    expect(screen.getByText('Aucune zone ni repère pour cette carte.')).toBeTruthy();
  });

  test('texte vide personnalisé', () => {
    renderList({ zones: [], markers: [], emptyText: 'Aucune zone ni repère pour ce filtre.' });
    expect(screen.getByText('Aucune zone ni repère pour ce filtre.')).toBeTruthy();
  });

  test('cases cochées selon la sélection, toggles appelés avec l’id brut', () => {
    const { onToggleZone, onToggleMarker } = renderList({
      selectedZoneIds: ['z1'],
      selectedMarkerIds: ['m2'],
    });
    expect(screen.getByLabelText('Mare').checked).toBe(true);
    expect(screen.getByLabelText('Potager').checked).toBe(false);
    expect(screen.getByLabelText('📍 Composteur').checked).toBe(true);
    fireEvent.click(screen.getByLabelText('Potager'));
    expect(onToggleZone).toHaveBeenCalledWith('z2');
    fireEvent.click(screen.getByLabelText('🐝 Ruche'));
    expect(onToggleMarker).toHaveBeenCalledWith('m1');
  });

  test('sélection avec ids numériques (normalisation en chaîne)', () => {
    renderList({ zones: [{ id: 5, name: 'Serre', map_id: 'foret' }], selectedZoneIds: [5] });
    expect(screen.getByLabelText('Serre').checked).toBe(true);
  });
});

describe('filterSelectableZones / filterSelectableMarkers', () => {
  test('zones : exclut les spéciales et filtre par carte', () => {
    expect(filterSelectableZones(ZONES, 'foret').map((z) => z.id)).toEqual(['z1']);
    expect(filterSelectableZones(ZONES, '').map((z) => z.id)).toEqual(['z1', 'z2']);
  });

  test('repères : filtre par carte, tous si carte vide', () => {
    expect(filterSelectableMarkers(MARKERS, 'jardin').map((m) => m.id)).toEqual(['m2']);
    expect(filterSelectableMarkers(MARKERS, '').map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('toggledLocationIds', () => {
  test('ajoute un id absent, retire un id présent', () => {
    expect(toggledLocationIds(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggledLocationIds(['a', 'b'], 'a')).toEqual(['b']);
  });

  test('trim de l’id, null si id vide', () => {
    expect(toggledLocationIds([], ' z1 ')).toEqual(['z1']);
    expect(toggledLocationIds(['a'], '')).toBe(null);
    expect(toggledLocationIds(['a'], '   ')).toBe(null);
    expect(toggledLocationIds(['a'], null)).toBe(null);
  });
});
