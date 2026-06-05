import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLZoneContentPopover } from '../../src/gl/components/GLZoneContentPopover.jsx';

describe('GLZoneContentPopover', () => {
  it('affiche le titre, le markdown et la galerie', () => {
    const onClose = vi.fn();
    render(
      <GLZoneContentPopover
        open
        zone={{ id: 1, label: 'Clairière' }}
        popoverMarkdown="**Bienvenue** dans la clairière."
        popoverImages={[{ url: '/uploads/media-library/image/test.png', caption: 'Vue' }]}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('dialog', { name: /Zone : Clairière/i })).toBeTruthy();
    expect(screen.getByText(/Bienvenue/)).toBeTruthy();
    expect(screen.getByText('Vue')).toBeTruthy();
    const closeButtons = screen.getAllByRole('button', { name: 'Fermer' });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });
});
