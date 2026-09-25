// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * Champ « Séance pédagogique liée » du formulaire de tâche : il suit l'interrupteur
 * `ui.modules.pedago_sessions_enabled` lu dans le contexte des réglages publics.
 */

const apiMock = vi.fn();
vi.mock('../../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
}));

const { TaskFormPedagoSessionField } =
  await import('../../../src/components/tasks/TaskFormPedagoSessionField.jsx');
const { PublicSettingsProvider } = await import('../../../src/contexts/PublicSettingsContext.jsx');

function renderWithModules(modules, props = {}) {
  return render(
    <PublicSettingsProvider value={{ modules }}>
      <TaskFormPedagoSessionField value="" onChange={vi.fn()} {...props} />
    </PublicSettingsProvider>,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue({ items: [{ id: 's1', title: 'Qui mange qui' }] });
});

describe('TaskFormPedagoSessionField', () => {
  it('module allumé (défaut) : liste les séances publiées', async () => {
    renderWithModules({});
    expect(await screen.findByRole('option', { name: 'Qui mange qui' })).toBeTruthy();
    expect(apiMock).toHaveBeenCalledWith('/api/pedago-sessions');
  });

  it('module allumé : pas d’avertissement', async () => {
    renderWithModules({});
    await screen.findByRole('option', { name: 'Qui mange qui' });
    expect(screen.queryByTestId('task-form-pedago-session-off')).toBeNull();
  });

  it('module éteint : champ conservé pour le prof, avec avertissement ; lien existant gardé', async () => {
    renderWithModules({ pedago_sessions_enabled: false }, { value: 'seance-deja-liee' });
    expect(await screen.findByRole('option', { name: 'Qui mange qui' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Séance actuelle' })).toBeTruthy();
    expect(screen.getByLabelText('Séance pédagogique liée').value).toBe('seance-deja-liee');
    expect(screen.getByTestId('task-form-pedago-session-off').textContent).toMatch(
      /désactivées pour les élèves/,
    );
  });

  it('module éteint, prof sans droit de gestion des séances (503) : liste vide, lien gardé', async () => {
    apiMock.mockRejectedValue(new Error('Séances pédagogiques désactivées'));
    renderWithModules({ pedago_sessions_enabled: false }, { value: 'seance-deja-liee' });
    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    expect(screen.getByRole('option', { name: 'Séance actuelle' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Qui mange qui' })).toBeNull();
  });
});
