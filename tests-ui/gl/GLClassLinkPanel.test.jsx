import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  GLClassLinkPanel,
  resumeDesTablettes,
} from '../../src/gl/components/mj/GLClassLinkPanel.jsx';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));
vi.mock('../../src/shared/components/AppDialogsProvider.jsx', () => ({
  useAppDialogs: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));

const game = { id: 7, class_id: 3 };
const teams = [
  { id: 1, name: 'Gnomes A' },
  { id: 2, name: 'Licornes A' },
];
const session = (id, teamId) => ({ id, teamId, createdAt: '2026-11-20T08:00:00Z' });

function servir({ sessions = [], demandes = [] } = {}) {
  apiGlMock.mockImplementation(async (path) => {
    if (path.endsWith('/tenir/sessions')) return { sessions, demandes };
    return { ok: true };
  });
}

describe('resumeDesTablettes', () => {
  test('une phrase par situation', () => {
    expect(resumeDesTablettes({ sessions: 0, total: 4 })).toBe('Aucune tablette connectée');
    expect(resumeDesTablettes({ sessions: 4, equipes: 4, total: 4 })).toBe(
      '4 tablettes connectées ✓',
    );
    expect(resumeDesTablettes({ sessions: 1, equipes: 1, total: 4 })).toBe(
      '1 tablette connectée · 1 équipe sur 4',
    );
    // Deux appareils dans une même équipe : on compte les tablettes, puis les équipes servies.
    expect(resumeDesTablettes({ sessions: 5, equipes: 3, total: 4 })).toBe(
      '5 tablettes connectées · 3 équipes sur 4',
    );
    // Une tablette qui attend passe devant tout le reste.
    expect(resumeDesTablettes({ sessions: 3, equipes: 3, total: 4, demandes: 1 })).toBe(
      '1 tablette attend',
    );
    expect(resumeDesTablettes({ demandes: 2, total: 4 })).toBe('2 tablettes attendent');
  });
});

describe('GLClassLinkPanel — une ligne, dépliée au toucher (K6)', () => {
  beforeEach(() => {
    // Accolades voulues : un `beforeEach` qui rend une fonction la rappelle au nettoyage.
    apiGlMock.mockReset();
  });
  afterEach(() => cleanup());

  test('replié par défaut : le résumé seul, ni « Déconnecter », ni QR', async () => {
    servir({ sessions: [session(11, 1), session(12, 2)] });
    render(<GLClassLinkPanel game={game} teams={teams} />);
    const resume = await screen.findByTestId('gl-class-link-resume');
    await waitFor(() => expect(resume).toHaveTextContent('2 tablettes connectées ✓'));
    expect(resume).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('gl-class-link-detail')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Déconnecter' })).toBeNull();
    expect(screen.queryByTestId('gl-class-link-qr')).toBeNull();
  });

  test('au toucher, le détail se déplie : QR de la classe et une ligne par tablette', async () => {
    servir({ sessions: [session(11, 1), session(12, 2)] });
    render(<GLClassLinkPanel game={game} teams={teams} />);
    const resume = await screen.findByTestId('gl-class-link-resume');
    await waitFor(() => expect(resume).toHaveTextContent('2 tablettes'));
    fireEvent.click(resume);
    expect(resume).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('gl-class-link-qr')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Déconnecter' })).toHaveLength(2);
    fireEvent.click(resume);
    expect(screen.queryByTestId('gl-class-link-detail')).toBeNull();
  });

  test('une tablette qui attend déplie le panneau d’office, « Accepter » sous la main', async () => {
    servir({ demandes: [{ id: 91, teamId: 2, resteSecondes: 100 }] });
    render(<GLClassLinkPanel game={game} teams={teams} />);
    const resume = await screen.findByTestId('gl-class-link-resume');
    await waitFor(() => expect(resume).toHaveTextContent('1 tablette attend'));
    expect(resume).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('gl-class-link-demandes')).toHaveTextContent('Licornes A');
    // Tant qu'elle attend, toucher le résumé ne cache pas la demande.
    fireEvent.click(resume);
    expect(screen.getByTestId('gl-class-link-demandes')).toBeInTheDocument();

    servir({ sessions: [session(12, 2)] });
    fireEvent.click(screen.getByRole('button', { name: 'Accepter' }));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/games/7/tenir/sessions/91/accepter',
        'POST',
        {},
      ),
    );
    // Demande traitée : le panneau se replie tout seul sur son résumé.
    await waitFor(() =>
      expect(screen.getByTestId('gl-class-link-resume')).toHaveTextContent(
        '1 tablette connectée · 1 équipe sur 2',
      ),
    );
    expect(screen.queryByTestId('gl-class-link-detail')).toBeNull();
  });
});
