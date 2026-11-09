import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLMarketPlaceRegles } from '../../src/gl/components/GLMarketPlacePanels.jsx';

/**
 * Encart « Comment fonctionne le marché ? » en tête de La place (Marché « Tenir à deux ») :
 * quatre lignes pour un élève de 6ᵉ, nom accessible identique à l'encart des Échanges, aucune
 * chaîne interdite côté élève.
 */
describe('GLMarketPlaceRegles', () => {
  test('encart repliable, ouvert par défaut, quatre lignes, nom accessible « Règles du marché »', () => {
    render(<GLMarketPlaceRegles heartsTradable={false} paruresEnabled />);
    const note = screen.getByRole('note', { name: 'Règles du marché' });
    expect(note).toBeInTheDocument();
    expect(screen.getByText('Comment fonctionne le marché ?')).toBeInTheDocument();
    const details = note.querySelector('details');
    expect(details).not.toBeNull();
    expect(details.open).toBe(true);
    const items = note.querySelectorAll('li');
    expect(items).toHaveLength(4);
    const texte = note.textContent;
    expect(texte).toMatch(/je cherche/);
    expect(texte).toMatch(/échange à deux/);
    expect(texte).toMatch(/don/);
    expect(texte).toMatch(/parures/);
    expect(texte).toMatch(/tes gemmes et décorent/);
    expect(texte).not.toMatch(/faux|raté|perdu|classement/i);
  });

  test('sans Comptoir : la quatrième ligne rappelle que les bourses se gardent', () => {
    render(<GLMarketPlaceRegles heartsTradable paruresEnabled={false} />);
    const note = screen.getByRole('note', { name: 'Règles du marché' });
    expect(note.querySelectorAll('li')).toHaveLength(4);
    expect(note.textContent).not.toMatch(/Comptoir/);
    expect(note.textContent).toMatch(/d’un chapitre à l’autre/);
  });
});
