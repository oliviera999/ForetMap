import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchoolCalendarPanel } from '../../src/components/settings/SchoolCalendarPanel.jsx';

vi.mock('../../src/services/api', () => ({ api: vi.fn() }));

import { api } from '../../src/services/api';

const ADMIN = {
  today: { today: '2026-09-28', isOpen: true, kind: 'open' },
  open_weekdays: [1, 2, 3, 4, 5],
  years: [{ id: 1, label: '2026-2027', starts_on: '2026-09-01', ends_on: '2027-08-31' }],
  year_id: 1,
  days: [
    { date: '2026-10-16', is_open: true, kind: 'open', label: null },
    { date: '2026-10-19', is_open: false, kind: 'vacation', label: 'Toussaint' },
    { date: '2026-10-24', is_open: false, kind: 'weekend', label: null },
    { date: '2026-10-30', is_open: false, kind: 'vacation', label: 'Toussaint' },
    { date: '2026-11-02', is_open: true, kind: 'open', label: null },
  ],
};

function repondre() {
  api.mockImplementation(async (url, method) => {
    if (url.startsWith('/api/school-calendar/admin')) return ADMIN;
    if (method === 'PUT' || method === 'POST') return { ok: true };
    throw new Error(`url inattendue : ${url}`);
  });
}

describe('SchoolCalendarPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repondre();
  });

  test('affiche les jours ouvrables et les vacances regroupées en une période', async () => {
    render(<SchoolCalendarPanel canWrite />);
    await waitFor(() => {
      expect(screen.getByText('Vacances')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/« Toussaint » du lun\. 19 oct\. au ven\. 30 oct\./),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'lundi' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'samedi' })).not.toBeChecked();
  });

  test('enregistre les jours ouvrables après confirmation', async () => {
    const user = userEvent.setup();
    const confirm = vi.fn(async () => true);
    render(<SchoolCalendarPanel canWrite confirm={confirm} />);
    const bouton = await screen.findByRole('button', { name: 'Enregistrer les jours ouvrables' });
    expect(bouton).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'samedi' }));
    await user.click(bouton);

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('du lundi au samedi') }),
    );
    expect(api).toHaveBeenCalledWith('/api/school-calendar/weekdays', 'PUT', {
      open_weekdays: [1, 2, 3, 4, 5, 6],
    });
  });

  test('ajoute un jour férié : un seul jour quand la date de fin est vide', async () => {
    const user = userEvent.setup();
    render(<SchoolCalendarPanel canWrite />);
    await screen.findByLabelText('Ajouter');

    await user.selectOptions(screen.getByLabelText('Ajouter'), 'holiday');
    await user.type(screen.getByLabelText('Du'), '2026-11-11');
    await user.type(screen.getByLabelText('Libellé (facultatif)'), 'Armistice');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));

    expect(api).toHaveBeenCalledWith('/api/school-calendar/days', 'PUT', {
      from: '2026-11-11',
      to: '2026-11-11',
      action: 'close',
      kind: 'holiday',
      label: 'Armistice',
    });
  });

  test('annuler une période la remet aux jours ouvrables', async () => {
    const user = userEvent.setup();
    render(<SchoolCalendarPanel canWrite confirm={async () => true} />);
    await user.click(await screen.findByRole('button', { name: /^Annuler : Vacances/ }));
    expect(api).toHaveBeenCalledWith('/api/school-calendar/days', 'PUT', {
      from: '2026-10-19',
      to: '2026-10-30',
      action: 'reset',
    });
  });

  test('lecture seule : aucune commande d’écriture', async () => {
    render(<SchoolCalendarPanel canWrite={false} />);
    await screen.findByText('Vacances');
    expect(screen.getByRole('checkbox', { name: 'lundi' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Enregistrer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Annuler/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Nouvelle année scolaire')).not.toBeInTheDocument();
  });
});
