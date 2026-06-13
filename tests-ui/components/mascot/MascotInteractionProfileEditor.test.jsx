import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MascotInteractionProfileEditor from '../../../src/components/mascot/MascotInteractionProfileEditor.jsx';
import { VISIT_MASCOT_INTERACTION_EVENT_KEYS } from '../../../src/utils/visitMascotInteractionEvents.js';

describe('MascotInteractionProfileEditor', () => {
  test('pack v1 : affiche le bouton de passage en v2 et déclenche le callback', () => {
    const onUpgradeToV2 = vi.fn();
    render(
      <MascotInteractionProfileEditor
        pack={{ mascotPackVersion: 1 }}
        onUpgradeToV2={onUpgradeToV2}
        onPatchRule={vi.fn()}
      />
    );
    const btn = screen.getByRole('button', { name: /version 2/i });
    fireEvent.click(btn);
    expect(onUpgradeToV2).toHaveBeenCalledTimes(1);
  });

  test('pack v2 : affiche une carte par événement d’interaction', () => {
    render(
      <MascotInteractionProfileEditor
        pack={{ mascotPackVersion: 2, interactionProfile: {} }}
        onUpgradeToV2={vi.fn()}
        onPatchRule={vi.fn()}
      />
    );
    // Pas de bouton d'upgrade en v2.
    expect(screen.queryByRole('button', { name: /version 2/i })).toBeNull();
    // Au moins un sélecteur "Mode" par événement.
    const modeSelects = screen.getAllByRole('combobox');
    expect(modeSelects.length).toBeGreaterThanOrEqual(VISIT_MASCOT_INTERACTION_EVENT_KEYS.length);
  });

  test('changer le mode en « none » appelle onPatchRule avec { mode: "none" }', () => {
    const onPatchRule = vi.fn();
    render(
      <MascotInteractionProfileEditor
        pack={{ mascotPackVersion: 2, interactionProfile: {} }}
        onUpgradeToV2={vi.fn()}
        onPatchRule={onPatchRule}
      />
    );
    const firstMode = screen.getAllByRole('combobox')[0];
    fireEvent.change(firstMode, { target: { value: 'none' } });
    expect(onPatchRule).toHaveBeenCalledWith(
      VISIT_MASCOT_INTERACTION_EVENT_KEYS[0],
      { mode: 'none' },
    );
  });
});
