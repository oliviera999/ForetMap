import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import {
  PlantHazardSection,
  listHazardExposureLabels,
} from '../../src/components/biodiv/PlantHazardSection.jsx';

/**
 * Encadré « Danger » des fiches espèces (migration 251).
 *
 * Deux règles tenues par ces tests, parce que ce sont celles qui coûteraient cher si elles
 * se perdaient dans un refactor :
 *   1. l'encadré n'est PAS dans un `<details>` — un avertissement repliable n'avertit
 *      personne ;
 *   2. `hazard_reviewed = 0` n'empêche PAS l'affichage, il ajoute « à valider ». Masquer un
 *      avertissement de toxicité jusqu'à relecture serait le seul choix vraiment dangereux.
 */

const RICIN = {
  name: 'Ricin',
  toxicity_level: 'mortel',
  hazard_exposure: 'ingestion',
  hazard_notes: 'Graines très toxiques (ricine) : quelques graines mâchées peuvent suffire.',
  hazard_reviewed: 0,
};

describe('listHazardExposureLabels', () => {
  test('traduit la valeur du SET SQL en libellés lisibles', () => {
    expect(listHazardExposureLabels('ingestion,contact')).toEqual([
      'Ingestion',
      'Contact avec la peau',
    ]);
  });

  test('réordonne selon l’ordre canonique, quelle que soit la saisie', () => {
    expect(listHazardExposureLabels('seve_latex,contact')).toEqual(
      listHazardExposureLabels('contact,seve_latex'),
    );
  });

  test('tolère vide, null et les valeurs de remplissage du catalogue', () => {
    expect(listHazardExposureLabels('')).toEqual([]);
    expect(listHazardExposureLabels(null)).toEqual([]);
    expect(listHazardExposureLabels('-')).toEqual([]);
  });

  test('ignore une voie inconnue sans perdre les autres', () => {
    expect(listHazardExposureLabels('ingestion,telepathie')).toEqual(['Ingestion']);
  });
});

describe('PlantHazardSection', () => {
  test('ne rend rien tant que le danger n’a pas été regardé', () => {
    const { container } = render(<PlantHazardSection plant={{ name: 'Menthe' }} />);
    expect(container.querySelector('.plant-hazard')).toBeNull();
  });

  test('« aucun danger connu » ne produit pas d’encadré rouge', () => {
    const { container } = render(
      <PlantHazardSection plant={{ name: 'Laurier-sauce', toxicity_level: 'aucune' }} />,
    );
    expect(container.querySelector('.plant-hazard')).toBeNull();
  });

  test('affiche le niveau, les voies d’exposition et la conduite à tenir', () => {
    const { container } = render(<PlantHazardSection plant={RICIN} />);
    const box = container.querySelector('.plant-hazard');
    expect(box).not.toBeNull();
    expect(box.textContent).toContain('Potentiellement mortel');
    expect(box.textContent).toContain('Ingestion');
    expect(box.textContent).toContain('ricine');
  });

  test('l’encadré n’est jamais replié dans un <details>', () => {
    const { container } = render(<PlantHazardSection plant={RICIN} />);
    expect(container.querySelector('details')).toBeNull();
    expect(container.querySelector('.plant-hazard')).not.toBeNull();
  });

  test('la gravité passe dans la classe CSS, pour que la couleur suive', () => {
    for (const level of ['irritation', 'toxique', 'mortel']) {
      const { container } = render(
        <PlantHazardSection plant={{ ...RICIN, toxicity_level: level }} />,
      );
      expect(container.querySelector(`.plant-hazard--${level}`)).not.toBeNull();
    }
  });

  test('un danger non relu s’affiche quand même, marqué « à valider »', () => {
    const { container } = render(<PlantHazardSection plant={{ ...RICIN, hazard_reviewed: 0 }} />);
    expect(container.querySelector('.plant-hazard')).not.toBeNull();
    expect(container.querySelector('.plant-hazard__unreviewed')).not.toBeNull();
    expect(container.textContent).toContain('à valider');
  });

  test('un danger relu perd la mention « à valider »', () => {
    const { container } = render(<PlantHazardSection plant={{ ...RICIN, hazard_reviewed: 1 }} />);
    expect(container.querySelector('.plant-hazard')).not.toBeNull();
    expect(container.querySelector('.plant-hazard__unreviewed')).toBeNull();
  });

  test('accepte la forme chaîne de hazard_reviewed venue du formulaire', () => {
    const { container } = render(<PlantHazardSection plant={{ ...RICIN, hazard_reviewed: '1' }} />);
    expect(container.querySelector('.plant-hazard__unreviewed')).toBeNull();
  });

  test('un niveau seul suffit : ni voies ni notes ne sont obligatoires', () => {
    const { container } = render(
      <PlantHazardSection plant={{ name: 'Ortie dioïque', toxicity_level: 'irritation' }} />,
    );
    expect(container.querySelector('.plant-hazard')).not.toBeNull();
    expect(container.querySelector('.plant-hazard__exposures')).toBeNull();
    expect(container.textContent).toContain('Irritation');
  });

  test('porte un rôle et un libellé accessibles', () => {
    const { container } = render(<PlantHazardSection plant={RICIN} />);
    const box = container.querySelector('.plant-hazard');
    expect(box.getAttribute('role')).toBe('note');
    expect(box.getAttribute('aria-label')).toContain('Potentiellement mortel');
  });
});
