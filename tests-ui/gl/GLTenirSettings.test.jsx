import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLTenirSettings } from '../../src/gl/components/settings/GLTenirSettings.jsx';

function renderSettings(props = {}) {
  return render(
    <GLTenirSettings
      settings={{}}
      savingKey=""
      onSaveSetting={vi.fn()}
      onToggle={vi.fn()}
      {...props}
    />,
  );
}

describe('GLTenirSettings', () => {
  test('rend les interrupteurs, la surface et les plafonds', () => {
    renderSettings();
    expect(screen.getByText(/Tenir à deux \(mouture v2\)/)).toBeInTheDocument();
    expect(
      screen.getByText('Mouture « Tenir à deux » active (nouvelles parties)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Surface par défaut d’une nouvelle partie')).toBeInTheDocument();
    expect(screen.getByText('Cœurs maximum')).toBeInTheDocument();
    expect(screen.getByText('Gemmes maximum')).toBeInTheDocument();
  });

  test('reflète les valeurs courantes (booléen, enum entre guillemets, json)', () => {
    renderSettings({
      settings: {
        'gameplay.tenir_enabled': true,
        'gameplay.tenir_voile': false,
        'gameplay.tenir_surface': '"tablette"',
        'gameplay.tenir_fouilles_par_tour': 2,
        'gameplay.tenir_voile_bonus_par_plateau': '{"1":3,"2":4,"3":5,"4":6}',
      },
    });
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0].checked).toBe(true);
    const voile = screen.getByLabelText('Le voile');
    expect(voile.checked).toBe(false);
    expect(screen.getAllByRole('combobox')[0].value).toBe('tablette');
    expect(screen.getByLabelText('Fouilles par équipe et par tour').value).toBe('2');
  });

  test('appelle onToggle sur un interrupteur et onSaveSetting sur la surface', () => {
    const onToggle = vi.fn();
    const onSaveSetting = vi.fn();
    renderSettings({ onToggle, onSaveSetting });
    fireEvent.click(screen.getByLabelText('Le voile'));
    expect(onToggle).toHaveBeenCalledWith('gameplay.tenir_voile', true);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'hybride' } });
    expect(onSaveSetting).toHaveBeenCalledWith('gameplay.tenir_surface', 'hybride');
  });

  test('un nombre est enregistré au blur avec sa valeur entière', () => {
    const onSaveSetting = vi.fn();
    renderSettings({ onSaveSetting, settings: { 'gameplay.tenir_des_count': 2 } });
    const input = screen.getByLabelText('Dés du geste Lancer');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    expect(onSaveSetting).toHaveBeenCalledWith('gameplay.tenir_des_count', 3);
  });

  test('un objet json est enregistré champ par champ', () => {
    const onSaveSetting = vi.fn();
    renderSettings({
      onSaveSetting,
      settings: { 'gameplay.tenir_fouille_seuils': { chaud: 0.06, tiede: 0.15 } },
    });
    const chaud = screen.getByLabelText('Chaud (≤)');
    fireEvent.change(chaud, { target: { value: '0.05' } });
    fireEvent.blur(chaud);
    expect(onSaveSetting).toHaveBeenCalledWith('gameplay.tenir_fouille_seuils', {
      chaud: 0.05,
      tiede: 0.15,
    });
  });

  test("désactive le contrôle en cours d'enregistrement", () => {
    renderSettings({ savingKey: 'gameplay.tenir_voile' });
    expect(screen.getByLabelText('Le voile').disabled).toBe(true);
  });
});
