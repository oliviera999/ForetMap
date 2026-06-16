import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLGameplayTogglesList } from '../../src/gl/components/settings/GLGameplayTogglesList.jsx';

const TOGGLES = [
  { key: 'a.enabled', label: 'Alpha', hint: 'Aide alpha' },
  { key: 'b.enabled', label: 'Bravo', hint: 'Aide bravo' },
];

function isChecked(settings, key) {
  return settings?.[key] === true;
}

function renderList(props = {}) {
  return render(
    <GLGameplayTogglesList
      toggles={TOGGLES}
      isChecked={isChecked}
      settings={{}}
      savingKey=""
      onToggle={vi.fn()}
      {...props}
    />,
  );
}

describe('GLGameplayTogglesList', () => {
  test('rend un libellé et une aide par toggle', () => {
    renderList();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Aide alpha')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
  });

  test('coche selon isChecked', () => {
    renderList({ settings: { 'a.enabled': true } });
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
  });

  test("désactive la ligne en cours d'enregistrement", () => {
    renderList({ savingKey: 'b.enabled' });
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes[0].disabled).toBe(false);
    expect(boxes[1].disabled).toBe(true);
  });

  test('appelle onToggle(key, checked) au changement', () => {
    const onToggle = vi.fn();
    renderList({ onToggle });
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(onToggle).toHaveBeenCalledWith('a.enabled', true);
  });

  test('liste vide ne rend aucun toggle', () => {
    renderList({ toggles: [] });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});
