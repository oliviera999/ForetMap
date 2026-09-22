import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import {
  PlantHealthRiskSection,
  listHealthRiskLabels,
} from '../../src/components/biodiv/PlantHazardSection.jsx';
import {
  listPlantsNeedingHazardReview,
  plantNeedsHazardReview,
} from '../../src/utils/plantHazardReview.js';

/**
 * Encadré « Risque sanitaire » et file de relecture (migration 271).
 *
 * La règle qui compte ici est la séparation d'avec la toxicité : le renard n'est pas toxique,
 * il peut être porteur de la rage. Fondre les deux obligerait à écrire « mortel » sur sa
 * fiche, ce qui est faux et rendrait la pastille de toxicité illisible sur tout le catalogue
 * animal. Les deux encadrés doivent donc coexister sans se confondre.
 */

const RENARD = {
  name: 'Renard roux',
  health_risk: 'rage',
  health_notes: 'Toute morsure ou griffure impose une consultation médicale immédiate.',
  hazard_reviewed: 0,
};

describe('listHealthRiskLabels', () => {
  test('traduit la valeur du SET SQL en libellés lisibles', () => {
    expect(listHealthRiskLabels('rage,toxoplasmose')).toEqual(['Rage', 'Toxoplasmose']);
  });

  test('réordonne selon l’ordre canonique, quelle que soit la saisie', () => {
    expect(listHealthRiskLabels('toxoplasmose,rage')).toEqual(
      listHealthRiskLabels('rage,toxoplasmose'),
    );
  });

  test('tolère vide, null et les valeurs de remplissage du catalogue', () => {
    expect(listHealthRiskLabels('')).toEqual([]);
    expect(listHealthRiskLabels(null)).toEqual([]);
    expect(listHealthRiskLabels('-')).toEqual([]);
  });
});

describe('PlantHealthRiskSection', () => {
  test('ne rend rien sans risque sanitaire renseigné', () => {
    const { container } = render(<PlantHealthRiskSection plant={{ name: 'Menthe' }} />);
    expect(container.querySelector('.plant-hazard')).toBeNull();
  });

  test('rend un encadré distinct de la toxicité, hors <details>', () => {
    const { container } = render(<PlantHealthRiskSection plant={RENARD} />);
    const section = container.querySelector('.plant-hazard--sante');
    expect(section).not.toBeNull();
    expect(section.closest('details')).toBeNull();
    expect(section.textContent).toContain('Rage');
    expect(section.textContent).toContain('consultation médicale');
  });

  test('un risque non relu s’affiche quand même, marqué « à valider »', () => {
    const { container } = render(<PlantHealthRiskSection plant={RENARD} />);
    expect(container.querySelector('.plant-hazard__unreviewed')).not.toBeNull();
    const reviewed = render(
      <PlantHealthRiskSection plant={{ ...RENARD, hazard_reviewed: 1 }} />,
    ).container;
    expect(reviewed.querySelector('.plant-hazard__unreviewed')).toBeNull();
  });
});

describe('file de relecture des dangers', () => {
  test('une fiche vide n’entre pas dans la file, une fiche renseignée non relue y entre', () => {
    expect(plantNeedsHazardReview({ name: 'Menthe' })).toBe(false);
    expect(plantNeedsHazardReview(RENARD)).toBe(true);
    expect(plantNeedsHazardReview({ ...RENARD, hazard_reviewed: 1 })).toBe(false);
  });

  test('« aucun danger connu » compte comme information à relire', () => {
    // Affirmer qu'une espèce est sans danger engage autant que l'inverse : c'est le cas du
    // laurier-sauce, sosie comestible du laurier-rose.
    expect(plantNeedsHazardReview({ name: 'Laurier-sauce', toxicity_level: 'aucune' })).toBe(true);
  });

  test('les fiches les plus graves remontent en tête', () => {
    const list = listPlantsNeedingHazardReview([
      { id: 1, name: 'Ortie', toxicity_level: 'irritation' },
      { id: 2, name: 'Menthe' },
      { id: 3, name: 'Ricin', toxicity_level: 'mortel' },
      { id: 4, name: 'Renard', health_risk: 'rage' },
    ]);
    expect(list.map((p) => p.name)).toEqual(['Ricin', 'Ortie', 'Renard']);
  });
});
