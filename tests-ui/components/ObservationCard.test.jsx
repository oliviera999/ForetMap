import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../src/components/MarkdownContent.jsx', () => ({
  MarkdownContent: ({ children, className }) => <div className={className}>{children}</div>,
}));

import { ObservationCard } from '../../src/components/ObservationCard.jsx';

function makeEntry(overrides = {}) {
  return {
    id: 7,
    created_at: '2026-06-13T10:00:00Z',
    content: 'Feuilles jaunies',
    zone_name: '',
    image_url: '',
    ...overrides,
  };
}

describe('ObservationCard', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('affiche le contenu de l’observation', () => {
    render(<ObservationCard entry={makeEntry()} onDelete={vi.fn()} />);
    expect(screen.getByText('Feuilles jaunies')).toBeTruthy();
  });

  test('affiche la zone et la photo quand présentes', () => {
    render(
      <ObservationCard
        entry={makeEntry({ zone_name: 'Verger', image_url: 'http://x/p.jpg' })}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('📍 Verger')).toBeTruthy();
    expect(screen.getByAltText('observation')).toBeTruthy();
  });

  test('suppression confirmée remonte l’id au parent', () => {
    const onDelete = vi.fn();
    render(<ObservationCard entry={makeEntry()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: '🗑️' }));
    expect(onDelete).toHaveBeenCalledWith(7);
  });

  test('suppression annulée ne remonte rien', () => {
    globalThis.confirm = vi.fn(() => false);
    const onDelete = vi.fn();
    render(<ObservationCard entry={makeEntry()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: '🗑️' }));
    expect(onDelete).not.toHaveBeenCalled();
  });
});
