// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * Échelles de niveau reliées (lib/pedagoScales.js) vues depuis le quiz d'un élève de 6ᵉ :
 * sa classe est au cycle 3 (`groups.curriculum_niveau`), son affichage en Collège. Le quiz
 * doit proposer par défaut les questions de collège, masquer le cycle 4 et le lycée dans
 * le menu « Niveau du programme », et resserrer une demande « tout le collège » au cycle 3.
 */

const apiMock = vi.fn();
vi.mock('../../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

vi.mock('../../../src/hooks/useGlossaryLinkIndex.js', () => ({
  useGlossaryLinkIndex: () => [],
  resetGlossaryLinkIndexCache: () => {},
}));

vi.mock('../../../src/shared/components/LearningQuizPopover.jsx', () => ({
  LearningQuizPopover: () => null,
}));

import { QuizView } from '../../../src/components/pedago/QuizView.jsx';
import { BiodivPedagoProvider } from '../../../src/contexts/BiodivPedagoContext.jsx';
import { resetCurriculumNotionsCache } from '../../../src/hooks/useCurriculumNotions.js';

const NOTIONS = [
  { id: 'C3-VIV', niveau: 'cycle3', notion: 'Classer les organismes', question_count: 3 },
  { id: 'C4-VIV', niveau: 'cycle4', notion: 'Le vivant et son évolution', question_count: 4 },
  { id: '2-BIODIV', niveau: 'seconde', notion: 'Biodiversité', question_count: 5 },
];

beforeEach(() => {
  apiMock.mockReset();
  resetCurriculumNotionsCache();
  apiMock.mockImplementation((path) => {
    if (path.startsWith('/api/curriculum/notions')) return Promise.resolve({ items: NOTIONS });
    if (path.startsWith('/api/quiz/me/progress')) return Promise.resolve(null);
    if (path.startsWith('/api/quiz/categories')) return Promise.resolve({ categories: [] });
    if (path.startsWith('/api/quiz/draw')) return Promise.resolve({ question_code: 'QF0001' });
    if (path.includes('/present')) {
      return Promise.resolve({ question: 'Question ?', choices: [], presentationToken: 't' });
    }
    return Promise.resolve({});
  });
});

function renderForSixieme(props = {}) {
  return render(
    <BiodivPedagoProvider groupLevels={['college']} classCurriculumNiveaux={['cycle3']}>
      <QuizView {...props} />
    </BiodivPedagoProvider>,
  );
}

describe('QuizView — élève de 6ᵉ (cycle 3)', () => {
  it('propose par défaut les questions de collège', async () => {
    renderForSixieme();
    await waitFor(() =>
      expect(
        apiMock.mock.calls.some(([p]) => String(p) === '/api/quiz/categories?niveau=college'),
      ).toBe(true),
    );
    expect(screen.getByLabelText('Niveau').value).toBe('college');
  });

  it('ne montre ni le cycle 4 ni le lycée dans le menu du programme', async () => {
    renderForSixieme();
    const select = screen.getByLabelText('Niveau du programme');
    const values = [...select.querySelectorAll('option')].map((o) => o.value);
    expect(values).toContain('cycle3');
    expect(values).not.toContain('cycle4');
    expect(values).not.toContain('college');
    expect(values).not.toContain('lycee');
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Classer les organismes/ })).toBeTruthy(),
    );
    expect(screen.queryByRole('option', { name: /Le vivant et son évolution/ })).toBeNull();
  });

  it('une séance « tout le collège » tire dans le cycle 3 de la classe', async () => {
    renderForSixieme({ initialNotionNiveau: 'college' });
    fireEvent.click(await screen.findByRole('button', { name: /tirer/i }));
    await waitFor(() =>
      expect(apiMock.mock.calls.some(([p]) => String(p).includes('notionNiveau=cycle3'))).toBe(
        true,
      ),
    );
    expect(apiMock.mock.calls.some(([p]) => String(p).includes('notionNiveau=college'))).toBe(
      false,
    );
  });

  it('une séance « cycle 4 » explicite est respectée, et affichée', async () => {
    renderForSixieme({ initialNotionNiveau: 'cycle4' });
    expect(screen.getByLabelText('Niveau du programme').value).toBe('cycle4');
    fireEvent.click(await screen.findByRole('button', { name: /tirer/i }));
    await waitFor(() =>
      expect(apiMock.mock.calls.some(([p]) => String(p).includes('notionNiveau=cycle4'))).toBe(
        true,
      ),
    );
  });
});
