import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';

/**
 * Page d'impression du plan e-nov (`/impression`) : une feuille par carte publiée, lieux
 * innovants numérotés, légende par type d'espace, porte d'entrée par code respectée.
 */

const contents = vi.hoisted(() => {
  const base = (id, label, zones) => ({
    map: { id, label, map_image_url: `/maps/${id}.jpg` },
    maps: [
      { id: 'lyautey', label: 'Lycée' },
      { id: 'beaulieu', label: 'Complexe sportif' },
    ],
    settings: {
      attribution: 'Fond de plan : service matériel.',
      enov: { highlight_color: '#faba38', highlight_category_ids: ['cat-enov'] },
    },
    categories: [],
    zones,
    markers: [],
  });
  const square = '[{"xp":10,"yp":10},{"xp":30,"yp":10},{"xp":30,"yp":30},{"xp":10,"yp":30}]';
  return {
    lyautey: base('lyautey', 'Lycée', [
      {
        id: 'z-n3',
        name: 'Salle aérée n³',
        points: square,
        category_ids: [],
        is_enov: true,
        enov_space_type: 'exterieur',
        enov_description: 'Ancienne dalle de béton devenue salle de classe en plein air.',
      },
      {
        id: 'z-fablab',
        name: 'Fablab',
        points: square,
        category_ids: [],
        is_enov: true,
        enov_space_type: 'pedagogique',
        enov_description: 'Matériel de technologie remis en service.',
      },
      { id: 'z-hall', name: 'Hall', points: square, category_ids: [], is_enov: false },
    ]),
    beaulieu: base('beaulieu', 'Complexe sportif', [
      {
        id: 'z-gym',
        name: 'Gymnase',
        points: square,
        category_ids: [],
        is_enov: true,
        enov_space_type: 'sportif',
        enov_description: 'Vidéo différée et chronométrage électronique.',
      },
    ]),
  };
});

const planApiMock = vi.hoisted(() => ({
  fetchPlanContent: vi.fn(),
  reportPlanUsage: vi.fn(),
  submitPlanAccessCode: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../src/plan/planApi.js', () => planApiMock);
// Le QR code est chargé à la demande ; sa bibliothèque n'a rien à prouver ici.
vi.mock('qrcode', () => ({ default: { toString: async () => '<svg data-qr="1"></svg>' } }));

const { EnovPrintPage } = await import('../../src/enov/print/EnovPrintPage.jsx');

beforeEach(() => {
  planApiMock.fetchPlanContent.mockReset();
  planApiMock.fetchPlanContent.mockImplementation(async (mapId) =>
    mapId === 'beaulieu' ? contents.beaulieu : contents.lyautey,
  );
  planApiMock.reportPlanUsage.mockClear();
  window.history.replaceState(null, '', '/impression');
});

describe('EnovPrintPage', () => {
  test('une feuille par carte publiée, lieux numérotés et rangés par type', async () => {
    render(<EnovPrintPage />);
    const sheets = await screen.findAllByTestId('enov-print-sheet');
    expect(sheets).toHaveLength(2);
    const lycee = sheets[0];
    expect(within(lycee).getByRole('heading', { level: 2 }).textContent).toContain('Lycée');
    const types = within(lycee)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(types).toEqual(['Espace extérieur', 'Espace pédagogique']);
    // Deux numéros sur la carte, dans l'ordre de la légende ; le hall n'en porte pas.
    expect([...lycee.querySelectorAll('.enov-print-map__pin')].map((n) => n.textContent)).toEqual([
      '1',
      '2',
    ]);
    expect(lycee.querySelectorAll('.enov-print-map__zone--innovation')).toHaveLength(2);
    expect(within(lycee).getByText(/Ancienne dalle de béton/)).toBeTruthy();
    expect(within(sheets[1]).getByText('Espace sportif')).toBeTruthy();
    expect(planApiMock.reportPlanUsage).toHaveBeenCalledWith(
      'print_open',
      'lyautey,beaulieu',
      expect.anything(),
    );
  });

  test('« Noms seuls » retire les textes ; décocher une carte la retire', async () => {
    render(<EnovPrintPage />);
    await screen.findAllByTestId('enov-print-sheet');
    fireEvent.change(screen.getByLabelText('Légende'), { target: { value: 'names' } });
    expect(screen.queryByText(/Ancienne dalle de béton/)).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Complexe sportif' }));
    await waitFor(() => expect(screen.getAllByTestId('enov-print-sheet')).toHaveLength(1));
    expect(screen.getByTestId('enov-print-button').textContent).toContain('1 plan');
  });

  test('?map_id= restreint aux cartes demandées', async () => {
    window.history.replaceState(null, '', '/impression?map_id=beaulieu');
    render(<EnovPrintPage />);
    const sheets = await screen.findAllByTestId('enov-print-sheet');
    expect(sheets).toHaveLength(1);
    expect(sheets[0].textContent).toContain('Gymnase');
  });

  test('plan fermé par un code : la page demande le code puis recharge', async () => {
    const refused = Object.assign(new Error('Code d’accès requis'), { status: 401 });
    planApiMock.fetchPlanContent.mockRejectedValueOnce(refused);
    render(<EnovPrintPage />);
    const input = await screen.findByLabelText(/code/i);
    fireEvent.change(input, { target: { value: 'code-du-jury-2026' } });
    fireEvent.submit(input.closest('form'));
    await screen.findAllByTestId('enov-print-sheet');
    expect(planApiMock.submitPlanAccessCode).toHaveBeenCalledWith(
      'code-du-jury-2026',
      expect.anything(),
    );
  });
});
