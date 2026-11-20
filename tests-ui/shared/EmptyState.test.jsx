import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../../src/shared/components/EmptyState.jsx';

describe('EmptyState (partagé ForêtMap + G&L)', () => {
  test('rend icône décorative, titre, message et action', () => {
    const { container } = render(
      <EmptyState
        icon="🌱"
        title="Aucun lieu"
        action={<button type="button">Tout afficher</button>}
      >
        Change de filtre pour voir d’autres lieux.
      </EmptyState>,
    );
    const root = container.firstElementChild;
    expect(root).toHaveClass('empty-state');
    expect(container.querySelector('.empty-state-icon')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Aucun lieu')).toHaveClass('empty-state-title');
    expect(screen.getByText(/Change de filtre/)).toHaveClass('empty-state-text');
    expect(screen.getByRole('button', { name: 'Tout afficher' })).toBeInTheDocument();
    expect(root).not.toHaveAttribute('role');
  });

  test('variantes compact / framed, role et data-testid transmis', () => {
    const { container } = render(
      <EmptyState compact framed role="status" testId="vide" className="extra">
        Rien
      </EmptyState>,
    );
    const root = container.firstElementChild;
    expect(root).toHaveClass('empty-state', 'empty-state--compact', 'empty-state--framed', 'extra');
    expect(root).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('vide')).toBe(root);
  });

  test('sans icône ni titre : aucun nœud vide superflu', () => {
    const { container } = render(<EmptyState>Seulement un message</EmptyState>);
    expect(container.querySelector('.empty-state-icon')).toBeNull();
    expect(container.querySelector('.empty-state-title')).toBeNull();
    expect(container.querySelector('.empty-state-action')).toBeNull();
  });
});
