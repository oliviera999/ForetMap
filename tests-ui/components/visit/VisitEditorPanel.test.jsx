import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../../../src/services/api.js';

vi.mock('../../../src/services/api.js', () => ({
  api: vi.fn(async () => ({})),
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

// MarkdownTextarea est un éditeur riche (contentEditable) : réduit à un textarea simple
// pour isoler le câblage du panneau (l'éditeur riche est testé ailleurs).
vi.mock('../../../src/components/MarkdownTextarea.jsx', () => ({
  MarkdownTextarea: ({ value, onChange, placeholder }) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} />
  ),
}));

import { VisitEditorPanel } from '../../../src/components/visit/VisitEditorPanel.jsx';

const ROLE_TERMS = { teacherShort: 'n3boss' };

const ZONE = {
  id: 7,
  name: '🌳 Verger',
  visit_subtitle: 'Sous-titre',
  visit_short_description: 'Desc courte',
  visit_details_title: 'Détails',
  visit_details_text: 'Texte détails',
  visit_sort_order: 3,
  visit_is_active: 1,
  visit_media: [],
};

function setup(overrides = {}) {
  const props = {
    selected: ZONE,
    selectedType: 'zone',
    onSaved: vi.fn(),
    onForceLogout: vi.fn(),
    isTeacher: true,
    roleTerms: ROLE_TERMS,
    ...overrides,
  };
  render(<VisitEditorPanel {...props} />);
  return props;
}

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({});
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockImplementation(() => true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('VisitEditorPanel', () => {
  test('non enseignant ou sans sélection → ne rend rien', () => {
    const { container: c1 } = render(
      <VisitEditorPanel
        isTeacher={false}
        selected={ZONE}
        selectedType="zone"
        roleTerms={ROLE_TERMS}
      />,
    );
    expect(c1).toBeEmptyDOMElement();
    const { container: c2 } = render(
      <VisitEditorPanel isTeacher selected={null} selectedType="zone" roleTerms={ROLE_TERMS} />,
    );
    expect(c2).toBeEmptyDOMElement();
  });

  test('préremplit le formulaire depuis la sélection (zone)', () => {
    setup();
    expect(screen.getByText('Édition visite (n3boss)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('🌳 Verger')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Sous-titre')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3')).toBeInTheDocument();
  });

  test('Sauver → PUT /api/visit/zones/:id avec le payload du formulaire puis onSaved', async () => {
    const { onSaved } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sauver' }));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        '/api/visit/zones/7',
        'PUT',
        expect.objectContaining({
          name: '🌳 Verger',
          subtitle: 'Sous-titre',
          short_description: 'Desc courte',
          details_title: 'Détails',
          details_text: 'Texte détails',
          sort_order: 3,
          is_active: true,
        }),
      );
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  test('pas de suppression côté visite : le lieu se supprime depuis la carte', () => {
    setup();
    expect(screen.queryByRole('button', { name: /Supprimer/ })).not.toBeInTheDocument();
    expect(screen.getByText(/supprimez-le depuis la carte/)).toBeInTheDocument();
  });

  test('action média (reload de la même sélection) ne réinitialise pas la saisie en cours', () => {
    const { rerender } = render(
      <VisitEditorPanel
        selected={ZONE}
        selectedType="zone"
        onSaved={vi.fn()}
        onForceLogout={vi.fn()}
        isTeacher
        roleTerms={ROLE_TERMS}
      />,
    );
    // L'enseignant modifie le sous-titre sans avoir cliqué « Sauver ».
    fireEvent.change(screen.getByDisplayValue('Sous-titre'), {
      target: { value: 'Sous-titre en cours' },
    });
    expect(screen.getByDisplayValue('Sous-titre en cours')).toBeInTheDocument();

    // Une action média recharge la sélection côté parent : nouvel objet `selected` (même id).
    rerender(
      <VisitEditorPanel
        selected={{ ...ZONE }}
        selectedType="zone"
        onSaved={vi.fn()}
        onForceLogout={vi.fn()}
        isTeacher
        roleTerms={ROLE_TERMS}
      />,
    );

    // La saisie non sauvegardée survit (pas de reset-clobber).
    expect(screen.getByDisplayValue('Sous-titre en cours')).toBeInTheDocument();
  });

  test('changer d’élément sélectionné recharge bien le formulaire', () => {
    const { rerender } = render(
      <VisitEditorPanel
        selected={ZONE}
        selectedType="zone"
        onSaved={vi.fn()}
        onForceLogout={vi.fn()}
        isTeacher
        roleTerms={ROLE_TERMS}
      />,
    );
    expect(screen.getByDisplayValue('Sous-titre')).toBeInTheDocument();
    rerender(
      <VisitEditorPanel
        selected={{ ...ZONE, id: 8, name: '🌿 Autre', visit_subtitle: 'Autre sous-titre' }}
        selectedType="zone"
        onSaved={vi.fn()}
        onForceLogout={vi.fn()}
        isTeacher
        roleTerms={ROLE_TERMS}
      />,
    );
    expect(screen.getByDisplayValue('Autre sous-titre')).toBeInTheDocument();
  });

  test('envoie la révision ouverte avec le formulaire', async () => {
    setup({ selected: { ...ZONE, edit_revision: 4 } });
    fireEvent.click(screen.getByRole('button', { name: 'Sauver' }));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        '/api/visit/zones/7',
        'PUT',
        expect.objectContaining({ name: '🌳 Verger', expected_revision: 4 }),
      );
    });
  });

  test('conflit : écraser renvoie la révision courante, renoncer n’enregistre pas', async () => {
    const conflict = new Error('modifié');
    conflict.status = 409;
    conflict.body = { code: 'edit_conflict', current_revision: 9, error: 'conflit' };
    api.mockRejectedValueOnce(conflict).mockResolvedValueOnce({ edit_revision: 10 });
    const { onSaved } = setup({ selected: { ...ZONE, edit_revision: 4 } });
    fireEvent.click(screen.getByRole('button', { name: 'Sauver' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenLastCalledWith(
      '/api/visit/zones/7',
      'PUT',
      expect.objectContaining({ expected_revision: 9 }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    api.mockReset();
    api.mockRejectedValueOnce(conflict);
    window.confirm.mockReturnValue(false);
    const declined = setup({ selected: { ...ZONE, id: 11, edit_revision: 4 } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Sauver' })[1]);
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(declined.onSaved).not.toHaveBeenCalled();
    expect(api).toHaveBeenCalledTimes(1);
  });

  test('repère : PUT /api/visit/markers/:id avec label + emoji', async () => {
    setup({
      selected: { ...ZONE, id: 9, label: 'Pommier', emoji: '🍎', name: undefined },
      selectedType: 'marker',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sauver' }));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        '/api/visit/markers/9',
        'PUT',
        expect.objectContaining({
          label: 'Pommier',
          emoji: '🍎',
        }),
      );
    });
  });
});
