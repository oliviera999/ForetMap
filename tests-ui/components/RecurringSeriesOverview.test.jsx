import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../src/services/api.js', () => ({ api: vi.fn() }));

import { api } from '../../src/services/api.js';
import {
  RecurringSeriesOverview,
  formatOccurrenceDate,
  previewLine,
} from '../../src/components/tasks/RecurringSeriesOverview.jsx';

const TACHES = [
  {
    id: 't1',
    title: 'Arrosage serre',
    recurrence: 'weekly',
    recurrence_series_id: 's1',
    due_date: '2026-09-18',
    status: 'validated',
  },
];

function repondre({ preview = null, previewFails = false } = {}) {
  api.mockImplementation(async (url) => {
    if (url === '/api/school-calendar') {
      return { today: { today: '2026-09-18', isOpen: true } };
    }
    if (url === '/api/tasks/recurring-preview') {
      if (previewFails) throw new Error('indisponible');
      return { today: '2026-09-18', series: preview ? [preview] : [] };
    }
    throw new Error(`url inattendue : ${url}`);
  });
}

beforeEach(() => {
  api.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

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

describe('RecurringSeriesOverview', () => {
  test('affiche la prochaine occurrence et le jour d’ancre', async () => {
    repondre({
      preview: {
        series_id: 's1',
        task_id: 't1',
        recurrence: 'weekly',
        anchor_date: '2026-09-15',
        pending: null,
        next_start: '2026-09-22',
        next_due: '2026-09-25',
      },
    });
    render(<RecurringSeriesOverview isTeacher tasks={TACHES} />);

    await waitFor(() => {
      expect(screen.getByText(/Prochaine occurrence/)).toBeTruthy();
    });
    expect(screen.getByText(/Rythme calé sur le mar\./)).toBeTruthy();
  });

  test('reste utilisable si la prévision échoue', async () => {
    repondre({ previewFails: true });
    render(<RecurringSeriesOverview isTeacher tasks={TACHES} />);

    await waitFor(() => {
      expect(screen.getByText('Arrosage serre')).toBeTruthy();
    });
    expect(screen.queryByText(/Prochaine occurrence/)).toBeNull();
  });

  test('ne demande rien et n’affiche rien hors profil prof', () => {
    repondre();
    const { container } = render(<RecurringSeriesOverview isTeacher={false} tasks={TACHES} />);
    expect(container.innerHTML).toBe('');
    expect(api).not.toHaveBeenCalled();
  });
});
