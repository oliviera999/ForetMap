// @vitest-environment jsdom
//
// A3 — enregistrement automatique de la fiche biodiversité, en **édition seule**.
//
// La garde vérifiée ici est la mitigation décidée pour A3 : en création, aucune
// requête ne doit partir tant que l'utilisateur n'a pas cliqué « Sauvegarder »
// (sinon une fiche à moitié remplie serait publiée). En édition, la fiche existe
// déjà : l'autosave ne fait que la mettre à jour, sans refermer l'éditeur.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(async () => ({})),
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

const { api } = await import('../../src/services/api');
const { useDebouncedAutoSave } = await import('../../src/shared/hooks/useDebouncedAutoSave.js');

/**
 * Reproduit le câblage exact de `PlantManager` : autosave actif uniquement
 * quand `editId` est renseigné, persistance qui ne referme pas l'éditeur, et
 * baseline sur le formulaire *envoyé*.
 */
function PlantAutoSaveHarness({ editId }) {
  const [form, setForm] = React.useState({ name: 'Noyer', remark_1: '' });
  const onRefresh = React.useCallback(async () => {}, []);

  const autoSavePersist = React.useCallback(async () => {
    const sent = form;
    await api(`/api/plants/${editId}`, 'PUT', sent);
    await onRefresh();
    return sent;
  }, [editId, form, onRefresh]);

  const { status } = useDebouncedAutoSave({
    value: form,
    resetKey: editId ? `plant:${editId}` : 'none',
    enabled: Boolean(editId) && form.name.trim().length > 0,
    onSave: autoSavePersist,
  });

  return (
    <div>
      <input
        aria-label="remarque"
        value={form.remark_1}
        onChange={(e) => setForm((f) => ({ ...f, remark_1: e.target.value }))}
      />
      <span data-testid="status">{status}</span>
    </div>
  );
}

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async () => ({}));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('fiche biodiversité — autosave en édition seule', () => {
  it('en création (aucun id), aucune requête n’est émise malgré la saisie', async () => {
    render(<PlantAutoSaveHarness editId={null} />);

    fireEvent.change(screen.getByLabelText('remarque'), { target: { value: 'saisie en cours' } });

    // Largement au-delà du debounce (800 ms) : rien ne doit partir.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
    expect(api).not.toHaveBeenCalled();
  });

  it('en édition, la saisie déclenche un PUT sur la fiche existante', async () => {
    render(<PlantAutoSaveHarness editId={42} />);

    fireEvent.change(screen.getByLabelText('remarque'), { target: { value: 'note du prof' } });

    await waitFor(
      () =>
        expect(api).toHaveBeenCalledWith(
          '/api/plants/42',
          'PUT',
          expect.objectContaining({ remark_1: 'note du prof' }),
        ),
      { timeout: 3000 },
    );
  });

  it('une frappe saisie pendant la requête en vol repart au tour suivant', async () => {
    let resolvePut;
    api.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePut = () => resolve({});
        }),
    );
    render(<PlantAutoSaveHarness editId={42} />);

    fireEvent.change(screen.getByLabelText('remarque'), { target: { value: 'premier jet' } });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1), { timeout: 3000 });

    // Le prof continue de taper alors que le PUT n'est pas encore résolu.
    fireEvent.change(screen.getByLabelText('remarque'), { target: { value: 'jet complété' } });
    await act(async () => {
      resolvePut();
    });

    await waitFor(
      () =>
        expect(api).toHaveBeenCalledWith(
          '/api/plants/42',
          'PUT',
          expect.objectContaining({ remark_1: 'jet complété' }),
        ),
      { timeout: 3000 },
    );
  });
});
