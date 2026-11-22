import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BiodivPedagoProvider } from '../../../src/contexts/BiodivPedagoContext.jsx';
import { PlantCatalogTile } from '../../../src/components/biodiv/PlantCatalogTile.jsx';

/**
 * Chantier collège, intégration SI (vérification indépendante) : la vignette du catalogue
 * suit les mêmes briques que celle de la Visite. Au collège : ni nom scientifique ni
 * description savante, étiquette simple et description collège seulement. Lycée : inchangé.
 */

const PLANT = {
  id: 7,
  name: 'Lycose',
  emoji: '🕷️',
  scientific_name: 'Lycosidae',
  usage_label: 'une araignée qui chasse au sol',
  description: 'Araignée de la famille des Lycosidés, Arachnide chasseur.',
  description_college: 'Elle chasse sans toile, à l’affût dans l’herbe.',
};

function renderTile(providerProps, plant = PLANT) {
  return render(
    <BiodivPedagoProvider {...providerProps}>
      <PlantCatalogTile plant={plant} />
    </BiodivPedagoProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('Vignette du catalogue — profil collège', () => {
  for (const [label, props] of [
    ['Visite sans compte', { isGuestVisit: true }],
    ['classe de 6e', { classCurriculumNiveaux: ['cycle3'] }],
    ['classe de 3e', { classCurriculumNiveaux: ['cycle4'] }],
  ]) {
    test(`${label} : étiquette et description collège, sans latin ni description savante`, () => {
      renderTile(props);
      expect(screen.getByText(PLANT.usage_label)).toBeInTheDocument();
      expect(screen.getByText(PLANT.description_college)).toBeInTheDocument();
      expect(screen.queryByText('Lycosidae')).not.toBeInTheDocument();
      expect(screen.queryByText(PLANT.description)).not.toBeInTheDocument();
    });
  }

  test('sans description collège : aucun extrait (jamais la description savante)', () => {
    renderTile({ classCurriculumNiveaux: ['cycle3'] }, { ...PLANT, description_college: null });
    expect(screen.queryByText(PLANT.description)).not.toBeInTheDocument();
    expect(document.querySelector('.biodiv-tile__desc')).toBeNull();
  });
});

describe('Vignette du catalogue — profil lycée (inchangé)', () => {
  test('nom scientifique et description, ni étiquette ni description collège', () => {
    renderTile({ classCurriculumNiveaux: ['seconde'] });
    expect(screen.getByText('Lycosidae')).toBeInTheDocument();
    expect(screen.getByText(PLANT.description)).toBeInTheDocument();
    expect(screen.queryByText(PLANT.usage_label)).not.toBeInTheDocument();
    expect(screen.queryByText(PLANT.description_college)).not.toBeInTheDocument();
  });
});
