import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  GLSpellCastSpellPicker,
  GLSpellCastTeamPicker,
} from '../../src/gl/components/spell-cast/GLSpellCastPickers.jsx';

const SPELLS = [
  { spell_code: 'PLUIE', nom: 'Pluie', emoji: '🌧️' },
  { spell_code: 'SOLEIL', nom: 'Soleil' },
];

const TEAMS = [
  { id: 1, name: 'Rouges' },
  { id: 2, name: 'Bleus' },
];

describe('GLSpellCastSpellPicker', () => {
  test('rend une tuile par sortilège (nom + emoji avec repli)', () => {
    render(<GLSpellCastSpellPicker chapterSpells={SPELLS} onPick={vi.fn()} />);
    expect(screen.getByText('Pluie')).toBeInTheDocument();
    expect(screen.getByText('Soleil')).toBeInTheDocument();
    expect(screen.getByText('🌧️')).toBeInTheDocument();
    expect(screen.getByText('✨')).toBeInTheDocument(); // repli emoji
  });

  test('remonte onPick(code) en chaîne au clic', () => {
    const onPick = vi.fn();
    render(<GLSpellCastSpellPicker chapterSpells={SPELLS} onPick={onPick} />);
    fireEvent.click(screen.getByText('Pluie'));
    expect(onPick).toHaveBeenCalledWith('PLUIE');
  });

  test('liste vide ne rend aucune tuile', () => {
    render(<GLSpellCastSpellPicker chapterSpells={[]} onPick={vi.fn()} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('GLSpellCastTeamPicker', () => {
  test('rend un bouton par équipe', () => {
    render(<GLSpellCastTeamPicker teams={TEAMS} selectedTeamId={null} onSelectTeam={vi.fn()} />);
    expect(screen.getByText('Rouges')).toBeInTheDocument();
    expect(screen.getByText('Bleus')).toBeInTheDocument();
  });

  test('affiche un message si aucune équipe disponible', () => {
    render(<GLSpellCastTeamPicker teams={[]} selectedTeamId={null} onSelectTeam={vi.fn()} />);
    expect(screen.getByText(/Aucune équipe disponible/)).toBeInTheDocument();
  });

  test('remonte onSelectTeam(id) au clic', () => {
    const onSelectTeam = vi.fn();
    render(
      <GLSpellCastTeamPicker teams={TEAMS} selectedTeamId={null} onSelectTeam={onSelectTeam} />,
    );
    fireEvent.click(screen.getByText('Bleus'));
    expect(onSelectTeam).toHaveBeenCalledWith(2);
  });

  test('désactive les boutons quand busy', () => {
    render(<GLSpellCastTeamPicker teams={TEAMS} selectedTeamId={1} busy onSelectTeam={vi.fn()} />);
    screen.getAllByRole('button').forEach((btn) => expect(btn.disabled).toBe(true));
  });
});
