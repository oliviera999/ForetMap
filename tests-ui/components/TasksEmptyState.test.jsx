import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TasksEmptyState } from '../../src/components/TasksEmptyState.jsx';

describe('TasksEmptyState', () => {
  test('count === 0 → rend le placeholder vide', () => {
    const { container } = render(<TasksEmptyState count={0} />);
    expect(container.querySelector('.empty')).toBeInTheDocument();
    expect(container.querySelector('.empty-icon')).toHaveTextContent('🌿');
    expect(screen.getByText(/Rien à faire ici pour l’instant/)).toBeInTheDocument();
  });

  test('count > 0 → rien n’est rendu', () => {
    const { container } = render(<TasksEmptyState count={3} />);
    expect(container).toBeEmptyDOMElement();
  });
});
