import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskFormReferentsField } from '../../src/components/tasks/TaskFormReferentsField.jsx';

const TERMS = { studentPlural: 'n3beurs', studentSingular: 'n3beur', teacherSingular: 'n3boss' };
const TEACHER = { id: 't1', display_name: 'Alice', user_type: 'teacher', primary_role_slug: 'prof' };
const STUDENT = { id: 's1', first_name: 'Bob', last_name: 'Martin', user_type: 'student' };

function renderField(props = {}) {
  const onSearchChange = vi.fn();
  const onToggle = vi.fn();
  const onClear = vi.fn();
  render(
    <TaskFormReferentsField
      terms={TERMS}
      candidates={[TEACHER, STUDENT]}
      search=""
      onSearchChange={onSearchChange}
      selectedCount={0}
      filteredTeacher={[TEACHER]}
      filteredStudent={[STUDENT]}
      selectedIds={[]}
      onToggle={onToggle}
      onClear={onClear}
      {...props}
    />
  );
  return { onSearchChange, onToggle, onClear };
}

describe('TaskFormReferentsField', () => {
  test('aucun candidat : message de chargement, pas de recherche', () => {
    renderField({ candidates: [], filteredTeacher: [], filteredStudent: [] });
    expect(screen.getByText(/Chargement de la liste/)).toBeTruthy();
    expect(document.querySelector('input')).toBeNull();
  });

  test('rend les sous-sections équipe / élèves avec libellés et rôles', () => {
    renderField();
    expect(screen.getByText('Équipe pédagogique')).toBeTruthy();
    expect(screen.getByText('N3beurs')).toBeTruthy();
    expect(screen.getByText(/Alice/)).toBeTruthy();
    expect(screen.getByText(/Bob Martin/)).toBeTruthy();
    expect(screen.getByText(/— n3boss/)).toBeTruthy();
    expect(screen.getByText(/— n3beur/)).toBeTruthy();
  });

  test('coche un candidat sélectionné', () => {
    renderField({ selectedIds: ['t1'] });
    const checked = [...document.querySelectorAll('input[type="checkbox"]')].filter((c) => c.checked);
    expect(checked).toHaveLength(1);
  });

  test('clic case : onToggle avec l’id normalisé', () => {
    const { onToggle } = renderField();
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(onToggle).toHaveBeenCalledWith('t1');
  });

  test('recherche et effacement déclenchent les callbacks', () => {
    const { onSearchChange, onClear } = renderField();
    fireEvent.change(screen.getByPlaceholderText('🔍 Filtrer par nom…'), { target: { value: 'al' } });
    expect(onSearchChange).toHaveBeenCalledWith('al');
    fireEvent.click(screen.getByRole('button', { name: 'Effacer les référents' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  test('filtres vides → message « Aucun résultat »', () => {
    renderField({ filteredTeacher: [], filteredStudent: [] });
    expect(screen.getByText('Aucun résultat pour ce filtre.')).toBeTruthy();
  });
});
