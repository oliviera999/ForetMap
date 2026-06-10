import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../../../src/services/api.js';
import { VisitSyncPanel } from '../../../src/components/visit/VisitSyncPanel.jsx';

vi.mock('../../../src/services/api.js', () => ({
  api: vi.fn(async () => ({})),
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

const OPTIONS = {
  source: {
    map: {
      zones: [{ id: 1, name: 'Verger' }, { id: 2, name: 'Mare' }],
      markers: [{ id: 10, label: 'Pommier' }],
    },
    visit: { zones: [], markers: [] },
  },
};

let alertSpy;
beforeEach(() => {
  api.mockReset();
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  alertSpy.mockRestore();
});

describe('VisitSyncPanel', () => {
  test('non enseignant → ne rend rien', () => {
    const { container } = render(<VisitSyncPanel isTeacher={false} mapId={3} />);
    expect(container).toBeEmptyDOMElement();
    expect(api).not.toHaveBeenCalled();
  });

  test('enseignant : charge les options et coche tout par défaut', async () => {
    api.mockResolvedValueOnce(OPTIONS);
    render(<VisitSyncPanel isTeacher mapId={3} />);
    expect(api).toHaveBeenCalledWith('/api/visit/sync/options?map_id=3');
    expect(await screen.findByText('Zones (2)')).toBeInTheDocument();
    expect(screen.getByText('Repères (1)')).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes.every((c) => c.checked)).toBe(true);
  });

  test('décocher une zone puis « Tout cocher » la recoche', async () => {
    api.mockResolvedValue(OPTIONS);
    render(<VisitSyncPanel isTeacher mapId={3} />);
    await screen.findByText('Zones (2)');
    const vergerCb = screen.getByLabelText('Verger', { exact: false });
    fireEvent.click(vergerCb);
    expect(vergerCb.checked).toBe(false);
    fireEvent.click(screen.getByText('Tout cocher'));
    expect(screen.getByLabelText('Verger', { exact: false }).checked).toBe(true);
  });

  test('« Lancer l’import » POST le sens et les ids sélectionnés', async () => {
    api.mockResolvedValueOnce(OPTIONS); // chargement initial
    api.mockResolvedValueOnce({ imported: { zones: 2, markers: 1 } }); // sync
    api.mockResolvedValueOnce(OPTIONS); // rechargement post-sync
    const onSynced = vi.fn();
    render(<VisitSyncPanel isTeacher mapId={3} onSynced={onSynced} />);
    await screen.findByText('Zones (2)');
    fireEvent.click(screen.getByText('Lancer l’import sélectionné'));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/api/visit/sync', 'POST', {
        map_id: 3,
        direction: 'map_to_visit',
        zone_ids: [1, 2],
        marker_ids: [10],
      });
    });
    await waitFor(() => expect(onSynced).toHaveBeenCalled());
  });
});
