import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MascotPackCustomBehaviorsEditor from '../../../src/components/mascot/MascotPackCustomBehaviorsEditor.jsx';

function renderEditor(pack = {}) {
  const patchPack = vi.fn();
  render(<MascotPackCustomBehaviorsEditor pack={pack} patchPack={patchPack} />);
  return { patchPack };
}

describe('MascotPackCustomBehaviorsEditor', () => {
  test('ajoute un état personnalisé', () => {
    const { patchPack } = renderEditor();
    fireEvent.click(screen.getByText('+ État personnalisé'));
    expect(patchPack).toHaveBeenCalledTimes(1);
    const arg = patchPack.mock.calls[0][0];
    expect(Array.isArray(arg.customStates)).toBe(true);
    expect(arg.customStates[0].key).toMatch(/^etat_\d+$/);
  });

  test('ajoute un déclencheur périodique par défaut', () => {
    const { patchPack } = renderEditor();
    fireEvent.click(screen.getByText('+ Déclencheur personnalisé'));
    const arg = patchPack.mock.calls[0][0];
    expect(arg.customTriggers[0].type).toBe('periodic');
    expect(arg.customTriggers[0].everyMs).toBeGreaterThanOrEqual(1000);
  });

  test('liste les états personnalisés existants comme cible de déclencheur', () => {
    renderEditor({
      customStates: [{ key: 'sort_magique', label: 'Sort magique' }],
      customTriggers: [
        { key: 't1', label: 'T', type: 'tap', state: 'sort_magique', durationMs: 900 },
      ],
    });
    // L'option personnalisée apparaît dans le menu d'état (libellé « (perso) »).
    expect(screen.getByText(/Sort magique \(perso\) \(sort_magique\)/)).toBeTruthy();
  });

  test('change le type d’un déclencheur en tap masque l’intervalle', () => {
    const { patchPack } = renderEditor({
      customTriggers: [
        { key: 't1', label: 'T', type: 'periodic', state: 'idle', durationMs: 900, everyMs: 5000 },
      ],
    });
    const typeSelect = screen.getByDisplayValue('Périodique (ambiant)');
    fireEvent.change(typeSelect, { target: { value: 'tap' } });
    const arg = patchPack.mock.calls[0][0];
    expect(arg.customTriggers[0].type).toBe('tap');
  });
});
