import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StudentDeletePanel } from '../../../src/components/profiles/StudentDeletePanel.jsx';

const ROLE_TERMS = { studentSingular: 'n3beur', studentPlural: 'n3beurs' };

const STUDENTS = [
  { id: 1, first_name: 'Léa', last_name: 'Martin', stats: { done: 2, pending: 1 } },
  { id: 2, first_name: 'Tom', last_name: 'Durand', stats: { done: 0, pending: 0 } },
];

function renderPanel(overrides = {}) {
  const setters = {
    setSearchStudent: vi.fn(),
    setConfirmStudent: vi.fn(),
  };
  const handlers = { duplicateStudent: vi.fn() };
  const props = {
    roleTerms: ROLE_TERMS,
    canDeleteUi: true,
    canDuplicateStudents: true,
    searchStudent: '',
    filteredStudents: STUDENTS,
    ...setters,
    ...handlers,
    ...overrides,
  };
  render(<StudentDeletePanel {...props} />);
  return { ...setters, ...handlers };
}

describe('StudentDeletePanel', () => {
  test('affiche le titre et la liste des n3beurs', () => {
    renderPanel();
    expect(screen.getByText('Suppression de n3beurs')).toBeTruthy();
    expect(screen.getByText('Léa Martin')).toBeTruthy();
    expect(screen.getByText('Tom Durand')).toBeTruthy();
  });

  test('saisir une recherche appelle setSearchStudent', () => {
    const { setSearchStudent } = renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/Rechercher un\(e\) n3beur/), { target: { value: 'Léa' } });
    expect(setSearchStudent).toHaveBeenCalledWith('Léa');
  });

  test('le bouton Supprimer appelle setConfirmStudent avec la ligne', () => {
    const { setConfirmStudent } = renderPanel();
    fireEvent.click(screen.getAllByRole('button', { name: '🗑️ Supprimer' })[0]);
    expect(setConfirmStudent).toHaveBeenCalledWith(STUDENTS[0]);
  });

  test('le bouton Dupliquer appelle duplicateStudent avec la ligne', () => {
    const { duplicateStudent } = renderPanel();
    fireEvent.click(screen.getAllByRole('button', { name: '📄 Dupliquer' })[1]);
    expect(duplicateStudent).toHaveBeenCalledWith(STUDENTS[1]);
  });

  test('message vide spécifique selon la recherche', () => {
    renderPanel({ filteredStudents: [], searchStudent: 'zzz' });
    expect(screen.getByText('Aucun(e) n3beur trouvé(e).')).toBeTruthy();
  });

  test('message vide par défaut sans recherche', () => {
    renderPanel({ filteredStudents: [], searchStudent: '' });
    expect(screen.getByText('Aucun(e) n3beur disponible.')).toBeTruthy();
  });

  test('boutons désactivés selon les permissions', () => {
    renderPanel({ canDeleteUi: false, canDuplicateStudents: false });
    expect(screen.getAllByRole('button', { name: '🗑️ Supprimer' })[0].disabled).toBe(true);
    expect(screen.getAllByRole('button', { name: '📄 Dupliquer' })[0].disabled).toBe(true);
  });
});
