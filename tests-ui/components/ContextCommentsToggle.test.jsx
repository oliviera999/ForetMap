import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ContextCommentsToggle } from '../../src/components/context-comments/ContextCommentsToggle.jsx';

function renderToggle(overrides = {}) {
  const props = {
    title: 'Commentaires',
    total: 3,
    isOpen: false,
    unreadCount: 0,
    onToggle: vi.fn(),
    ...overrides,
  };
  render(<ContextCommentsToggle {...props} />);
  return props;
}

const badge = () => document.querySelector('.context-comments-count');

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

  test('tout lu : pastille verte avec le total', () => {
    renderToggle();
    const btn = screen.getByRole('button');
    expect(btn.className).not.toContain('context-comments-toggle--unread');
    expect(badge().className).toContain('context-comments-count--read');
    expect(badge().textContent).toBe('3');
    expect(btn.getAttribute('aria-label')).toBe('Commentaires, 3 commentaires');
  });

  test('non-lus : pastille rouge avec le nombre de non-lus', () => {
    renderToggle({ unreadCount: 2, total: 5 });
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('context-comments-toggle--unread');
    expect(badge().className).toContain('context-comments-count--unread');
    expect(badge().textContent).toBe('2');
    expect(btn.getAttribute('aria-label')).toBe('Commentaires, 5 commentaires dont 2 non lus');
  });

  test('aria-label au singulier', () => {
    renderToggle({ unreadCount: 1, total: 1 });
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      'Commentaires, 1 commentaire dont 1 non lu',
    );
  });

  test('aucun commentaire : pas de pastille', () => {
    renderToggle({ total: 0 });
    expect(badge()).toBeNull();
    expect(screen.getByRole('button').getAttribute('aria-label')).toBeNull();
  });

  test('non-lus plafonnés au total', () => {
    renderToggle({ unreadCount: 9, total: 4 });
    expect(badge().textContent).toBe('4');
  });
});
