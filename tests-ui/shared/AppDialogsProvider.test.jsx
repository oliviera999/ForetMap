// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import {
  AppDialogsProvider,
  useAppDialogs,
} from '../../src/shared/components/AppDialogsProvider.jsx';

function Harness({ onReady }) {
  const dialogs = useAppDialogs();
  onReady(dialogs);
  return null;
}

function mount() {
  let dialogs;
  render(
    <AppDialogsProvider>
      <Harness
        onReady={(d) => {
          dialogs = d;
        }}
      />
    </AppDialogsProvider>,
  );
  return () => dialogs;
}

describe('AppDialogsProvider', () => {
  it('confirm : résout true sur le CTA, false sur Annuler', async () => {
    const get = mount();
    let result;
    act(() => {
      get()
        .confirm({ message: 'Supprimer cette photo ?', danger: true })
        .then((r) => {
          result = r;
        });
    });
    expect(await screen.findByText('Supprimer cette photo ?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(result).toBe(true));

    act(() => {
      get()
        .confirm({ message: 'Encore ?' })
        .then((r) => {
          result = r;
        });
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(result).toBe(false));
  });

  it('confirm : Échap (fermeture du shell) résout false', async () => {
    const get = mount();
    let result;
    act(() => {
      get()
        .confirm({ message: 'Quitter sans enregistrer ?' })
        .then((r) => {
          result = r;
        });
    });
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(result).toBe(false));
  });

  it('prompt : renvoie la saisie à la validation, null à l’annulation, bloque le vide si required', async () => {
    const get = mount();
    let result = 'unset';
    act(() => {
      get()
        .prompt({ message: 'Titre de la zone de visite', required: true })
        .then((r) => {
          result = r;
        });
    });
    const input = await screen.findByLabelText('Titre de la zone de visite');
    const submit = screen.getByRole('button', { name: 'Valider' });
    expect(submit.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'Mare aux tritons' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(result).toBe('Mare aux tritons'));

    act(() => {
      get()
        .prompt({ message: 'Nouvelle légende', defaultValue: 'avant' })
        .then((r) => {
          result = r;
        });
    });
    expect((await screen.findByLabelText('Nouvelle légende')).value).toBe('avant');
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(result).toBe(null));
  });

  it('file d’attente : deux confirmations demandées en même temps s’enchaînent', async () => {
    const get = mount();
    const results = [];
    act(() => {
      get()
        .confirm({ message: 'Première ?' })
        .then((r) => results.push(['a', r]));
      get()
        .confirm({ message: 'Seconde ?' })
        .then((r) => results.push(['b', r]));
    });
    expect(await screen.findByText('Première ?')).toBeTruthy();
    expect(screen.queryByText('Seconde ?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(await screen.findByText('Seconde ?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() =>
      expect(results).toEqual([
        ['a', true],
        ['b', false],
      ]),
    );
  });

  it('notify : affiche un toast auto-dismiss (non bloquant)', async () => {
    const get = mount();
    act(() => {
      get().notify('Erreur enregistrement');
    });
    expect(await screen.findByText('Erreur enregistrement')).toBeTruthy();
  });
});
