import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreateUserPanel } from '../../../src/components/profiles/CreateUserPanel.jsx';

const ROLE_TERMS = { studentSingular: 'n3beur', teacherShort: 'n3boss' };

/** Les libellés du panneau ne sont pas associés (pas de htmlFor) : on récupère le contrôle voisin via le conteneur .field. */
function fieldControl(labelText, tag = 'input') {
  const label = screen.getByText(labelText);
  return label.closest('.field').querySelector(tag);
}

function renderPanel(overrides = {}) {
  const setters = {
    setCreateRole: vi.fn(),
    setCreateFirstName: vi.fn(),
    setCreateLastName: vi.fn(),
    setCreatePassword: vi.fn(),
    setCreatePseudo: vi.fn(),
    setCreateEmail: vi.fn(),
    setCreateDescription: vi.fn(),
    setCreateAffiliation: vi.fn(),
  };
  const handlers = { createUser: vi.fn() };
  const props = {
    roleTerms: ROLE_TERMS,
    affiliationOptions: [
      { value: 'both', label: 'Tous les espaces' },
      { value: 'n3', label: 'N3 uniquement' },
    ],
    isAdmin: false,
    canCreateUsers: true,
    createRole: 'eleve_novice',
    createFirstName: '',
    createLastName: '',
    createPassword: '',
    createPseudo: '',
    createEmail: '',
    createDescription: '',
    createAffiliation: 'both',
    createLoading: false,
    ...setters,
    ...handlers,
    ...overrides,
  };
  render(<CreateUserPanel {...props} />);
  return { ...setters, ...handlers };
}

describe('CreateUserPanel', () => {
  test('affiche le titre et les champs attendus', () => {
    renderPanel();
    expect(screen.getByText("Création unitaire d'utilisateur")).toBeTruthy();
    expect(screen.getByText('Prénom')).toBeTruthy();
    expect(screen.getByText('Nom')).toBeTruthy();
    expect(screen.getByText('Mot de passe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Créer' })).toBeTruthy();
  });

  test("l'option Admin est absente pour un non-admin", () => {
    renderPanel({ isAdmin: false });
    expect(screen.queryByRole('option', { name: 'Admin' })).toBeNull();
  });

  test("l'option Admin est présente pour un admin", () => {
    renderPanel({ isAdmin: true });
    expect(screen.getByRole('option', { name: 'Admin' })).toBeTruthy();
  });

  test('le bouton Créer appelle createUser', () => {
    const { createUser } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  test('saisir le prénom appelle setCreateFirstName', () => {
    const { setCreateFirstName } = renderPanel();
    fireEvent.change(fieldControl('Prénom'), { target: { value: 'Léo' } });
    expect(setCreateFirstName).toHaveBeenCalledWith('Léo');
  });

  test('sans permission : libellé « (PIN requis) » et bouton désactivé', () => {
    renderPanel({ canCreateUsers: false });
    const btn = screen.getByRole('button', { name: 'Créer (PIN requis)' });
    expect(btn.disabled).toBe(true);
  });

  test('en cours de création : libellé « Création… » et bouton désactivé', () => {
    renderPanel({ createLoading: true });
    expect(screen.getByRole('button', { name: 'Création…' }).disabled).toBe(true);
  });

  test("l'affiliation est désactivée si le profil n'est pas eleve_novice", () => {
    renderPanel({ createRole: 'prof' });
    expect(fieldControl('Affiliation n3beur', 'select').disabled).toBe(true);
  });
});
