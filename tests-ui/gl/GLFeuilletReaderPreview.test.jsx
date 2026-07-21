import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// L'illustration charge un runtime d'assets GL (import lourd / async) : on la neutralise.
vi.mock('../../src/gl/components/GLFeuilletIllustration.jsx', () => ({
  GLFeuilletIllustration: () => null,
}));

import { GLFeuilletReaderPreview } from '../../src/gl/components/admin/GLFeuilletReaderPreview.jsx';

describe('GLFeuilletReaderPreview', () => {
  test('rend le titre et le texte (texte_accessible prioritaire)', () => {
    render(
      <GLFeuilletReaderPreview
        form={{
          feuillet_code: 'FE0001',
          titre: 'Le vieux chêne',
          incipit: 'Une histoire ancienne.',
          texte_accessible: 'Version accessible du récit.',
          texte: 'Version narrative intégrale.',
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Le vieux chêne' })).toBeInTheDocument();
    expect(screen.getByText('Version accessible du récit.')).toBeInTheDocument();
    // Le texte narratif intégral ne doit pas primer sur le texte accessible.
    expect(screen.queryByText('Version narrative intégrale.')).not.toBeInTheDocument();
  });

  test('affiche le message d’aperçu vide quand form est vide', () => {
    render(<GLFeuilletReaderPreview form={{}} />);
    expect(screen.getByText('Aperçu vide — renseignez le contenu.')).toBeInTheDocument();
  });
});
