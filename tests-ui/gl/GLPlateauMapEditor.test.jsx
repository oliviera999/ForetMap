import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GLPlateauMapEditor } from '../../src/gl/components/GLPlateauMapEditor.jsx';

describe('GLPlateauMapEditor', () => {
  const zones = [
    {
      zoneId: 'zf-p1-01',
      plateau: 1,
      titre: 'Zone test',
      centreXp: 10,
      centreYp: 20,
      points: [
        { x: 8, y: 18 },
        { x: 12, y: 18 },
        { x: 10, y: 22 },
      ],
      feuilletCode: 'F01',
      popover: 'Texte',
      coutGemme: 0,
      gainCoeur: 0,
    },
  ];

  let onZonesChange;
  let handleMapClick;

  beforeEach(() => {
    onZonesChange = vi.fn();
    handleMapClick = null;
  });

  function renderEditor(extra = {}) {
    return render(
      <GLPlateauMapEditor
        zones={zones}
        onZonesChange={onZonesChange}
        mapGestures={{}}
        plateauNumber={1}
        showMarkers={false}
        onPlacementReady={(handlers) => {
          handleMapClick = handlers.handleMapClick;
        }}
        {...extra}
      />,
    );
  }

  test('déplace la zone sélectionnée au clic carte', async () => {
    renderEditor();
    await waitFor(() => {
      expect(handleMapClick).toBeTypeOf('function');
    });
    const placed = handleMapClick(
      { x: 30, y: 40 },
      { target: { closest: () => null } },
    );
    expect(placed).toBe(true);
    expect(onZonesChange).toHaveBeenCalledTimes(1);
    const nextZones = onZonesChange.mock.calls[0][0];
    expect(nextZones[0].centreXp).toBe(30);
    expect(nextZones[0].centreYp).toBe(40);
  });

  test('affiche la liste des repères quand showMarkers', () => {
    renderEditor({
      showMarkers: true,
      markers: [{ id: 7, label: 'Repère A', x_pct: 12, y_pct: 34 }],
    });
    expect(screen.getByText('Repère A')).toBeTruthy();
  });
});
