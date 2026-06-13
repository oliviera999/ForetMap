import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLSpellCastSettings } from '../../src/gl/components/settings/GLSpellCastSettings.jsx';

function renderSettings(props = {}) {
  return render(
    <GLSpellCastSettings
      settings={{}}
      savingKey=""
      onSaveSetting={vi.fn()}
      {...props}
    />,
  );
}

describe('GLSpellCastSettings', () => {
  test('rend les deux sélecteurs et le toggle MJ', () => {
    renderSettings();
    expect(screen.getByText('Mode de contribution')).toBeInTheDocument();
    expect(screen.getByText('Équipes pouvant lancer')).toBeInTheDocument();
    expect(screen.getByText('Seul le MJ peut lancer les sortilèges')).toBeInTheDocument();
  });

  test('reflète les valeurs courantes (guillemets retirés)', () => {
    renderSettings({
      settings: {
        'gameplay.spell_cast_contribution_mode': '"self_only"',
        'gameplay.spell_cast_team_scope': 'own_team',
        'gameplay.spell_cast_mj_only': true,
      },
    });
    const selects = screen.getAllByRole('combobox');
    expect(selects[0].value).toBe('self_only');
    expect(selects[1].value).toBe('own_team');
    expect(screen.getByRole('checkbox').checked).toBe(true);
  });

  test('appelle onSaveSetting au changement de mode de contribution', () => {
    const onSaveSetting = vi.fn();
    renderSettings({ onSaveSetting });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'coordinator' } });
    expect(onSaveSetting).toHaveBeenCalledWith('gameplay.spell_cast_contribution_mode', 'coordinator');
  });

  test('appelle onSaveSetting au changement de portée d\'équipe', () => {
    const onSaveSetting = vi.fn();
    renderSettings({ onSaveSetting });
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'mj_any' } });
    expect(onSaveSetting).toHaveBeenCalledWith('gameplay.spell_cast_team_scope', 'mj_any');
  });

  test('appelle onSaveSetting au toggle MJ only', () => {
    const onSaveSetting = vi.fn();
    renderSettings({ onSaveSetting });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onSaveSetting).toHaveBeenCalledWith('gameplay.spell_cast_mj_only', true);
  });

  test('désactive le contrôle en cours d\'enregistrement', () => {
    renderSettings({ savingKey: 'gameplay.spell_cast_mj_only' });
    expect(screen.getByRole('checkbox').disabled).toBe(true);
  });
});
