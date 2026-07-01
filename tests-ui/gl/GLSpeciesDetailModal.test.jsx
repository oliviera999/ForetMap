import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const feuilletRevealFixture = {
  feuilletCode: 'ep-VI-06',
  titre: 'Ours polaire',
  displayText: 'Texte du feuillet révélé.',
  modeApparition: 'boite',
};

vi.mock('../../src/gl/components/GLLearningAcknowledgeButton.jsx', () => ({
  GLLearningAcknowledgeButton({
    onAcknowledged,
    labelAction = 'Marquer comme appris',
    labelDone = '✓ Appris',
    titleDone = 'Tu as confirmé avoir étudié cette espèce',
    isDone = false,
  }) {
    if (isDone) {
      return <span title={titleDone}>{labelDone}</span>;
    }
    return (
      <button
        type="button"
        onClick={() => onAcknowledged?.({ feuilletRevealed: feuilletRevealFixture })}
      >
        {labelAction}
      </button>
    );
  },
}));

import { GLSpeciesDetailModal } from '../../src/gl/components/GLSpeciesDetailModal.jsx';
const fullSpecies = {
  species_code: 'SP0001',
  biome_slug: 'sahara',
  type: 'faune',
  nom_commun: 'Fennec',
  nom_scientifique: 'Vulpes zerda',
  groupe: 'Mammifères',
  famille: 'Canidés',
  statut_iucn: 'LC',
  endemique: 'oui',
  role_ecologique: 'Prédateur nocturne',
  adaptations_cles: 'Oreilles grandes',
  taille_adulte: '20 cm',
  poids_adulte: '1 kg',
  regime_alimentaire: 'Omnivore',
  longevite: '10 ans',
  reproduction: 'Saison sèche',
  observation_terrain: 'Actif la nuit',
  description_courte: 'Petit renard du désert',
  anecdote: 'Très discret',
  present_dans_qcm: 'oui',
  mots_cles: 'désert, renard',
  wikipedia_title: 'Fennec',
  wikipedia_url: 'https://fr.wikipedia.org/wiki/Fennec',
  photo_url: 'https://example.com/fennec.jpg',
  photo_credit: 'Photo test',
  photo_licence: 'CC BY',
  glossaryTerms: [{ glossary_code: 'GL0001', terme: 'Biome' }],
};

describe('GLSpeciesDetailModal', () => {
  test('ne rend rien sans espèce', () => {
    const { container } = render(<GLSpeciesDetailModal species={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  test('affiche les sections et champs renseignés', () => {
    render(
      <GLSpeciesDetailModal
        species={fullSpecies}
        biomeNom="Désert chaud (Sahara)"
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Fennec' })).toBeInTheDocument();
    expect(within(dialog).getByText('Prédateur nocturne')).toBeInTheDocument();
    expect(within(dialog).getByText('Oreilles grandes')).toBeInTheDocument();
    expect(within(dialog).getByText('Petit renard du désert')).toBeInTheDocument();
    expect(within(dialog).getByText('SP0001')).toBeInTheDocument();
    expect(within(dialog).getByText(/Désert chaud \(Sahara\)/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Fennec' })).toBeInTheDocument();
    expect(within(dialog).getByText('désert, renard')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Biome' })).toBeInTheDocument();
  });

  test('ferme via Échap et bouton Fermer', async () => {
    const onClose = vi.fn();
    render(<GLSpeciesDetailModal species={fullSpecies} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('déclenche onOpenGlossaryTerm depuis les chips', async () => {
    const onOpenGlossaryTerm = vi.fn();
    render(
      <GLSpeciesDetailModal
        species={fullSpecies}
        onClose={vi.fn()}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Biome' }));
    expect(onOpenGlossaryTerm).toHaveBeenCalledWith('GL0001');
  });

  test('affiche le badge étudiée si learningProgress indique appris', () => {
    const learningProgress = {
      isSpeciesLearned: (code) => code === 'SP0001',
      markLocal: vi.fn(),
    };
    render(
      <GLSpeciesDetailModal
        species={fullSpecies}
        onClose={vi.fn()}
        learningProgress={learningProgress}
      />,
    );
    expect(screen.getByTitle(/étudié/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Marquer comme appris/i })).not.toBeInTheDocument();
  });

  test('affiche le bouton marquer comme étudiée si non appris', () => {
    const learningProgress = {
      isSpeciesLearned: () => false,
      markLocal: vi.fn(),
    };
    render(
      <GLSpeciesDetailModal
        species={fullSpecies}
        onClose={vi.fn()}
        learningProgress={learningProgress}
      />,
    );
    expect(screen.getByRole('button', { name: /Marquer comme appris/i })).toBeInTheDocument();
  });

  test('affiche le popover feuillet après révélation à l étude', async () => {
    const learningProgress = {
      isSpeciesLearned: () => false,
      markLocal: vi.fn(),
    };
    render(
      <GLSpeciesDetailModal
        species={fullSpecies}
        gameId={42}
        loreCarnetEnabled
        onClose={vi.fn()}
        learningProgress={learningProgress}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Marquer comme appris/i }));
    expect(screen.getByRole('dialog', { name: /Feuillet : Ours polaire/i })).toBeInTheDocument();
    expect(screen.getByText('Texte du feuillet révélé.')).toBeInTheDocument();
  });

  test('masque les sections sans champ renseigné', () => {
    render(
      <GLSpeciesDetailModal
        species={{
          nom_commun: 'Espèce vide',
          type: 'flore',
          species_code: 'SP9999',
        }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText('Écologie')).not.toBeInTheDocument();
    expect(screen.getByText('SP9999')).toBeInTheDocument();
  });
});
