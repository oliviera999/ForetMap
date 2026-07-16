import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLLoreRetriggerSettings } from '../../../src/gl/components/settings/GLLoreRetriggerSettings.jsx';

const baseSettings = {
  'gameplay.qcm_mj_only': false,
  'gameplay.marker_question_retrigger': 'every_arrival',
  'gameplay.zone_content_retrigger': 'once_per_game',
  'gameplay.lore_feuillet_retrigger': 'once_per_team',
  'gameplay.lore_spoiler_max_level': 'recit',
  'gameplay.lore_feuillet_acquisition_enabled': false,
};

describe('GLLoreRetriggerSettings', () => {
  test('rend les sections re-déclenchement et Carnet de Sélène', () => {
    render(
      <GLLoreRetriggerSettings
        settings={baseSettings}
        savingKey=""
        onSaveSetting={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('QCM (biomes et lore) réservés au MJ')).toBeTruthy();
    expect(screen.getByText('Carnet de Sélène (lore)')).toBeTruthy();
    expect(screen.getByText('Acquisition de feuillets par consultation')).toBeTruthy();
  });

  test('cocher « QCM réservés au MJ » appelle onToggle avec la bonne clé', () => {
    const onToggle = vi.fn();
    render(
      <GLLoreRetriggerSettings
        settings={baseSettings}
        savingKey=""
        onSaveSetting={vi.fn()}
        onToggle={onToggle}
      />,
    );
    const checkbox = screen
      .getByText('QCM (biomes et lore) réservés au MJ')
      .closest('label')
      .querySelector('input[type="checkbox"]');
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith('gameplay.qcm_mj_only', true);
  });

  test('changer un select re-déclenchement appelle onSaveSetting', () => {
    const onSaveSetting = vi.fn();
    render(
      <GLLoreRetriggerSettings
        settings={baseSettings}
        savingKey=""
        onSaveSetting={onSaveSetting}
        onToggle={vi.fn()}
      />,
    );
    const select = screen
      .getByText('Re-déclenchement des questions sur repère')
      .closest('label')
      .querySelector('select');
    fireEvent.change(select, { target: { value: 'once_per_team' } });
    expect(onSaveSetting).toHaveBeenCalledWith(
      'gameplay.marker_question_retrigger',
      'once_per_team',
    );
  });
});
