import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskFormLevelsField } from '../../src/components/tasks/TaskFormLevelsField.jsx';

function renderField(props = {}) {
  const onDangerChange = vi.fn();
  const onDifficultyChange = vi.fn();
  const onImportanceChange = vi.fn();
  render(
    <TaskFormLevelsField
      dangerLevel=""
      difficultyLevel=""
      importanceLevel=""
      onDangerChange={onDangerChange}
      onDifficultyChange={onDifficultyChange}
      onImportanceChange={onImportanceChange}
      {...props}
    />,
  );
  return { onDangerChange, onDifficultyChange, onImportanceChange };
}

describe('TaskFormLevelsField', () => {
  test('rend les trois sélecteurs avec leurs libellés', () => {
    renderField();
    expect(screen.getByText('Niveau de danger')).toBeTruthy();
    expect(screen.getByText('Niveau de difficulté')).toBeTruthy();
    expect(screen.getByText("Degré d'importance")).toBeTruthy();
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
  });

  test('reflète les valeurs courantes des niveaux', () => {
    renderField({
      dangerLevel: 'dangerous',
      difficultyLevel: 'easy',
      importanceLevel: 'high',
    });
    const [danger, difficulty, importance] = screen.getAllByRole('combobox');
    expect(danger.value).toBe('dangerous');
    expect(difficulty.value).toBe('easy');
    expect(importance.value).toBe('high');
  });

  test('changer le danger déclenche onDangerChange', () => {
    const { onDangerChange } = renderField();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'safe' } });
    expect(onDangerChange).toHaveBeenCalledTimes(1);
  });

  test('changer la difficulté déclenche onDifficultyChange', () => {
    const { onDifficultyChange } = renderField();
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'medium' } });
    expect(onDifficultyChange).toHaveBeenCalledTimes(1);
  });

  test("changer l'importance déclenche onImportanceChange", () => {
    const { onImportanceChange } = renderField();
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'absolute' } });
    expect(onImportanceChange).toHaveBeenCalledTimes(1);
  });
});
