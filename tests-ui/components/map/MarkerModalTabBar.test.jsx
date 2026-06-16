import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MarkerModalTabBar } from '../../../src/components/map/MarkerModalTabBar.jsx';

const TABS = [
  { id: 'info', label: 'ℹ️ Info' },
  { id: 'photos', label: '📷 Photos' },
  { id: 'edit', label: '✏️ Modifier' },
];

function renderTabBar(overrides = {}) {
  const onSelect = vi.fn();
  render(<MarkerModalTabBar tabs={TABS} activeTab="info" onSelect={onSelect} {...overrides} />);
  return { onSelect };
}

describe('MarkerModalTabBar', () => {
  test('rend un bouton par onglet avec son libellé', () => {
    renderTabBar();
    expect(screen.getByRole('button', { name: 'ℹ️ Info' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '📷 Photos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '✏️ Modifier' })).toBeTruthy();
  });

  test('cliquer un onglet appelle onSelect avec son id', () => {
    const { onSelect } = renderTabBar();
    fireEvent.click(screen.getByRole('button', { name: '📷 Photos' }));
    expect(onSelect).toHaveBeenCalledWith('photos');
  });

  test("l'onglet actif est mis en avant (gras + fond forêt)", () => {
    renderTabBar({ activeTab: 'photos' });
    const active = screen.getByRole('button', { name: '📷 Photos' });
    const inactive = screen.getByRole('button', { name: 'ℹ️ Info' });
    expect(active.style.fontWeight).toBe('700');
    expect(active.style.background).toBe('var(--forest)');
    expect(active.style.color).toBe('white');
    expect(inactive.style.fontWeight).toBe('400');
    expect(inactive.style.background).toBe('transparent');
  });

  test('liste vide : aucun bouton rendu', () => {
    renderTabBar({ tabs: [] });
    expect(screen.queryByRole('button')).toBeNull();
  });
});
