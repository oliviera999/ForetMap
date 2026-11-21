import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BiodivPedagoProvider } from '../../../src/contexts/BiodivPedagoContext.jsx';
import {
  VisitBiodiversityPanel,
  speciesTileExtract,
} from '../../../src/components/visit/VisitBiodiversityPanel.jsx';

/**
 * Chantier collège (flux C1, point 4) : vignettes d'espèce de la Visite. Au collège (Visite
 * sans compte comprise) : pas de nom scientifique, étiquette simple sous le nom, extrait =
 * description collège, sinon description, sinon rôle écologique. Lycée : inchangé.
 */

const PLANT = {
  id: 21,
  name: 'Grenadier',
  emoji: '🌳',
  scientific_name: 'Punica granatum',
  usage_label: 'Arbre fruitier',
  ecosystem_role: 'Ses fleurs nourrissent les abeilles.',
  description: 'Description savante du grenadier.',
  description_college: 'Petit arbre aux fruits rouges remplis de graines.',
};

function renderPanel(providerProps, plant = PLANT) {
  return render(
    <BiodivPedagoProvider {...providerProps}>
      <VisitBiodiversityPanel
        locationKind="zone"
        names={[plant.name]}
        species={[{ id: plant.id, name: plant.name, emoji: plant.emoji }]}
        plants={[plant]}
        onOpenPlant={() => {}}
      />
    </BiodivPedagoProvider>,
  );
}

const tile = () => screen.getByRole('button', { name: /Ouvrir la fiche de Grenadier/ });

beforeEach(() => {
  sessionStorage.clear();
});

describe('Vignettes de la Visite — profil collège', () => {
  for (const [label, props] of [
    ['Visite sans compte', { isGuestVisit: true }],
    ['classe de 6e', { classCurriculumNiveaux: ['cycle3'] }],
    ['classe de 3e', { classCurriculumNiveaux: ['cycle4'] }],
  ]) {
    test(`${label} : étiquette, description collège, sans nom scientifique`, () => {
      renderPanel(props);
      const t = within(tile());
      expect(t.getByText('Arbre fruitier')).toBeInTheDocument();
      expect(t.getByText(PLANT.description_college)).toBeInTheDocument();
      expect(t.queryByText('Punica granatum')).not.toBeInTheDocument();
      expect(t.queryByText(PLANT.ecosystem_role)).not.toBeInTheDocument();
    });
  }

  test('sans description collège : description, puis rôle écologique', () => {
    renderPanel({ isGuestVisit: true }, { ...PLANT, description_college: '' });
    expect(within(tile()).getByText(PLANT.description)).toBeInTheDocument();
  });

  test('ordre de l’extrait au collège', () => {
    const opts = { preferCollegeDescription: true };
    expect(speciesTileExtract(PLANT, opts)).toBe(PLANT.description_college);
    expect(speciesTileExtract({ ...PLANT, description_college: null }, opts)).toBe(
      PLANT.description,
    );
    expect(speciesTileExtract({ ecosystem_role: 'Rôle.' }, opts)).toBe('Rôle.');
    expect(speciesTileExtract({}, opts)).toBeNull();
  });
});

describe('Vignettes de la Visite — profil lycée (inchangé)', () => {
  test('nom scientifique, rôle écologique, ni étiquette ni description collège', () => {
    renderPanel({ classCurriculumNiveaux: ['seconde'] });
    const t = within(tile());
    expect(t.getByText('Punica granatum')).toBeInTheDocument();
    expect(t.getByText(PLANT.ecosystem_role)).toBeInTheDocument();
    expect(t.queryByText('Arbre fruitier')).not.toBeInTheDocument();
    expect(t.queryByText(PLANT.description_college)).not.toBeInTheDocument();
  });
});
