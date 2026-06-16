import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MascotStudioModeTabs from '../../../src/components/mascot/MascotStudioModeTabs.jsx';

const MODES = [
  { id: 'packs', label: 'Packs' },
  { id: 'dialogues', label: 'Dialogues' },
];

describe('MascotStudioModeTabs', () => {
  test('rend un onglet par mode avec son libellé', () => {
    render(<MascotStudioModeTabs modes={MODES} activeMode="packs" onSelectMode={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Packs' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Dialogues' })).toBeTruthy();
  });

  test('le mode actif porte aria-selected et la classe btn-primary', () => {
    render(<MascotStudioModeTabs modes={MODES} activeMode="dialogues" onSelectMode={vi.fn()} />);
    const active = screen.getByRole('tab', { name: 'Dialogues' });
    const inactive = screen.getByRole('tab', { name: 'Packs' });
    expect(active.getAttribute('aria-selected')).toBe('true');
    expect(active.className).toContain('btn-primary');
    expect(inactive.getAttribute('aria-selected')).toBe('false');
    expect(inactive.className).toContain('btn-ghost');
  });

  test('clic sur un onglet remonte son id au parent', () => {
    const onSelectMode = vi.fn();
    render(<MascotStudioModeTabs modes={MODES} activeMode="packs" onSelectMode={onSelectMode} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Dialogues' }));
    expect(onSelectMode).toHaveBeenCalledWith('dialogues');
  });
});
