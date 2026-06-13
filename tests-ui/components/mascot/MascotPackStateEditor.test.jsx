import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MascotPackStateEditor from '../../../src/components/mascot/MascotPackStateEditor.jsx';

const PACK = { framesBase: '/assets/mascots/demo/' };

function renderEditor(overrides = {}) {
  const props = {
    stateKey: 'idle',
    active: true,
    spec: { files: ['a.png', 'b.png'], fps: 8 },
    pack: PACK,
    srcPreviewStatus: {},
    setSrcPreviewStatus: () => {},
    onToggleState: vi.fn(),
    onUpdateStateEntry: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<MascotPackStateEditor {...props} />) };
}

describe('MascotPackStateEditor', () => {
  test('état inactif : pas de corps d’édition', () => {
    renderEditor({ active: false, spec: {} });
    expect(screen.queryByText('Fichiers relatifs (framesBase)')).toBeNull();
  });

  test('état actif en mode fichiers : liste les frames et le bouton Retirer', () => {
    renderEditor();
    expect(screen.getByText('a.png')).toBeTruthy();
    expect(screen.getByText('b.png')).toBeTruthy();
    expect(screen.getAllByText('Retirer')).toHaveLength(2);
  });

  test('Descendre échange deux frames via onUpdateStateEntry', () => {
    const { props } = renderEditor();
    fireEvent.click(screen.getAllByText('Descendre')[0]);
    expect(props.onUpdateStateEntry).toHaveBeenCalledTimes(1);
    const [key, nextSpec] = props.onUpdateStateEntry.mock.calls[0];
    expect(key).toBe('idle');
    expect(nextSpec.files).toEqual(['b.png', 'a.png']);
  });

  test('Retirer la première frame', () => {
    const { props } = renderEditor();
    fireEvent.click(screen.getAllByText('Retirer')[0]);
    expect(props.onUpdateStateEntry.mock.calls[0][1].files).toEqual(['b.png']);
  });

  test('bascule de la case d’activation appelle onToggleState', () => {
    const { props } = renderEditor();
    const checkbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(checkbox);
    expect(props.onToggleState).toHaveBeenCalledWith('idle', false);
  });

  test('mode srcs : bouton + URL ajoute une entrée vide', () => {
    const { props } = renderEditor({ spec: { srcs: ['https://x/a.png'], fps: 8 } });
    fireEvent.click(screen.getByText('+ URL'));
    expect(props.onUpdateStateEntry.mock.calls[0][1].srcs).toEqual(['https://x/a.png', '']);
  });

  test('changer fps propage la nouvelle valeur', () => {
    const { props } = renderEditor();
    const fpsInput = screen.getByDisplayValue('8');
    fireEvent.change(fpsInput, { target: { value: '12' } });
    expect(props.onUpdateStateEntry.mock.calls[0][1].fps).toBe(12);
  });
});
