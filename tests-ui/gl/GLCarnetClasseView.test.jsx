import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLCarnetClasseView } from '../../src/gl/components/tenir/GLCarnetClasseView.jsx';

const FORBIDDEN =
  /monstre|ennemi|attaque|poursui|corbeau|Krâ|Kraa|Grise|\bfaux\b|raté|perdu|classement/;

function chasseWith(extra = {}) {
  return {
    carnet: {
      total: 3,
      tenues: 1,
      trouvees: 2,
      carnetCompletAt: null,
      pages: [
        {
          zoneKey: 'z1',
          indice: 'Là où le vent se pose',
          etat: 'endormie',
          trouveePar: null,
          tenuePar: null,
          palissementPct: 0,
        },
        {
          zoneKey: 'z2',
          indice: 'Sous la pierre moussue',
          titre: 'La page du ruisseau',
          etat: 'trouvee',
          trouveePar: { id: 1, name: 'Gnomes A', type: 'gnome' },
          tenuePar: null,
          palissementPct: 20,
        },
        {
          zoneKey: 'z3',
          indice: 'Au creux du vieux tronc',
          titre: 'La page du tronc',
          etat: 'tenue',
          trouveePar: { id: 2, name: 'Licornes A', type: 'unicorn' },
          tenuePar: { id: 1, name: 'Gnomes A', type: 'gnome' },
          palissementPct: 0,
        },
      ],
    },
    busy: false,
    error: '',
    page: null,
    ouvrir: vi.fn(),
    tenir: vi.fn(),
    closePage: vi.fn(),
    ...extra,
  };
}

describe('GLCarnetClasseView', () => {
  test('liste les pages (indice, état, découvreuse, tenue par, pâlissement) ; « Lire » seulement sur une page trouvée', () => {
    const chasse = chasseWith();
    const { container } = render(<GLCarnetClasseView chasse={chasse} />);
    expect(screen.getByText(/1\/3 pages tenues/)).toBeInTheDocument();
    expect(screen.getByText('Là où le vent se pose')).toBeInTheDocument();
    expect(screen.getByText(/dort encore/)).toBeInTheDocument();
    expect(screen.getByText(/trouvée par Gnomes A/)).toBeInTheDocument();
    expect(screen.getByText(/pâlie à 20 %/)).toBeInTheDocument();
    expect(screen.getByText(/tenue par Gnomes A/)).toBeInTheDocument();
    const lire = screen.getAllByRole('button', { name: 'Lire' });
    expect(lire).toHaveLength(2);
    fireEvent.click(lire[0]);
    expect(chasse.ouvrir).toHaveBeenCalledWith('z2', null);
    expect(container.textContent).not.toMatch(FORBIDDEN);
    expect(container.querySelector('polygon')).toBeNull();
  });

  test('page ouverte avec question de lecture : « Tenir » envoie le choix ; le retour « Pas encore » est affiché tel quel', () => {
    const chasse = chasseWith({
      page: {
        zoneKey: 'z2',
        etat: 'trouvee',
        peutTenir: true,
        palissementPct: 0,
        feuillet: {
          titre: 'La page du ruisseau',
          incipit: 'Le ruisseau compte.',
          texte: 'Le ruisseau compte ses pierres.',
        },
        question: {
          questionCode: 'LECT-z2',
          question: 'Que compte le ruisseau ?',
          choices: [
            { id: 0, text: 'Ses pierres' },
            { id: 1, text: 'Ses poissons' },
          ],
        },
        feedback: 'Pas encore. Relis la première ligne.',
      },
    });
    const { container } = render(<GLCarnetClasseView chasse={chasse} teamId={4} />);
    expect(screen.getByTestId('gl-carnet-page-ouverte')).toBeInTheDocument();
    expect(screen.getByText('Pas encore. Relis la première ligne.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Ses pierres'));
    fireEvent.click(screen.getByRole('button', { name: 'Tenir' }));
    expect(chasse.tenir).toHaveBeenCalledWith(0, 4);
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });
});
