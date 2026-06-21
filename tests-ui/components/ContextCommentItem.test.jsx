import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../src/components/MarkdownContent.jsx', () => ({
  MarkdownContent: ({ children, className }) => <div className={className}>{children}</div>,
}));

vi.mock('../../src/components/attachment-images-picker', () => ({
  UserContentImagesGrid: ({ urls }) => <div data-testid="images-grid">{(urls || []).length}</div>,
}));

import { ContextCommentItem } from '../../src/components/context-comments/ContextCommentItem.jsx';

const REACTIONS = ['👍', '❤️'];

function makeItem(overrides = {}) {
  return {
    id: 1,
    author_display_name: 'Alice',
    author_user_type: 'eleve',
    author_user_id: 'u1',
    created_at: '2026-06-13T10:00:00Z',
    body: 'Bonjour',
    image_urls: [],
    is_deleted: false,
    reactions: [],
    ...overrides,
  };
}

function renderItem(itemOverrides = {}, propOverrides = {}) {
  const props = {
    item: makeItem(itemOverrides),
    currentUserType: 'eleve',
    currentUserId: 'u1',
    allowModeration: false,
    canUseCommentActions: true,
    reactionEmojis: REACTIONS,
    firstReactionEmoji: '👍',
    reactionsExpanded: false,
    onExpandReactions: vi.fn(),
    onCollapseReactions: vi.fn(),
    onReact: vi.fn(),
    onRemove: vi.fn(),
    reportReason: '',
    onReportReasonChange: vi.fn(),
    onReport: vi.fn(),
    ...propOverrides,
  };
  render(<ContextCommentItem {...props} />);
  return props;
}

describe('ContextCommentItem', () => {
  test('affiche auteur et corps', () => {
    renderItem();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bonjour')).toBeTruthy();
  });

  test('commentaire supprimé : placeholder, pas d’actions', () => {
    renderItem({ is_deleted: true });
    expect(screen.getByText('[commentaire supprimé]')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull();
  });

  test('le propriétaire peut supprimer', () => {
    const { onRemove } = renderItem();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  test('non-propriétaire sans modération : pas de bouton supprimer', () => {
    renderItem({}, { currentUserId: 'autre' });
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull();
  });

  test('un modérateur peut supprimer le commentaire d’autrui', () => {
    const { onRemove } = renderItem({}, { currentUserId: 'autre', allowModeration: true });
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  test('réactions compactes : clic ouvre la liste', () => {
    const { onExpandReactions } = renderItem();
    fireEvent.click(screen.getByTitle('Afficher toutes les réactions'));
    expect(onExpandReactions).toHaveBeenCalled();
  });

  test('réactions ouvertes : clic sur un emoji remonte onReact', () => {
    const { onReact } = renderItem({}, { reactionsExpanded: true });
    fireEvent.click(screen.getByTitle('Réagir avec ❤️'));
    expect(onReact).toHaveBeenCalledWith(1, '❤️');
  });

  test('signalement : saisie et envoi remontés', () => {
    const { onReportReasonChange, onReport } = renderItem();
    fireEvent.change(screen.getByPlaceholderText('Motif de signalement'), {
      target: { value: 'spam' },
    });
    expect(onReportReasonChange).toHaveBeenCalledWith(1, 'spam');
    fireEvent.click(screen.getByRole('button', { name: 'Signaler' }));
    expect(onReport).toHaveBeenCalledWith(1);
  });

  test('lecture seule : réactions non nulles affichées sans actions', () => {
    renderItem({ reactions: [{ emoji: '👍', count: 3 }] }, { canUseCommentActions: false });
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Motif de signalement')).toBeNull();
  });

  test('signalements désactivés : pas de champ ni bouton Signaler', () => {
    renderItem({}, { reportsEnabled: false, canUseCommentActions: true });
    expect(screen.queryByPlaceholderText('Motif de signalement')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Signaler' })).toBeNull();
  });
});
