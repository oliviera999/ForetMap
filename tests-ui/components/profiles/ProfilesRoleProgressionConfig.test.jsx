import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilesRoleProgressionConfig } from '../../../src/components/profiles/ProfilesRoleProgressionConfig.jsx';

function setup(overrides = {}) {
  const props = {
    role: { id: 3, display_name: 'Novice', forum_participate: 1, context_comment_participate: 0 },
    loading: false,
    roleTerms: { studentSingular: 'n3beur', studentPlural: 'n3beurs', teacherShort: 'n3boss' },
    isTier: true,
    canEditRoleDefinition: true,
    progressionEnabled: true,
    onToggleProgression: vi.fn(),
    minDoneTasks: '5',
    onMinDoneTasksChange: vi.fn(),
    onSaveMinDoneThreshold: vi.fn(),
    proposeEntry: { key: 'tasks.propose', requires_elevation: false },
    onTogglePermission: vi.fn(),
    onTogglePermissionElevation: vi.fn(),
    onSetForumParticipate: vi.fn(),
    onSetContextCommentParticipate: vi.fn(),
    maxConcurrentTasks: '',
    onMaxConcurrentChange: vi.fn(),
    onSaveMaxConcurrent: vi.fn(),
    ...overrides,
  };
  render(<ProfilesRoleProgressionConfig {...props} />);
  return props;
}

describe('ProfilesRoleProgressionConfig', () => {
  test('role null → rien', () => {
    const { container } = render(<ProfilesRoleProgressionConfig role={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('progression : toggle câblé ; seuil affiché et enregistrable (palier)', () => {
    const { onToggleProgression, onSaveMinDoneThreshold } = setup();
    fireEvent.click(screen.getByLabelText(/montée de niveau automatique/i, { selector: 'input' }) ||
      screen.getAllByRole('checkbox')[0]);
    expect(onToggleProgression).toHaveBeenCalled();
    expect(screen.getByLabelText('Tâches validées requises pour Novice')).toHaveValue(5);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le seuil' }));
    expect(onSaveMinDoneThreshold).toHaveBeenCalledTimes(1);
  });

  test('proposition : toggle tasks.propose + élévation', () => {
    const { onTogglePermission, onTogglePermissionElevation } = setup();
    const proposeCb = screen.getAllByRole('checkbox').find((c) =>
      c.closest('label')?.textContent?.includes('proposer de nouvelles tâches')
    );
    fireEvent.click(proposeCb);
    expect(onTogglePermission).toHaveBeenCalledWith('tasks.propose', false);
    const elevCb = screen.getAllByRole('checkbox').find((c) =>
      c.closest('label')?.textContent?.includes('Exiger le PIN')
    );
    fireEvent.click(elevCb);
    expect(onTogglePermissionElevation).toHaveBeenCalledWith('tasks.propose', true);
  });

  test('forum / contexte : reflètent l’état du rôle et appellent les setters(id, checked)', () => {
    const { onSetForumParticipate, onSetContextCommentParticipate } = setup();
    const forumCb = screen.getAllByRole('checkbox').find((c) =>
      c.closest('label')?.textContent?.includes('participation au forum')
    );
    const ctxCb = screen.getAllByRole('checkbox').find((c) =>
      c.closest('label')?.textContent?.includes('commentaires contextuels')
    );
    expect(forumCb).toBeChecked(); // forum_participate = 1
    expect(ctxCb).not.toBeChecked(); // context_comment_participate = 0
    fireEvent.click(forumCb);
    expect(onSetForumParticipate).toHaveBeenCalledWith(3, false);
    fireEvent.click(ctxCb);
    expect(onSetContextCommentParticipate).toHaveBeenCalledWith(3, true);
  });

  test('plafond d’inscriptions : saisie + enregistrement', () => {
    const { onMaxConcurrentChange, onSaveMaxConcurrent } = setup();
    const input = screen.getByLabelText("Plafond d'inscriptions simultanées pour Novice");
    fireEvent.change(input, { target: { value: '3' } });
    expect(onMaxConcurrentChange).toHaveBeenCalledWith('3');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le plafond' }));
    expect(onSaveMaxConcurrent).toHaveBeenCalledTimes(1);
  });

  test('non-palier (isTier=false) : masque seuil/proposition/forum/plafond', () => {
    setup({ isTier: false });
    expect(screen.getByText('Progression par tâches validées')).toBeInTheDocument();
    expect(screen.queryByText('Proposition de tâches')).not.toBeInTheDocument();
    expect(screen.queryByText(/Forum et commentaires/)).not.toBeInTheDocument();
    expect(screen.queryByText('Inscriptions simultanées aux tâches')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer le seuil' })).not.toBeInTheDocument();
  });

  test('forum désactivé si canEditRoleDefinition=false', () => {
    setup({ canEditRoleDefinition: false });
    const forumCb = screen.getAllByRole('checkbox').find((c) =>
      c.closest('label')?.textContent?.includes('participation au forum')
    );
    expect(forumCb).toBeDisabled();
  });
});
