import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLGameplayPresetsPanel } from '../../src/gl/components/settings/GLGameplayPresetsPanel.jsx';

const PRESETS = [
  { id: 'minimal', label: 'Minimal', description: 'Pas de tour ni narration.' },
  { id: 'full', label: 'Complet', description: 'Tout activé.' },
];

function renderPanel(props = {}) {
  return render(
    <GLGameplayPresetsPanel
      presets={PRESETS}
      applyingPresetId=""
      onApply={vi.fn()}
      {...props}
    />,
  );
}

describe('GLGameplayPresetsPanel', () => {
  test('rend chaque profil avec libellé et description', () => {
    renderPanel();
    expect(screen.getByText('Minimal')).toBeInTheDocument();
    expect(screen.getByText('Pas de tour ni narration.')).toBeInTheDocument();
    expect(screen.getByText('Complet')).toBeInTheDocument();
  });

  test('appelle onApply avec le profil au clic', () => {
    const onApply = vi.fn();
    renderPanel({ onApply });
    fireEvent.click(screen.getAllByRole('button', { name: 'Appliquer' })[0]);
    expect(onApply).toHaveBeenCalledWith(PRESETS[0]);
  });

  test('désactive tous les boutons pendant une application', () => {
    renderPanel({ applyingPresetId: 'minimal' });
    const buttons = screen.getAllByRole('button', { name: /Appliquer|Chargement/ });
    buttons.forEach((btn) => expect(btn.disabled).toBe(true));
  });

  test('liste vide ne rend aucun bouton', () => {
    renderPanel({ presets: [] });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
