import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ContextCommentsToggle } from '../../src/components/context-comments/ContextCommentsToggle.jsx';

function renderToggle(overrides = {}) {
  const props = {
    title: 'Commentaires',
    total: 3,
    isOpen: false,
    hasUnreadComments: false,
    onToggle: vi.fn(),
    ...overrides,
  };
  render(<ContextCommentsToggle {...props} />);
  return props;
}

describe('ContextCommentsToggle', () => {
  test('affiche le titre, le total et le chevron replié', () => {
    renderToggle();
    expect(screen.getByText('▸ Commentaires')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  test('chevron déplié quand isOpen', () => {
    renderToggle({ isOpen: true });
    expect(screen.getByText('▾ Commentaires')).toBeTruthy();
  });

  test('remonte le clic via onToggle', () => {
    const { onToggle } = renderToggle();
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalled();
  });

  test('sans non-lus : pas de classe ni aria-label dédiés', () => {
    renderToggle();
    const btn = screen.getByRole('button');
    expect(btn.className).not.toContain('context-comments-toggle--unread');
    expect(btn.getAttribute('aria-label')).toBeNull();
  });

  test('avec non-lus : classe, point et aria-label dédiés (pluriel)', () => {
    renderToggle({ hasUnreadComments: true, total: 3 });
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('context-comments-toggle--unread');
    expect(btn.getAttribute('aria-label')).toBe(
      'Commentaires, 3 commentaires, nouveaux messages non lus',
    );
    expect(document.querySelector('.context-comments-unread-dot')).toBeTruthy();
  });

  test('aria-label au singulier quand un seul commentaire', () => {
    renderToggle({ hasUnreadComments: true, total: 1 });
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      'Commentaires, 1 commentaire, nouveaux messages non lus',
    );
  });
});
