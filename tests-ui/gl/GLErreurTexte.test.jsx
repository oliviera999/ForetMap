import { describe, test, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GLErreurTexte } from '../../src/gl/components/ui/GLErreurTexte.jsx';
import { sansIdRequete, separerIdRequete } from '../../src/gl/utils/glErreurTexte.js';

describe('identifiant de requête d’une erreur (K8)', () => {
  afterEach(() => cleanup());

  test('separerIdRequete détache « [requête …] » de la phrase', () => {
    expect(separerIdRequete('Erreur serveur (HTTP 500) [requête 4f2a-91]')).toEqual({
      texte: 'Erreur serveur (HTTP 500)',
      requete: '4f2a-91',
    });
    expect(separerIdRequete('Jet refusé')).toEqual({ texte: 'Jet refusé', requete: null });
    expect(separerIdRequete(null)).toEqual({ texte: '', requete: null });
    expect(sansIdRequete('Erreur (HTTP 400) [requête abc]')).toBe('Erreur (HTTP 400)');
  });

  test('la console montre la phrase, puis l’identifiant en petit', () => {
    render(
      <p>
        <GLErreurTexte message="Erreur serveur (HTTP 500) [requête 4f2a-91]" />
      </p>,
    );
    expect(screen.getByText('Erreur serveur (HTTP 500)')).toBeInTheDocument();
    const petit = screen.getByTestId('gl-erreur-requete');
    expect(petit.tagName).toBe('SMALL');
    expect(petit).toHaveTextContent('requête 4f2a-91');
  });

  test('sans identifiant, rien de plus que la phrase', () => {
    render(
      <p>
        <GLErreurTexte message="Jet refusé" />
      </p>,
    );
    expect(screen.getByText('Jet refusé')).toBeInTheDocument();
    expect(screen.queryByTestId('gl-erreur-requete')).toBeNull();
  });
});
