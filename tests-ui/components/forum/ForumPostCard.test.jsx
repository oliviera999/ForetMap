import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ForumPostCard } from '../../../src/components/forum/ForumPostCard.jsx';

function post(overrides = {}) {
  return {
    id: 'p1',
    author_display_name: 'Momo',
    author_user_type: 'student',
    author_user_id: 'u1',
    created_at: '2026-06-12T10:00:00Z',
    body: 'Bonjour la forêt',
    is_deleted: 0,
    image_urls: [],
    reactions: [],
    ...overrides,
  };
}

function renderCard(props = {}) {
  const handlers = {
    onSetReactionsExpanded: vi.fn(),
    onReact: vi.fn(),
    onDelete: vi.fn(),
    onReportReasonChange: vi.fn(),
    onReport: vi.fn(),
  };
  render(
    <ForumPostCard
      post={post()}
      canModerate={false}
      canUseForumActions
      isOwner={false}
      reactionEmojis={['👍', '❤️']}
      firstReactionEmoji="👍"
      reactionsExpanded={false}
      reportReason=""
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

describe('ForumPostCard', () => {
  test('affiche auteur et corps du message', () => {
    renderCard();
    expect(screen.getByText('Momo')).toBeInTheDocument();
    expect(screen.getByText('Bonjour la forêt')).toBeInTheDocument();
  });

  test('message supprimé : marqueur seul, ni réactions ni actions', () => {
    renderCard({ post: post({ is_deleted: 1 }) });
    expect(screen.getByText('[message supprimé]')).toBeInTheDocument();
    expect(screen.queryByTitle('Afficher toutes les réactions')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Signaler' })).not.toBeInTheDocument();
  });

  test('réactions repliées : le chip bascule l’expansion', () => {
    const h = renderCard();
    fireEvent.click(screen.getByTitle('Afficher toutes les réactions'));
    expect(h.onSetReactionsExpanded).toHaveBeenCalledWith('p1', true);
  });

  test('réactions dépliées : un emoji déclenche onReact, ▾ replie', () => {
    const h = renderCard({
      reactionsExpanded: true,
      post: post({ reactions: [{ emoji: '👍', count: 2, reacted_by_me: 1 }] }),
    });
    fireEvent.click(screen.getByTitle('Réagir avec ❤️'));
    expect(h.onReact).toHaveBeenCalledWith('p1', '❤️');
    expect(screen.getByTitle('Réagir avec 👍')).toHaveClass('active');
    expect(screen.getByText('2')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Réduire les réactions'));
    expect(h.onSetReactionsExpanded).toHaveBeenCalledWith('p1', false);
  });

  test('lecture seule : seules les réactions comptabilisées s’affichent, sans actions', () => {
    renderCard({
      canUseForumActions: false,
      post: post({ reactions: [{ emoji: '👍', count: 3 }, { emoji: '❤️', count: 0 }] }),
    });
    expect(screen.getByText('👍')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('❤️')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Signaler' })).not.toBeInTheDocument();
  });

  test('Supprimer visible pour le propriétaire ou un modérateur seulement', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  test('signalement : saisie du motif et envoi', () => {
    const h = renderCard({ isOwner: true, reportReason: 'spam' });
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(h.onDelete).toHaveBeenCalledWith('p1');
    const input = screen.getByPlaceholderText('Motif de signalement');
    expect(input).toHaveValue('spam');
    fireEvent.change(input, { target: { value: 'spam!' } });
    expect(h.onReportReasonChange).toHaveBeenCalledWith('p1', 'spam!');
    fireEvent.click(screen.getByRole('button', { name: 'Signaler' }));
    expect(h.onReport).toHaveBeenCalledWith('p1');
  });
});
