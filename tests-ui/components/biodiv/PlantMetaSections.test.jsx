import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// map-views est un gros module : on ne mocke que Lightbox (sonde de test dédiée).
vi.mock('../../../src/components/map-views', () => ({
  Lightbox: ({ src, caption }) => (
    <div data-testid="lightbox">
      {caption} — {src}
    </div>
  ),
}));
vi.mock('../../../src/components/MarkdownContent.jsx', () => ({
  MarkdownContent: ({ children, className }) => <div className={className}>{children}</div>,
}));

import {
  PlantMetaSections,
  PlantBiodivHeroPhoto,
} from '../../../src/components/biodiv/PlantMetaSections.jsx';

beforeEach(() => {
  // Aucun appel réseau réel (aperçus de catégorie Commons) : fetch neutralisé.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PlantMetaSections', () => {
  test('fiche vide → aucune section', () => {
    const { container } = render(<PlantMetaSections plant={{}} />);
    expect(container.querySelectorAll('details').length).toBe(0);
  });

  test('valeurs d’identité → section repliable avec labels et valeurs', () => {
    render(<PlantMetaSections plant={{ scientific_name: 'Malus domestica', habitat: 'Verger' }} />);
    expect(screen.getByText('Identité')).toBeInTheDocument();
    expect(screen.getByText('Nom scientifique (usage)')).toBeInTheDocument();
    expect(screen.getByText('Malus domestica')).toBeInTheDocument();
    expect(screen.getByText('Écologie et usages')).toBeInTheDocument();
    expect(screen.getByText('Verger')).toBeInTheDocument();
    // valeurs `-` normalisées → pas de section Ressources
    expect(screen.queryByText('Ressources')).not.toBeInTheDocument();
  });

  test('source http → lien étiqueté (getSourceLabel) ; valeur non-lien → texte brut', () => {
    render(
      <PlantMetaSections
        plant={{ sources: 'https://fr.wikipedia.org/wiki/Pommier\nLivre de la forêt' }}
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://fr.wikipedia.org/wiki/Pommier');
    expect(screen.getByText('Livre de la forêt')).toBeInTheDocument();
  });

  test('photo en lien image direct → vignette cliquable qui ouvre la lightbox', async () => {
    render(<PlantMetaSections plant={{ photo_leaf: 'https://exemple.org/feuille.jpg' }} />);
    const thumb = screen.getByRole('button');
    fireEvent.click(thumb);
    await waitFor(() => expect(screen.getByTestId('lightbox')).toBeInTheDocument());
    expect(screen.getByTestId('lightbox').textContent).toContain('Photo feuille');
  });
});

describe('PlantMetaSections — attribution par photo (migration 302)', () => {
  test('chaque vignette de la galerie porte son auteur et sa licence', async () => {
    render(
      <PlantMetaSections
        plant={{
          photo_leaf: 'https://exemple.org/feuille.jpg\nhttps://exemple.org/feuille2.jpg',
          photos: [
            {
              kind: 'photo_leaf',
              url: 'https://exemple.org/feuille.jpg',
              credit: 'Anne Martin',
              licence: 'CC BY-SA 4.0',
              source_url: 'https://exemple.org/page-feuille',
            },
            { kind: 'photo_leaf', url: 'https://exemple.org/feuille2.jpg' },
          ],
        }}
      />,
    );
    expect(screen.getByText('Anne Martin — CC BY-SA 4.0')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Source' })).toHaveAttribute(
      'href',
      'https://exemple.org/page-feuille',
    );
    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(screen.getByTestId('lightbox')).toBeInTheDocument());
    expect(screen.getByTestId('lightbox').textContent).toContain(
      'Photo feuille — Anne Martin — CC BY-SA 4.0',
    );
  });
});

describe('PlantBiodivHeroPhoto', () => {
  test('photo héro prise dans « espèce » → attribution de CETTE photo', () => {
    render(
      <PlantBiodivHeroPhoto
        plant={{
          name: 'Pommier',
          photo_species: 'https://exemple.org/espece.jpg',
          photo_credit: 'Crédit de la photo principale',
          photos: [
            {
              kind: 'photo_species',
              url: 'https://exemple.org/espece.jpg',
              credit: 'Bob',
              licence: 'CC0',
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('CC0')).toBeInTheDocument();
    expect(screen.queryByText('Crédit de la photo principale')).not.toBeInTheDocument();
  });

  test('aucune photo exploitable → ne rend rien', () => {
    const { container } = render(<PlantBiodivHeroPhoto plant={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('photo directe → bouton héro ; clic → lightbox avec le nom', async () => {
    render(
      <PlantBiodivHeroPhoto
        plant={{ name: 'Pommier', photo: 'https://exemple.org/pommier.jpg' }}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Agrandir la photo de Pommier' });
    expect(btn.querySelector('img')).toHaveAttribute('src', 'https://exemple.org/pommier.jpg');
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByTestId('lightbox')).toBeInTheDocument());
    expect(screen.getByTestId('lightbox').textContent).toContain('Photo — Pommier');
  });
});
