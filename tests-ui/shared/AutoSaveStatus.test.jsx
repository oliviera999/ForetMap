import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutoSaveStatus } from '../../src/shared/components/AutoSaveStatus.jsx';

describe('AutoSaveStatus', () => {
  test('affiche Enregistrement… en pending/saving', () => {
    render(<AutoSaveStatus status="pending" />);
    expect(screen.getByText('Enregistrement…')).toBeInTheDocument();
  });

  test('affiche Enregistré ✓ après sauvegarde', () => {
    render(<AutoSaveStatus status="saved" />);
    expect(screen.getByText('Enregistré ✓')).toBeInTheDocument();
  });

  test('affiche une erreur', () => {
    render(<AutoSaveStatus status="error" error="Échec réseau" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Échec réseau');
  });
});
