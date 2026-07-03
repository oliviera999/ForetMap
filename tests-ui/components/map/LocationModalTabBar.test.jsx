import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LocationModalTabBar } from '../../../src/components/map/LocationModalTabBar.jsx';
import { MarkerModalTabBar } from '../../../src/components/map/MarkerModalTabBar.jsx';
import { ZoneInfoModalTabBar } from '../../../src/components/map/ZoneInfoModalTabBar.jsx';

const TABS = [
  { id: 'tasks', label: '✅ Tâches' },
  { id: 'info', label: 'ℹ️ Info' },
];

describe('LocationModalTabBar', () => {
  test('les anciens noms MarkerModalTabBar / ZoneInfoModalTabBar ré-exportent le même composant', () => {
    expect(MarkerModalTabBar).toBe(LocationModalTabBar);
    expect(ZoneInfoModalTabBar).toBe(LocationModalTabBar);
  });

  test('boutons type="button" (pas de submit implicite dans un formulaire)', () => {
    render(<LocationModalTabBar tabs={TABS} activeTab="info" onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    for (const b of buttons) expect(b.getAttribute('type')).toBe('button');
  });

  test('clic sur un onglet appelle onSelect avec son id', () => {
    const onSelect = vi.fn();
    render(<LocationModalTabBar tabs={TABS} activeTab="info" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: '✅ Tâches' }));
    expect(onSelect).toHaveBeenCalledWith('tasks');
  });
});
