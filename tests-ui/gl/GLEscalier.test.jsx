import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

import { GLTenirEcranEquipe } from '../../src/gl/components/tenir/GLTenirEcranEquipe.jsx';
import { GLTourSouffle } from '../../src/gl/components/mj/GLTourSouffle.jsx';
import { GLTenirProfilPanel } from '../../src/gl/components/mj/GLTenirProfilPanel.jsx';
import { etatEscalier } from '../../src/shared/glTenirEscalierCore.js';

// L'escalier du chapitre 1 (ensemble unifié, M8) : ce qui n'est pas encore ouvert n'est pas
// montré — jamais un bouton grisé.
const escalier = (pas) => etatEscalier({ escalier: true, escalier_pas: pas });
const gameState = {
  game: { id: 7, status: 'live' },
  teams: [{ id: 2, name: 'Gnomes A', type: 'gnome' }],
  roster: [{ playerId: 10, teamId: 2, pseudo: 'joueur-a', healthPoints: 3, powerPoints: 3 }],
};
const tenir = (pas, extra = {}) => ({
  enabled: true,
  profil: 'complet',
  surface: 'tablette',
  settings: {
    des_count: 2,
    des_mode_effectif: 'serveur',
    voile: pas == null || pas >= 3,
    marche: pas == null || pas >= 4,
    overrides: pas == null ? {} : { escalier: true, escalier_pas: pas },
  },
  round: { number: 1, phase: 'jeu' },
  permissions: { jeter: true, lancer: true, repondre: true, fouiller: true, lire: true },
  escalier: pas == null ? null : escalier(pas),
  ...extra,
});

describe('escalier du chapitre 1 — écrans', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockResolvedValue({ round: { number: 1, phase: 'jeu' } });
  });

  test('écran d’équipe : « Jeter un sort » n’existe pas avant la séance 3, puis il paraît', async () => {
    const ecran = (pas) => (
      <GLTenirEcranEquipe
        gameState={gameState}
        tenir={tenir(pas)}
        teamId={2}
        onReloadGame={vi.fn()}
        onJeter={vi.fn()}
      />
    );
    const { rerender } = render(ecran(1));
    await waitFor(() => expect(screen.getByTestId('gl-tenir-maintenant')).toBeInTheDocument());
    expect(document.querySelector('[data-geste="jeter"]')).toBeNull();
    // Les gestes ouverts sont là (le gros bouton, puis les puces) ; aucun n'est grisé.
    for (const geste of ['lancer', 'fouiller']) {
      expect(document.querySelector(`[data-geste="${geste}"]`)).toBeTruthy();
    }
    expect(document.querySelectorAll('[data-geste]:disabled')).toHaveLength(0);
    rerender(ecran(3));
    expect(document.querySelector('[data-geste="jeter"]')).toBeTruthy();
    // Hors escalier : rien n'est masqué.
    rerender(ecran(null));
    expect(document.querySelector('[data-geste="jeter"]')).toBeTruthy();
  });

  test('console du prof : pas de dé gris tant que le voile n’est pas ouvert, « Passer à la suite »', () => {
    const onSouffle = vi.fn();
    const { rerender } = render(
      <GLTourSouffle round={{ phase: 'jeu' }} voileFerme onSouffle={onSouffle} />,
    );
    expect(screen.getByTestId('gl-tour-souffle-ferme')).toBeInTheDocument();
    expect(screen.queryByText('Dé gris')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Le voile dort' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Passer à la suite' }));
    expect(onSouffle).toHaveBeenCalledWith({ dort: true });
    // Une fois la phase passée : la page du Passeur, sans « le voile a dormi ».
    rerender(
      <GLTourSouffle
        round={{
          phase: 'souffle',
          souffle: { dort: true, ferme: true },
          passeur: { titre: 'La page du jour', texte: 'Le chemin continue.' },
        }}
        disabled
      />,
    );
    expect(screen.queryByText(/a dormi/)).toBeNull();
    expect(screen.getByText('Le chemin continue.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passer à la suite' })).toBeNull();
    // Voile ouvert : le dé gris est là.
    rerender(<GLTourSouffle round={{ phase: 'jeu' }} onSouffle={onSouffle} />);
    expect(screen.getByText('Dé gris')).toBeInTheDocument();
  });

  test('profil de la partie : la séance atteinte, ce qui vient, « Ouvrir la suite », et couper l’escalier', async () => {
    apiGlMock.mockResolvedValue({ ok: true });
    const onChanged = vi.fn();
    const { rerender } = render(
      <GLTenirProfilPanel gameId={7} tenir={tenir(2)} onChanged={onChanged} />,
    );
    expect(screen.getByTestId('gl-tenir-escalier-pas').textContent).toContain('séance 2 sur 4');
    expect(screen.getByTestId('gl-tenir-escalier').textContent).toMatch(
      /À la séance 3 s’ouvriront : le voile, la page témoin, trois sorts, la jauge de Lumière/,
    );
    // Le profil prologue n'est plus proposé.
    expect(screen.queryByRole('option', { name: /Prologue/ })).toBeNull();
    // Un réglage que l'escalier tient fermé ne se coche pas ici.
    const voile = screen.getByRole('checkbox', { name: /Le voile/ });
    expect(voile.disabled).toBe(true);
    expect(voile.checked).toBe(false);
    fireEvent.click(screen.getByTestId('gl-tenir-escalier-suite'));
    await waitFor(() =>
      // La séance affichée part avec la demande : un double appui n'ouvre pas deux marches.
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/tenir/escalier/suite', 'POST', {
        pas: 2,
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // Couper l'escalier : la surcharge part avec les autres ; le serveur garde ou retire le pas.
    fireEvent.click(screen.getByTestId('gl-tenir-escalier-actif'));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/tenir/profil', 'PUT', {
        overrides: { escalier: false, escalier_pas: 2 },
      }),
    );
    // Escalier monté : plus rien à ouvrir. Hors escalier : la case est décochée.
    rerender(<GLTenirProfilPanel gameId={7} tenir={tenir(4)} onChanged={onChanged} />);
    expect(screen.getByTestId('gl-tenir-escalier-pas').textContent).toContain('tout est ouvert');
    expect(screen.queryByTestId('gl-tenir-escalier-suite')).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Le voile/ }).disabled).toBe(false);
    rerender(<GLTenirProfilPanel gameId={7} tenir={tenir(null)} onChanged={onChanged} />);
    expect(screen.getByTestId('gl-tenir-escalier-actif').checked).toBe(false);
    expect(screen.queryByTestId('gl-tenir-escalier-pas')).toBeNull();
  });

  test('« Revenir aux réglages du profil » ne touche pas à l’escalier', async () => {
    apiGlMock.mockResolvedValue({ ok: true });
    // L'escalier seul dans les surcharges (toute partie du plateau 1) : rien à défaire.
    const { rerender } = render(<GLTenirProfilPanel gameId={7} tenir={tenir(1)} />);
    expect(screen.queryByTestId('gl-tenir-profil-revenir')).toBeNull();
    // Une surcharge du prof en plus : le bouton paraît, et il garde l'escalier.
    const avecSurcharge = tenir(1);
    avecSurcharge.settings.overrides = { escalier: true, escalier_pas: 1, chapardeur: false };
    rerender(<GLTenirProfilPanel gameId={7} tenir={avecSurcharge} />);
    fireEvent.click(screen.getByTestId('gl-tenir-profil-revenir'));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/tenir/profil', 'PUT', {
        overrides: { escalier: true },
      }),
    );
    // Escalier coupé par le prof : le retour au profil ne le remet pas.
    apiGlMock.mockClear();
    const coupe = tenir(null);
    coupe.settings.overrides = { escalier: false, vent: false };
    rerender(<GLTenirProfilPanel gameId={7} tenir={coupe} />);
    fireEvent.click(screen.getByTestId('gl-tenir-profil-revenir'));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/tenir/profil', 'PUT', {
        overrides: {},
      }),
    );
  });
});
