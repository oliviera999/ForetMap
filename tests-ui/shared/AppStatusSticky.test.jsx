import { describe, test, expect } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AppStatusSticky } from '../../src/shared/components/AppStatusSticky.jsx';
import { emitAppStatus } from '../../src/shared/appStatusEvents.js';

describe('AppStatusSticky', () => {
  test('invisible sans statut actif', () => {
    const { container } = render(<AppStatusSticky />);
    expect(container.querySelector('.app-status-sticky')).toBeNull();
  });

  test('affiche l’enregistrement en cours puis disparaît sur clear', () => {
    const { container } = render(<AppStatusSticky />);
    act(() => {
      emitAppStatus({ id: 'form-1', kind: 'saving', message: 'Enregistrement…' });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Enregistrement…');
    act(() => {
      emitAppStatus({ id: 'form-1', kind: 'clear' });
    });
    expect(container.querySelector('.app-status-sticky')).toBeNull();
  });

  test('la reconnexion réseau prime sur un enregistrement et affiche la tentative', () => {
    render(<AppStatusSticky />);
    act(() => {
      emitAppStatus({ id: 'form-1', kind: 'saving' });
      emitAppStatus({
        id: 'req-1',
        kind: 'retrying',
        message: 'Serveur momentanément indisponible — reconnexion en cours…',
        attempt: 3,
        maxAttempts: 8,
      });
    });
    expect(screen.getByRole('status')).toHaveTextContent(/reconnexion en cours/i);
    expect(screen.getByRole('status')).toHaveTextContent('tentative 3/8');
  });

  test('une erreur passe en role=alert et prime sur tout', () => {
    render(<AppStatusSticky />);
    act(() => {
      emitAppStatus({ id: 'req-1', kind: 'retrying' });
      emitAppStatus({ id: 'form-1', kind: 'error', message: 'Échec réseau' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Échec réseau');
  });

  test('les confirmations (saved) s’effacent toutes seules', async () => {
    const { container } = render(<AppStatusSticky />);
    act(() => {
      emitAppStatus({ id: 'form-1', kind: 'saved', message: 'Enregistré ✓' });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Enregistré ✓');
    await waitFor(() => expect(container.querySelector('.app-status-sticky')).toBeNull(), {
      timeout: 4000,
    });
  });
});
