import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLSpellsView } from '../../src/gl/components/GLSpellsView.jsx';

vi.mock('../../src/gl/components/GLBrandHub.jsx', () => ({
  GLBrandPageBanner: () => null,
}));

vi.mock('../../src/gl/components/GLSpellCatalog.jsx', () => ({
  GLSpellCatalog: () => <div data-testid="spell-catalog" />,
}));

vi.mock('../../src/gl/components/ui/GLButton.jsx', () => ({
  GLButton: ({ children, ...props }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

describe('GLSpellsView', () => {
  test('applique le scope grimoire sur le panneau Sortilèges', () => {
    const { container } = render(
      <GLSpellsView
        gameState={{ game: { chapter_spells: [], sortileges_markdown: '' } }}
        canSpellCast={false}
      />,
    );
    const panel = container.querySelector('article');
    expect(panel).toHaveClass('gl-spells-panel');
    expect(panel).toHaveClass('gl-grimoire');
    expect(screen.getByRole('heading', { name: 'Sortilèges' })).toHaveClass(
      'gl-spells-panel__title',
    );
  });
});
