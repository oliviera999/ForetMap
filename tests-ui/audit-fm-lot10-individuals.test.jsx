// Audit ForetMap du 19/11/2026, lot 10 — individus suivis :
// F8 (course entre deux clics rapides) et F9 (date de mesure par défaut en heure locale).
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('../src/services/api', () => ({ api: (...args) => apiMock(...args) }));
vi.mock('../src/contexts/DataContext.jsx', () => ({ useData: () => ({ plants: [] }) }));
vi.mock('../src/contexts/BiodivPedagoContext.jsx', () => ({
  useBiodivPedago: () => ({ visibility: () => 'show' }),
}));
vi.mock('../src/shared/components/AppDialogsProvider.jsx', () => ({
  useAppDialogs: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));
// Date locale figée, distincte de toute date UTC « du jour » : prouve que la vue lit
// `currentLocalDateOnly()` et non `toISOString()`.
vi.mock('../src/utils/taskListHelpers.js', () => ({
  currentLocalDateOnly: () => '2031-01-02',
}));

const { IndividualsView } = await import('../src/components/pedago/IndividualsView.jsx');

const ITEMS = [
  { id: 1, label: 'Grenadier un', plant_name: 'Grenadier' },
  { id: 2, label: 'Figuier deux', plant_name: 'Figuier' },
];
const detailOf = (id) => ({
  ...ITEMS.find((i) => i.id === id),
  measurements: [],
  disclaimer: 'ordre de grandeur',
});

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('IndividualsView — audit lot 10', () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  test('F9 — la date de mesure par défaut est la date locale', async () => {
    apiMock.mockImplementation(async (url) => {
      if (url.startsWith('/api/individuals/')) return detailOf(1);
      return { items: ITEMS };
    });
    render(<IndividualsView canMeasure initialIndividualId={1} />);
    const input = await screen.findByLabelText('Date');
    expect(input.value).toBe('2031-01-02');
  });

  test('F8 — deux clics rapides : la fiche affichée et la mesure visent le même individu', async () => {
    const slowFirst = deferred();
    const posts = [];
    apiMock.mockImplementation(async (url, method) => {
      if (method === 'POST') {
        posts.push(url);
        return {};
      }
      if (url === '/api/individuals/1') return slowFirst.promise;
      if (url === '/api/individuals/2') return detailOf(2);
      return { items: ITEMS };
    });
    render(<IndividualsView canMeasure />);
    fireEvent.click(await screen.findByRole('button', { name: /Grenadier un/ }));
    fireEvent.click(screen.getByRole('button', { name: /Figuier deux/ }));
    await screen.findByRole('heading', { name: /Figuier deux/ });

    // La réponse du premier clic arrive en retard : elle ne doit pas remplacer la fiche.
    await act(async () => {
      slowFirst.resolve(detailOf(1));
      await slowFirst.promise;
    });
    expect(screen.getByRole('heading', { name: /Figuier deux/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Grenadier un/ })).toBeNull();

    fireEvent.change(screen.getByLabelText('Hauteur (m)'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la mesure' }));
    await waitFor(() => expect(posts).toEqual(['/api/individuals/2/measurements']));
  });
});
