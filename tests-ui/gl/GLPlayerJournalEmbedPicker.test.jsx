/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GLPlayerJournalEmbedPicker } from '../../src/gl/components/GLPlayerJournalEmbedPicker.jsx';

describe('GLPlayerJournalEmbedPicker', () => {
  it('affiche le picker et ferme via Annuler', () => {
    const onClose = vi.fn();
    render(
      <GLPlayerJournalEmbedPicker
        open
        onClose={onClose}
        onInsert={vi.fn()}
        chapterSpells={['SL001']}
      />,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Insérer un élément du site/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ne rend rien quand open=false', () => {
    render(<GLPlayerJournalEmbedPicker open={false} onClose={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
