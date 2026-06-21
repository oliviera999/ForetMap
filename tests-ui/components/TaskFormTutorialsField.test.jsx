import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskFormTutorialsField } from '../../src/components/tasks/TaskFormTutorialsField.jsx';

const T1 = { id: 1, title: 'Arrosage' };
const T2 = { id: 2, title: 'Compostage' };

function renderField(props = {}) {
  const onSearchChange = vi.fn();
  const onToggle = vi.fn();
  const onSelectAll = vi.fn();
  const onClear = vi.fn();
  render(
    <TaskFormTutorialsField
      tutorials={[T1, T2]}
      filteredTutorials={[T1, T2]}
      search=""
      onSearchChange={onSearchChange}
      selectedIds={[]}
      onToggle={onToggle}
      onSelectAll={onSelectAll}
      onClear={onClear}
      {...props}
    />,
  );
  return { onSearchChange, onToggle, onSelectAll, onClear };
}

describe('TaskFormTutorialsField', () => {
  test('aucun tutoriel : message dédié, pas de recherche', () => {
    renderField({ tutorials: [], filteredTutorials: [] });
    expect(screen.getByText('Aucun tutoriel disponible.')).toBeTruthy();
    expect(document.querySelector('input[type="text"], input:not([type])')).toBeNull();
  });

  test('rend les tutoriels filtrés avec leurs titres', () => {
    renderField();
    expect(screen.getByText(/Arrosage/)).toBeTruthy();
    expect(screen.getByText(/Compostage/)).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  test('coche les ids sélectionnés (normalisés)', () => {
    renderField({ selectedIds: ['1'] });
    const checked = screen.getAllByRole('checkbox').filter((c) => c.checked);
    expect(checked).toHaveLength(1);
  });

  test('clic case : onToggle avec l’id du tutoriel', () => {
    const { onToggle } = renderField();
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  test('compteur et raccourcis « Tout sélectionner / Effacer »', () => {
    const { onSelectAll, onClear } = renderField({ selectedIds: [1] });
    expect(screen.getByText('1 sélectionné')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tout sélectionner' }));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Effacer' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  test('recherche déclenche onSearchChange', () => {
    const { onSearchChange } = renderField();
    fireEvent.change(screen.getByPlaceholderText('🔍 Rechercher un tutoriel...'), {
      target: { value: 'arr' },
    });
    expect(onSearchChange).toHaveBeenCalledWith('arr');
  });

  test('filtre vide → message « Aucun tutoriel trouvé »', () => {
    renderField({ filteredTutorials: [] });
    expect(screen.getByText('Aucun tutoriel trouvé.')).toBeTruthy();
  });
});
