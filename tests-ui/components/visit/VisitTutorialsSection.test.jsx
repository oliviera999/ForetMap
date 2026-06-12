import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../../../src/services/api.js';

vi.mock('../../../src/services/api.js', () => ({
  api: vi.fn(async () => ({})),
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

// L'accusé de lecture et les commentaires font leurs propres appels API : stubs ciblés.
vi.mock('../../../src/components/TutorialReadAcknowledge', () => ({
  TutorialReadAcknowledgeButton: ({ tutorialId, isRead, onAcknowledged }) => (
    <button type="button" data-testid={`ack-${tutorialId}`} onClick={() => onAcknowledged(Number(tutorialId))}>
      {isRead ? 'lu' : 'non lu'}
    </button>
  ),
}));
vi.mock('../../../src/components/context-comments', () => ({
  ContextComments: ({ contextId }) => <div data-testid={`comments-${contextId}`} />,
}));

import { VisitTutorialsSection } from '../../../src/components/visit/VisitTutorialsSection.jsx';

const TUTOS = [
  { id: 1, title: 'Tuto un', type: 'html', summary: 'Résumé un' },
  { id: 2, title: 'Tuto deux', type: 'link', source_url: '' },
];

function setup(overrides = {}) {
  const props = {
    visitImmersion: false,
    title: '📘 Tutoriels de la visite',
    emptyText: 'Aucun tutoriel sélectionné pour le moment.',
    isTeacher: false,
    availableTutorials: [],
    tutorials: TUTOS,
    mapId: 'foret',
    onSaved: vi.fn(),
    onForceLogout: vi.fn(),
    tutorialReadIds: new Set(),
    onTutorialAcknowledged: vi.fn(),
    onOpenTutorialPreview: vi.fn(),
    contextCommentsEnabled: false,
    studentId: null,
    canParticipateContextComments: true,
    ...overrides,
  };
  const utils = render(<VisitTutorialsSection {...props} />);
  return { props, ...utils };
}

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({});
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('VisitTutorialsSection', () => {
  test('grille des tutos sélectionnés ; « Lire » ouvre l’aperçu avec preview_url', () => {
    const { props } = setup();
    expect(screen.getByTestId('visit-map-tutorials-section')).toBeInTheDocument();
    expect(screen.getByText('Tuto un')).toBeInTheDocument();
    expect(screen.getByText('Résumé un')).toBeInTheDocument();
    const [lire1, lire2] = screen.getAllByRole('button', { name: '👁️ Lire' });
    fireEvent.click(lire1);
    expect(props.onOpenTutorialPreview).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, preview_url: '/api/tutorials/1/view' }),
    );
    // Tuto lien sans URL : aperçu non intégrable → bouton désactivé.
    expect(lire2).toBeDisabled();
  });

  test('liste vide → message dédié', () => {
    setup({ tutorials: [] });
    expect(screen.getByText('Aucun tutoriel sélectionné pour le moment.')).toBeInTheDocument();
  });

  test('immersion : rendu en disclosure repliable avec le même contenu', () => {
    setup({ visitImmersion: true });
    const section = screen.getByTestId('visit-map-tutorials-section');
    expect(section.tagName).toBe('DETAILS');
    expect(screen.getByText('📘 Tutoriels de la visite')).toBeInTheDocument();
    expect(screen.getByText('Tuto un')).toBeInTheDocument();
  });

  test('élève : pas de sélecteur prof ; accusé de lecture remonte l’id', () => {
    const { props } = setup();
    expect(screen.queryByText(/Choisir les tutoriels affichés en visite/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ack-1'));
    expect(props.onTutorialAcknowledged).toHaveBeenCalledWith(1);
  });

  test('prof : sélection pré-cochée depuis tutorials, coche/décoche puis PUT + onSaved', async () => {
    const { props } = setup({
      isTeacher: true,
      availableTutorials: [...TUTOS, { id: 3, title: 'Tuto trois', type: 'html' }],
    });
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((b) => b.checked)).toEqual([true, true, false]);
    fireEvent.click(boxes[2]);
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByRole('button', { name: '💾 Enregistrer la sélection des tutos' }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledWith('/api/visit/tutorials', 'PUT', {
      map_id: 'foret',
      tutorial_ids: [1, 3],
    });
  });

  test('échec sauvegarde → alert, pas de onSaved', async () => {
    api.mockRejectedValueOnce(new Error('boom'));
    const { props } = setup({ isTeacher: true, availableTutorials: TUTOS });
    fireEvent.click(screen.getByRole('button', { name: '💾 Enregistrer la sélection des tutos' }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('boom'));
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  test('commentaires contextuels : visibles seulement si activés et élève connecté', () => {
    setup({ contextCommentsEnabled: true, studentId: 42 });
    expect(screen.getByTestId('comments-1')).toBeInTheDocument();
    setup({ contextCommentsEnabled: true, studentId: null });
    expect(screen.getAllByTestId('comments-1')).toHaveLength(1);
  });

  test('la sélection se réaligne quand les tutos visite changent (rechargement)', () => {
    const { props, rerender } = setup({ isTeacher: true, availableTutorials: TUTOS, tutorials: [TUTOS[0]] });
    expect(screen.getAllByRole('checkbox').map((b) => b.checked)).toEqual([true, false]);
    rerender(
      <VisitTutorialsSection {...props} tutorials={[TUTOS[0], TUTOS[1]]} />,
    );
    expect(screen.getAllByRole('checkbox').map((b) => b.checked)).toEqual([true, true]);
  });
});
