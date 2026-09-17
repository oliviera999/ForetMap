import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  RecurringSeriesOverview,
  formatOccurrenceDate,
  previewLine,
} from '../../src/components/tasks/RecurringSeriesOverview.jsx';

vi.mock('../../src/services/api.js', () => ({ api: vi.fn() }));

import { api } from '../../src/services/api.js';

/** Le cadre interroge deux routes au dépliage : le statut du jour et la prévision des séries. */
function repondre({ preview = null, previewFails = false, truncated = false } = {}) {
  api.mockImplementation(async (url) => {
    if (url === '/api/school-calendar') {
      return { today: { today: '2026-09-16', isOpen: true } };
    }
    if (url === '/api/tasks/recurring-preview') {
      if (previewFails) throw new Error('indisponible');
      return { today: '2026-09-16', series: preview ? [preview] : [], truncated, limit: 200 };
    }
    throw new Error(`url inattendue : ${url}`);
  });
}

describe('formatOccurrenceDate', () => {
  test('rend le jour de semaine, qui est ici l’information utile', () => {
    // 22/09/2026 est un mardi : c'est ce jour-là qui dérivait avant l'ancre.
    expect(formatOccurrenceDate('2026-09-22')).toMatch(/^mar\./);
  });

  test('ignore ce qui n’est pas une date ISO', () => {
    for (const valeur of [null, undefined, '', 'demain', '22/09/2026']) {
      expect(formatOccurrenceDate(valeur)).toBeNull();
    }
  });
});

describe('previewLine', () => {
  const base = { next_start: '2026-09-22', next_due: '2026-09-25' };

  test('annonce la fenêtre quand rien n’est attendu', () => {
    expect(previewLine({ ...base, pending: null })).toMatch(/Prochaine occurrence mar\./);
    expect(previewLine({ ...base, pending: null })).not.toMatch(/une fois/);
  });

  test('dit ce qui manque : validation ou échéance', () => {
    expect(previewLine({ ...base, pending: 'validation' })).toMatch(/une fois celle-ci validée/);
    expect(previewLine({ ...base, pending: 'due_date' })).toMatch(/une fois l’échéance atteinte/);
  });

  test('n’affiche pas deux fois la même date quand départ et échéance coïncident', () => {
    const ligne = previewLine({
      next_start: '2026-09-22',
      next_due: '2026-09-22',
      pending: null,
    });
    expect(ligne).not.toContain('→');
  });

  test('rend null sans prévision exploitable', () => {
    expect(previewLine(null)).toBeNull();
    expect(previewLine({ next_start: null, next_due: null })).toBeNull();
  });
});

const TASKS = [
  {
    id: 1,
    title: 'Arroser la serre',
    recurrence: 'weekly',
    recurrence_series_id: 'S1',
    due_date: '2026-09-16',
    status: 'todo',
  },
  {
    id: 2,
    title: 'Tailler les fruitiers',
    recurrence: 'monthly',
    recurrence_series_id: 'S2',
    due_date: '2026-09-30',
    status: 'todo',
  },
];

describe('RecurringSeriesOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repondre();
  });

  test('arrive replié : seul l’en-tête est visible', () => {
    render(<RecurringSeriesOverview isTeacher tasks={TASKS} onToggleRecurringFilter={() => {}} />);
    const head = screen.getByRole('button', { name: /Séries récurrentes/ });
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Arroser la serre')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filtrer récurrentes' })).not.toBeInTheDocument();
  });

  test('se déplie au clic sur l’en-tête, et se replie au clic suivant', async () => {
    const user = userEvent.setup();
    render(<RecurringSeriesOverview isTeacher tasks={TASKS} onToggleRecurringFilter={() => {}} />);
    const head = screen.getByRole('button', { name: /Séries récurrentes/ });

    await user.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Arroser la serre')).toBeInTheDocument();
    expect(screen.getByText('Tailler les fruitiers')).toBeInTheDocument();

    await user.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Arroser la serre')).not.toBeInTheDocument();
  });

  test('le filtre récurrentes n’est jamais appliqué tout seul, et il est réversible', async () => {
    const user = userEvent.setup();
    const onToggleRecurringFilter = vi.fn();
    const { rerender } = render(
      <RecurringSeriesOverview
        isTeacher
        tasks={TASKS}
        onToggleRecurringFilter={onToggleRecurringFilter}
      />,
    );
    expect(onToggleRecurringFilter).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Séries récurrentes/ }));
    const filterBtn = screen.getByRole('button', { name: 'Filtrer récurrentes' });
    expect(filterBtn).toHaveAttribute('aria-pressed', 'false');
    await user.click(filterBtn);
    expect(onToggleRecurringFilter).toHaveBeenCalledTimes(1);

    rerender(
      <RecurringSeriesOverview
        isTeacher
        tasks={TASKS}
        isRecurringFilterActive
        onToggleRecurringFilter={onToggleRecurringFilter}
      />,
    );
    expect(screen.getByRole('button', { name: 'Retirer le filtre récurrentes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('rien n’est rendu sans tâche récurrente', () => {
    const { container } = render(
      <RecurringSeriesOverview
        isTeacher
        tasks={[{ id: 9, title: 'Ponctuelle', recurrence: '' }]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('déplié, chaque série annonce sa prochaine occurrence et son jour d’ancre', async () => {
    const user = userEvent.setup();
    repondre({
      preview: {
        series_id: 'S1',
        task_id: 1,
        recurrence: 'weekly',
        anchor_date: '2026-09-15',
        pending: null,
        next_start: '2026-09-22',
        next_due: '2026-09-25',
      },
    });
    render(<RecurringSeriesOverview isTeacher tasks={TASKS} />);

    await user.click(screen.getByRole('button', { name: /Séries récurrentes/ }));
    await waitFor(() => {
      expect(screen.getByText(/Prochaine occurrence/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Rythme calé sur le mar\./)).toBeInTheDocument();
  });

  test('reste utilisable si la prévision échoue', async () => {
    const user = userEvent.setup();
    repondre({ previewFails: true });
    render(<RecurringSeriesOverview isTeacher tasks={TASKS} />);

    await user.click(screen.getByRole('button', { name: /Séries récurrentes/ }));
    await waitFor(() => {
      expect(screen.getByText('Arroser la serre')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Prochaine occurrence/)).not.toBeInTheDocument();
  });

  test('replié, le cadre ne demande ni le calendrier ni la prévision', () => {
    repondre();
    render(<RecurringSeriesOverview isTeacher tasks={TASKS} />);
    expect(api).not.toHaveBeenCalled();
  });

  /**
   * Le serveur borne sa liste. Sans ce repère, une série restée hors de la fenêtre de
   * calcul se présentait exactement comme une série sans prochaine occurrence : le cadre
   * affirmait une absence là où il n'avait simplement pas la réponse.
   */
  test('dit quand la prévision n’a pas été calculée, au lieu de la taire', async () => {
    const user = userEvent.setup();
    repondre({ truncated: true });
    render(<RecurringSeriesOverview isTeacher tasks={TASKS} />);

    await user.click(screen.getByRole('button', { name: /Séries récurrentes/ }));
    await waitFor(() => {
      expect(screen.getAllByText(/Prévision non calculée/)).toHaveLength(TASKS.length);
    });
    expect(screen.queryByText(/Prochaine occurrence/)).not.toBeInTheDocument();
  });

  test('liste complète : une série sans prévision n’en a réellement pas', async () => {
    const user = userEvent.setup();
    repondre({ truncated: false });
    render(<RecurringSeriesOverview isTeacher tasks={TASKS} />);

    await user.click(screen.getByRole('button', { name: /Séries récurrentes/ }));
    await waitFor(() => {
      expect(screen.getByText('Arroser la serre')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Prévision non calculée/)).not.toBeInTheDocument();
  });

  test('la prévision indisponible ne se déguise pas en liste tronquée', async () => {
    const user = userEvent.setup();
    repondre({ previewFails: true });
    render(<RecurringSeriesOverview isTeacher tasks={TASKS} />);

    await user.click(screen.getByRole('button', { name: /Séries récurrentes/ }));
    await waitFor(() => {
      expect(screen.getByText('Arroser la serre')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Prévision non calculée/)).not.toBeInTheDocument();
  });

  test('ne demande rien et n’affiche rien hors profil prof', () => {
    repondre();
    const { container } = render(<RecurringSeriesOverview isTeacher={false} tasks={TASKS} />);
    expect(container).toBeEmptyDOMElement();
    expect(api).not.toHaveBeenCalled();
  });
});
