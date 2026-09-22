// @vitest-environment jsdom
//
// « Mes signalements sur ce lieu » — la moitié « retour à l'auteur » du statut de traitement.
// Sans ce bloc, signaler depuis le plan revenait à parler dans le vide : la fiche du Plan
// n'affiche pas les commentaires du lieu, et la console n'est pas servie sur proflyautey.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/shared/ui/BottomSheet.jsx', () => ({
  BottomSheet: ({ children }) => <div>{children}</div>,
}));

const { PlanPlaceSheet } = await import('../../src/plan/components/PlanPlaceSheet.jsx');

const PLACE = {
  id: 'm-1',
  kind: 'marker',
  label: 'Porte du gymnase',
  emoji: '🚪',
  category_ids: [],
};

function renderSheet(myReports) {
  return render(
    <PlanPlaceSheet place={PLACE} onClose={() => {}} categories={[]} myReports={myReports} />,
  );
}

describe('PlanPlaceSheet — mes signalements', () => {
  it('affiche le message envoyé et son état, en mots d’auteur', () => {
    renderSheet([
      {
        id: 'c-1',
        body: 'La porte est condamnée.',
        created_at: '2026-09-15T08:00:00.000Z',
        place_status: 'pris_en_compte',
      },
    ]);
    expect(screen.getByText('Mes signalements sur ce lieu')).toBeTruthy();
    expect(screen.getByText('La porte est condamnée.')).toBeTruthy();
    expect(screen.getByText('Pris en compte')).toBeTruthy();
    expect(screen.getByText(/envoyé le 15 septembre/)).toBeTruthy();
  });

  it('un message encore non lu le dit, plutôt que de rester muet', () => {
    renderSheet([
      {
        id: 'c-2',
        body: 'Le portillon ne ferme plus.',
        created_at: '2026-09-17T08:00:00.000Z',
        place_status: '',
      },
    ]);
    expect(screen.getByText('En attente de lecture')).toBeTruthy();
  });

  it('sans signalement, aucun bloc — la fiche sert d’abord à se repérer', () => {
    renderSheet([]);
    expect(screen.queryByText('Mes signalements sur ce lieu')).toBeNull();
  });
});
