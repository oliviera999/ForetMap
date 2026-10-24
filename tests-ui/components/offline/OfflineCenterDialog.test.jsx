import { describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  OfflineCenterDialog,
  outboxEntryRefusalText,
} from '../../../src/components/offline/OfflineCenterDialog.jsx';
import { OfflineCenterButton } from '../../../src/components/app/AppHeader.jsx';
import { enqueueTaskDone, listQueuedTaskDone } from '../../../src/utils/taskDoneQueue.js';

const entry = (overrides = {}) => ({
  kind: 'task_done',
  key: 'done-0001',
  title: 'Arroser',
  detail: '',
  queued_at: Date.now() - 60_000,
  refused: false,
  error: '',
  error_code: '',
  has_photo: false,
  dismissible: true,
  ...overrides,
});

describe('OfflineCenterButton', () => {
  test('en ligne sans attente : libellé neutre, sans pastille', () => {
    render(<OfflineCenterButton onOpen={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'Hors ligne et envois' });
    expect(btn.querySelector('.notif-badge')).toBeNull();
  });

  test('hors ligne avec envois en attente : compte et refus signalés', () => {
    const onOpen = vi.fn();
    render(
      <OfflineCenterButton
        pendingCount={2}
        refusedCount={1}
        networkMode="offline"
        onOpen={onOpen}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Hors ligne — 3 envois en attente' });
    expect(btn.querySelector('.notif-badge.is-refused').textContent).toBe('3');
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalled();
  });

  test('réseau trop faible', () => {
    render(<OfflineCenterButton networkMode="unreachable" onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Réseau trop faible' })).toBeTruthy();
  });
});

describe('outboxEntryRefusalText', () => {
  test('code stable expliqué, sinon message du serveur', () => {
    expect(outboxEntryRefusalText(entry({ refused: true, error_code: 'task_archived' }))).toBe(
      'Refusé : la tâche a été archivée entre-temps.',
    );
    expect(outboxEntryRefusalText(entry({ refused: true, error: 'Trop tard' }))).toBe(
      'Refusé : Trop tard',
    );
    expect(outboxEntryRefusalText(entry())).toBe('');
  });
});

describe('OfflineCenterDialog', () => {
  test('liste vide : tout est envoyé', () => {
    render(<OfflineCenterDialog onClose={vi.fn()} entries={[]} onFlushNow={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Hors ligne' })).toBeTruthy();
    expect(screen.getByText(/Rien en attente/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Envoyer maintenant' })).toBeNull();
  });

  test('envoi manuel en ligne ; désactivé hors ligne', async () => {
    const onFlushNow = vi.fn(async () => {});
    const { unmount } = render(
      <OfflineCenterDialog
        onClose={vi.fn()}
        entries={[entry({ has_photo: true })]}
        onFlushNow={onFlushNow}
      />,
    );
    expect(screen.getByText('Tâche faite')).toBeTruthy();
    expect(screen.getByText(/photo/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer maintenant' }));
    });
    expect(onFlushNow).toHaveBeenCalled();
    unmount();

    render(
      <OfflineCenterDialog
        onClose={vi.fn()}
        entries={[entry()]}
        networkMode="unreachable"
        onFlushNow={onFlushNow}
      />,
    );
    expect(screen.getByRole('button', { name: 'Envoi au retour du réseau' })).toBeDisabled();
    expect(screen.getByRole('status').textContent).toMatch(/réseau/i);
  });

  test('écriture refusée : explication, texte copiable, suppression confirmée', async () => {
    enqueueTaskDone({
      user_id: 'u1',
      task_id: 't1',
      task_title: 'Arroser',
      client_uuid: 'done-0001',
      comment: 'Trois arrosoirs',
      student_id: 'u1',
    });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <OfflineCenterDialog
        onClose={vi.fn()}
        entries={[entry({ refused: true, error_code: 'not_assigned', detail: 'Trois arrosoirs' })]}
        onFlushNow={vi.fn()}
      />,
    );
    expect(screen.getByText('Refusé : tu n’es plus inscrit·e sur cette tâche.')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copier le texte' }));
    });
    expect(writeText).toHaveBeenCalledWith('Trois arrosoirs');
    expect(screen.getByRole('button', { name: 'Copié ✓' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Supprimer « Arroser » de cet appareil' }),
      );
    });
    await waitFor(() => expect(listQueuedTaskDone('u1')).toHaveLength(0));
  });

  test('préparation de la sortie terrain : avancement puis bilan', async () => {
    let finish;
    const onPrepareFieldTrip = vi.fn(
      (onProgress) =>
        new Promise((resolve) => {
          onProgress({ done: 1, total: 4 });
          finish = () => resolve({ ok: 9, failed: 2 });
        }),
    );
    render(
      <OfflineCenterDialog
        onClose={vi.fn()}
        entries={[]}
        onFlushNow={vi.fn()}
        onPrepareFieldTrip={onPrepareFieldTrip}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Préparer la sortie terrain' }));
    });
    expect(
      screen.getByRole('progressbar', { name: 'Avancement de la préparation' }),
    ).toHaveAttribute('value', '25');
    await act(async () => finish());
    expect(
      screen.getByText(/Prêt pour la sortie ✓ \(9 éléments gardés, 2 indisponibles\)/),
    ).toBeTruthy();
  });

  test('stockage : bouton de protection quand les données ne sont pas persistantes', async () => {
    const persist = vi.fn(async () => true);
    let persisted = false;
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: async () => persisted,
        persist: async () => {
          persisted = await persist();
          return persisted;
        },
        estimate: async () => ({ usage: 5 * 1024 * 1024, quota: 500 * 1024 * 1024 }),
      },
    });
    render(<OfflineCenterDialog onClose={vi.fn()} entries={[]} onFlushNow={vi.fn()} />);
    expect(await screen.findByText(/Utilisé : 5 Mo sur 500 Mo/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Protéger les données hors ligne' }));
    });
    expect(persist).toHaveBeenCalled();
    expect(await screen.findByText(/Données hors ligne protégées/)).toBeTruthy();
    delete navigator.storage;
  });
});
