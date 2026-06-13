import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StateAliasesEditor from '../../../src/components/mascot/StateAliasesEditor.jsx';

describe('StateAliasesEditor', () => {
  test('affiche « Aucun alias » quand vide', () => {
    render(<StateAliasesEditor stateFrames={{}} aliases={{}} onChange={() => {}} />);
    expect(screen.getByText('Aucun alias.')).toBeTruthy();
  });

  test('rend une ligne par alias existant', () => {
    render(
      <StateAliasesEditor
        stateFrames={{ idle: { files: ['a.png'] } }}
        aliases={{ walking: 'idle' }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('→')).toBeTruthy();
    expect(screen.getAllByText('Supprimer')).toHaveLength(1);
  });

  test('+ Alias cible un état possédant des frames (idle prioritaire)', () => {
    const onChange = vi.fn();
    render(
      <StateAliasesEditor
        stateFrames={{ idle: { files: ['a.png'] }, walking: { files: [] } }}
        aliases={{}}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('+ Alias'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(Object.values(next)).toContain('idle');
  });

  test('Supprimer retire l’alias de l’objet renvoyé', () => {
    const onChange = vi.fn();
    render(
      <StateAliasesEditor
        stateFrames={{ idle: { files: ['a.png'] } }}
        aliases={{ walking: 'idle' }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('Supprimer'));
    expect(onChange).toHaveBeenCalledWith({});
  });

  test('+ Alias désactivé quand tous les états sont déjà mappés', () => {
    const allStates = {};
    // Mappe les 13 états canoniques (clés = STATE_OPTIONS) pour saturer.
    ['alert', 'angry', 'celebrate', 'happy', 'happy_jump', 'idle', 'inspect',
      'map_read', 'running', 'spin', 'surprise', 'talk', 'walking'].forEach((s) => {
      allStates[s] = 'idle';
    });
    render(<StateAliasesEditor stateFrames={{}} aliases={allStates} onChange={() => {}} />);
    expect(screen.getByText('+ Alias').disabled).toBe(true);
  });
});
