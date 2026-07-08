import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateUserPanel } from '../../../src/components/profiles/CreateUserPanel.jsx';
import { api } from '../../../src/services/api.js';

vi.mock('../../../src/services/api.js', () => ({
  api: vi.fn(async () => ({})),
  API: '',
  getAuthToken: () => null,
}));

const ROLE_TERMS = { studentSingular: 'n3beur', teacherShort: 'n3boss' };

/** Les libellés du panneau ne sont pas associés (pas de htmlFor) : on récupère le contrôle voisin via le conteneur .field. */
function fieldControl(labelText, tag = 'input') {
  const label = screen.getByText(labelText);
  return label.closest('.field').querySelector(tag);
}

function renderPanel(overrides = {}) {
  const callbacks = {
    setErr: vi.fn(),
    setMsg: vi.fn(),
    onCreated: vi.fn(async () => {}),
  };
  const props = {
    roleTerms: ROLE_TERMS,
    affiliationOptions: [
      { value: 'both', label: 'Tous les espaces' },
      { value: 'n3', label: 'N3 uniquement' },
    ],
    isAdmin: false,
    canCreateUsers: true,
    ...callbacks,
    ...overrides,
  };
  render(<CreateUserPanel {...props} />);
  return { ...callbacks, ...props };
}

function fillRequiredFields() {
  fireEvent.change(fieldControl('Prénom'), { target: { value: 'Léa' } });
  fireEvent.change(fieldControl('Nom'), { target: { value: 'Martin' } });
  fireEvent.change(fieldControl('Mot de passe'), { target: { value: 'secret123' } });
}

describe('CreateUserPanel', () => {
  beforeEach(() => {
    api.mockClear();
    api.mockResolvedValue({});
  });

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

  test('la saisie du prénom met à jour le champ (état interne)', () => {
    renderPanel();
    fireEvent.change(fieldControl('Prénom'), { target: { value: 'Léo' } });
    expect(fieldControl('Prénom').value).toBe('Léo');
  });

  test('« Créer » sans prénom/nom/mot de passe : erreur de validation, aucun appel API', () => {
    const { setErr, onCreated } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    expect(setErr).toHaveBeenCalledWith('Prénom, nom et mot de passe sont requis');
    expect(api).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  test('création complète : POST /api/rbac/users, message de succès, onCreated, champs réinitialisés', async () => {
    api.mockResolvedValue({
      first_name: 'Léa',
      last_name: 'Martin',
      role_display_name: 'Novice',
    });
    const { setMsg, onCreated } = renderPanel();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const [path, method, body] = api.mock.calls[0];
    expect(path).toBe('/api/rbac/users');
    expect(method).toBe('POST');
    expect(body).toEqual({
      role_slug: 'eleve_novice',
      first_name: 'Léa',
      last_name: 'Martin',
      password: 'secret123',
      pseudo: null,
      email: null,
      description: null,
      affiliation: 'both',
    });
    await waitFor(() =>
      expect(setMsg).toHaveBeenCalledWith('Utilisateur créé : Léa Martin (Novice)'),
    );
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(fieldControl('Prénom').value).toBe('');
    expect(fieldControl('Nom').value).toBe('');
    expect(fieldControl('Mot de passe').value).toBe('');
  });

  test('échec API : setErr avec le message serveur, pas de onCreated', async () => {
    api.mockRejectedValue(new Error('pseudo déjà pris'));
    const { setErr, onCreated } = renderPanel();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(setErr).toHaveBeenCalledWith('pseudo déjà pris'));
    expect(onCreated).not.toHaveBeenCalled();
  });

  test('pendant la création : libellé « Création… » et bouton désactivé', async () => {
    let resolveApi;
    api.mockImplementation(() => new Promise((resolve) => (resolveApi = resolve)));
    renderPanel();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    expect(screen.getByRole('button', { name: 'Création…' }).disabled).toBe(true);
    resolveApi({ first_name: 'Léa', last_name: 'Martin', role_slug: 'eleve_novice' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Créer' })).toBeTruthy());
  });

  test('sans permission : libellé « (permission requise) » et bouton désactivé', () => {
    renderPanel({ canCreateUsers: false });
    const btn = screen.getByRole('button', { name: 'Créer (permission requise)' });
    expect(btn.disabled).toBe(true);
  });

  test("l'affiliation est désactivée si le profil sélectionné n'est pas eleve_novice", () => {
    renderPanel();
    fireEvent.change(fieldControl('Profil', 'select'), { target: { value: 'prof' } });
    expect(fieldControl('Affiliation n3beur', 'select').disabled).toBe(true);
  });
});
