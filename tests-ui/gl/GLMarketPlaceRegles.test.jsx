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
    render(<GLMarketPlaceRegles paruresEnabled />);
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
    // M19 : payée en gemmes, une parure achetée est à l'élève toute l'année.
    expect(texte).toMatch(/s’achètent avec tes gemmes/);
    expect(texte).toMatch(/à toi toute l’année/);
    expect(texte).not.toMatch(/c[œo]eur/i);
    expect(texte).not.toMatch(/faux|raté|perdu|classement/i);
  });

  test('sans Comptoir : la quatrième ligne rappelle que les bourses se gardent', () => {
    render(<GLMarketPlaceRegles paruresEnabled={false} />);
    const note = screen.getByRole('note', { name: 'Règles du marché' });
    expect(note.querySelectorAll('li')).toHaveLength(4);
    expect(note.textContent).not.toMatch(/Comptoir/);
    expect(note.textContent).toMatch(/d’un chapitre à l’autre/);
  });

  test('une seule monnaie (M1) : sans Comptoir, la bourse se dit en gemmes, sans aucun cœur', () => {
    render(<GLMarketPlaceRegles gemmesSeules paruresEnabled={false} />);
    const note = screen.getByRole('note', { name: 'Règles du marché' });
    expect(note.textContent).toMatch(/Tes gemmes restent à toi d’un chapitre à l’autre/);
    expect(note.textContent).not.toMatch(/c[œo]eur/i);
  });
});
