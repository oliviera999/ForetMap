import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLSpellCastRosterSection } from '../../src/gl/components/spell-cast/GLSpellCastRosterSection.jsx';

const ROSTER = [
  {
    playerId: 1,
    pseudo: 'Alice',
    teamId: 7,
    teamName: 'Rouges',
    healthPoints: 5,
    powerPoints: 9,
  },
  {
    playerId: 2,
    pseudo: 'Bob',
    teamId: 7,
    teamName: 'Rouges',
    healthPoints: 3,
    powerPoints: 4,
  },
];

function renderSection(props = {}) {
  return render(
    <GLSpellCastRosterSection
      draft={{ roster: ROSTER }}
      required={{ gems: 10, hearts: 4 }}
      totals={{ gems: 2, hearts: 0 }}
      localContribs={[{ playerId: 1, gems: 2, hearts: 0 }]}
      contributionMode="both"
      playerId={1}
      isStaff={false}
      busy={false}
      onUpdateContrib={vi.fn()}
      onContribBlur={vi.fn()}
      {...props}
    />,
  );
}

describe('GLSpellCastRosterSection', () => {
  test('rend les barres de progression gemmes/cœurs', () => {
    renderSection();
    expect(screen.getByText('Gemmes')).toBeInTheDocument();
    expect(screen.getByText('Cœurs')).toBeInTheDocument();
  });

  test('groupe le roster par équipe et liste chaque joueur', () => {
    renderSection();
    expect(screen.getByText('Rouges')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  test('affiche un message si le roster est vide', () => {
    renderSection({ draft: { roster: [] } });
    expect(screen.getByText(/Aucun joueur assigné/)).toBeInTheDocument();
  });

  test('remonte onUpdateContrib(playerId, field, value) au changement', () => {
    const onUpdateContrib = vi.fn();
    renderSection({ onUpdateContrib });
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '3' } });
    expect(onUpdateContrib).toHaveBeenCalledWith(1, 'gems', '3');
  });

  test('remonte onContribBlur(playerId, field, value) au blur', () => {
    const onContribBlur = vi.fn();
    renderSection({ onContribBlur });
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.blur(inputs[0], { target: { value: '3' } });
    expect(onContribBlur).toHaveBeenCalledWith(1, 'gems', '3');
  });

  test('en mode self_only, désactive les champs des autres joueurs', () => {
    renderSection({ contributionMode: 'self_only', playerId: 1 });
    const inputs = screen.getAllByRole('spinbutton');
    // 2 champs (gems+hearts) par joueur ; joueur 1 = acteur (actifs), joueur 2 désactivés
    expect(inputs[0].disabled).toBe(false);
    expect(inputs[2].disabled).toBe(true);
  });

  test("n'affiche pas le champ d'une ressource non requise", () => {
    renderSection({ required: { gems: 10, hearts: 0 } });
    // hearts requis = 0 → un seul champ par joueur (gems)
    expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
    expect(screen.queryByText('Cœurs')).not.toBeInTheDocument();
  });
});
