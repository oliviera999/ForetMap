import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ZoneInfoModalTabBar } from '../../../src/components/map/ZoneInfoModalTabBar.jsx';

const TABS = [
  { id: 'tasks', label: '✅ Tâches' },
  { id: 'info', label: 'ℹ️ Info' },
  { id: 'photos', label: '📷 Photos' },
];

function renderTabBar(overrides = {}) {
  const onSelect = vi.fn();
  render(<ZoneInfoModalTabBar tabs={TABS} activeTab="info" onSelect={onSelect} {...overrides} />);
  return { onSelect };
}

describe('ZoneInfoModalTabBar', () => {
  test('rend un bouton par onglet fourni', () => {
    renderTabBar();
    expect(screen.getByRole('button', { name: '✅ Tâches' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ℹ️ Info' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '📷 Photos' })).toBeTruthy();
  });

  test('clic sur un onglet appelle onSelect avec son id', () => {
    const { onSelect } = renderTabBar();
    fireEvent.click(screen.getByRole('button', { name: '📷 Photos' }));
    expect(onSelect).toHaveBeenCalledWith('photos');
  });

  test("l'onglet actif est mis en évidence (gras + fond forêt)", () => {
    renderTabBar();
    const active = screen.getByRole('button', { name: 'ℹ️ Info' });
    const inactive = screen.getByRole('button', { name: '📷 Photos' });
    expect(active.style.fontWeight).toBe('700');
    expect(active.style.background).toBe('var(--forest)');
    expect(inactive.style.fontWeight).toBe('400');
    expect(inactive.style.background).toBe('transparent');
  });

  test('liste vide : aucun bouton rendu', () => {
    renderTabBar({ tabs: [] });
    expect(screen.queryByRole('button')).toBeNull();
  });
});
