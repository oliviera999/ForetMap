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

  it('module éteint : champ absent et aucun appel à l’API des séances', async () => {
    const { container } = renderWithModules(
      { pedago_sessions_enabled: false },
      { value: 'seance-deja-liee' },
    );
    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(apiMock).not.toHaveBeenCalled());
  });
});
