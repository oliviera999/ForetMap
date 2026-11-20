import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const journalMock = vi.fn();
vi.mock('../../src/gl/hooks/useGlGameJournal.js', () => ({
  useGlGameJournal: (args) => journalMock(args),
}));

import {
  FAITS_MARQUANTS,
  GLTourJournal,
  faitsMarquants,
} from '../../src/gl/components/mj/GLTourJournal.jsx';

/**
 * Chantier « écrans de séance », étape 3 — la projection ne garde du journal que les trois
 * derniers faits marquants (prop `marquants`) ; la console garde le journal entier.
 */
const evt = (id, eventType, title) => ({
  id,
  eventType,
  presentation: { title, body: `corps ${id}`, teamLabel: 'Les Racines' },
});
// Du plus récent au plus ancien, comme la route du journal les sert.
const EVENTS = [
  evt(12, 'dice_roll', 'Jet de dés'),
  evt(11, 'page_trouvee', 'Page trouvée'),
  evt(10, 'fouille', 'Fouille'),
  evt(9, 'voile_avance', 'Le voile avance'),
  evt(8, 'sablier_regle', 'Sablier'),
  evt(7, 'defi_case_releve', 'Défi relevé'),
  evt(6, 'page_tenue', 'Page tenue à deux'),
  evt(5, 'arrivee_camp', 'Arrivée au camp'),
  evt(4, 'peripetie', 'Péripétie'),
  evt(3, 'defi_trame_reussi', 'Défi de la Trame réussi'),
];

describe('GLTourJournal', () => {
  beforeEach(() => {
    journalMock.mockReset();
    journalMock.mockReturnValue({ events: EVENTS, error: '', reload: vi.fn() });
  });

  test('faitsMarquants : garde les types marquants, les plus récents d’abord, dans la limite', () => {
    expect(FAITS_MARQUANTS).toEqual([
      'page_trouvee',
      'page_tenue',
      'defi_case_releve',
      'defi_trame_reussi',
      'voile_avance',
      'arrivee_camp',
      'peripetie',
    ]);
    expect(faitsMarquants(EVENTS, 3).map((e) => e.id)).toEqual([11, 9, 7]);
    expect(faitsMarquants(EVENTS, 10).map((e) => e.id)).toEqual([11, 9, 7, 6, 5, 4, 3]);
    expect(faitsMarquants(EVENTS, 0)).toEqual([]);
    expect(faitsMarquants(null)).toEqual([]);
  });

  test('journal complet (console) : titre « Journal », tous les évènements dans la limite', () => {
    render(<GLTourJournal gameId={9} token="t" limit={4} />);
    expect(journalMock.mock.calls.at(-1)[0].limit).toBe(4);
    expect(screen.getByRole('heading', { level: 3, name: 'Journal' })).toBeTruthy();
    expect(screen.getByLabelText('Journal du tour')).toBeTruthy();
    expect(
      screen.getAllByRole('listitem').map((li) => li.querySelector('strong').textContent),
    ).toEqual(['Jet de dés', 'Page trouvée', 'Fouille', 'Le voile avance']);
  });

  test('marquants (projection) : trois faits, sans titre ; le journal est lu assez loin pour les trouver', () => {
    render(<GLTourJournal gameId={9} token="t" limit={3} marquants />);
    // Le filtre est fait à l'écran : il faut lire plus de trois évènements pour en garder trois.
    expect(journalMock.mock.calls.at(-1)[0].limit).toBeGreaterThanOrEqual(100);
    const journal = screen.getByLabelText('Faits marquants');
    expect(journal.classList.contains('gl-tour-journal--marquants')).toBe(true);
    expect(screen.queryByRole('heading')).toBeNull();
    const faits = screen.getAllByRole('listitem');
    expect(faits.map((li) => li.querySelector('strong').textContent)).toEqual([
      'Page trouvée',
      'Le voile avance',
      'Défi relevé',
    ]);
    expect(faits[0].textContent).toContain('corps 11');
    // Ni jet, ni fouille, ni réglage.
    expect(journal.textContent).not.toMatch(/Jet de dés|Fouille|Sablier/);
  });

  test('marquants : aucun fait encore, la liste est vide (rien ne casse)', () => {
    journalMock.mockReturnValue({ events: [EVENTS[0], EVENTS[2]], error: '', reload: vi.fn() });
    render(<GLTourJournal gameId={9} token="t" limit={3} marquants />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
