import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ObservationNotebookStatus } from '../../src/components/ObservationNotebookStatus.jsx';

describe('ObservationNotebookStatus', () => {
  test('loading → rend le loader', () => {
    const { container } = render(<ObservationNotebookStatus loading entryCount={0} onRetry={vi.fn()} />);
    expect(container.querySelector('.loader')).toBeInTheDocument();
    expect(screen.getByText('Chargement...')).toBeInTheDocument();
  });

  test('loadError → rend l’erreur et le bouton Réessayer', () => {
    const onRetry = vi.fn();
    render(
      <ObservationNotebookStatus loading={false} loadError="Boom" entryCount={0} onRetry={onRetry} />,
    );
    expect(screen.getByText('Boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('carnet vide → rend le placeholder vide', () => {
    const { container } = render(<ObservationNotebookStatus loading={false} entryCount={0} onRetry={vi.fn()} />);
    expect(container.querySelector('.empty-icon')).toHaveTextContent('📓');
    expect(screen.getByText(/Ton carnet est vide/)).toBeInTheDocument();
  });

  test('au moins une observation → ne rend rien', () => {
    const { container } = render(<ObservationNotebookStatus loading={false} entryCount={2} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('loading prioritaire sur loadError', () => {
    const { container } = render(
      <ObservationNotebookStatus loading loadError="Boom" entryCount={0} onRetry={vi.fn()} />,
    );
    expect(container.querySelector('.loader')).toBeInTheDocument();
    expect(screen.queryByText('Boom')).toBeNull();
  });
});
