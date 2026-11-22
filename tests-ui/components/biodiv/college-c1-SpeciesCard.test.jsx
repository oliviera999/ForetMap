import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BiodivPedagoProvider } from '../../../src/contexts/BiodivPedagoContext.jsx';
import { VISIBILITY_TABLE } from '../../../src/shared/pedagoVisibilityCore.js';

/**
 * Sections Identité / Écologie au collège : masquées tant que la brique `meta_sections` vaut
 * `hide`, rendues **repliées** quand elle vaut `collapsed` (assouplissement du 22/11/2026, flux
 * C1 pour la table, C2 pour le rendu). Le test suit la table, sans valeur en dur.
 */
const COLLEGE_META_SECTIONS = VISIBILITY_TABLE.meta_sections.college;

/**
 * Chantier collège (flux C1, point 3) : la fiche espèce lue par un collégien (6e ou 3e,
 * même rendu) et par un lycéen (rendu d'avant le chantier). Tout passe par la table de
 * visibilité : aucun test de niveau en dur dans les composants.
 */

vi.mock('../../../src/components/map-views', () => ({
  CatalogRemarksSection: () => null,
  Lightbox: () => null,
}));
vi.mock('../../../src/components/PlantSpeciesDiscoveryAcknowledge', () => ({
  PlantSpeciesDiscoveryAcknowledgeButton: () => null,
  fetchPlantObservationCounts: vi.fn(async () => ({})),
}));
vi.mock('../../../src/components/context-comments', () => ({
  ContextComments: () => null,
}));
vi.mock('../../../src/shared/platform/useOverlayHistoryBack', () => ({
  useOverlayHistoryBack: vi.fn(),
}));
vi.mock('../../../src/contexts/PublicSettingsContext.jsx', () => ({
  usePublicSettings: () => ({ modules: {}, biodiv: { pedago_level_default: 'college' } }),
}));
vi.mock('../../../src/contexts/SessionContext.jsx', () => ({
  useSession: () => ({ canParticipateContextComments: false, hasPermission: () => false }),
}));
vi.mock('../../../src/services/api', () => ({
  api: vi.fn(async () => ({})),
  getAuthToken: () => '',
}));
vi.mock('../../../src/contexts/DataContext.jsx', () => ({
  useData: () => ({ zones: [], markers: [] }),
}));
vi.mock('../../../src/services/biodivApi', () => ({
  fetchMapSpeciesPresence: vi.fn(async () => ({ species: [] })),
}));

const { PlantBiodiversityCatalogPreviewCard } =
  await import('../../../src/components/biodiv/PlantCatalogPreview.jsx');

const PLANT = {
  id: 12,
  name: 'Grenadier',
  emoji: '🌳',
  scientific_name: 'Punica granatum',
  description: 'Description savante du grenadier.',
  description_college: 'Petit arbre aux fruits rouges remplis de graines.',
  usage_label: 'Arbre fruitier',
  usage_group: { id: 3, label: 'Arbres et arbustes' },
  taxonomy: { kingdom: 'Végétal (Chlorobiontes)', family: 'Lythracées', genus: 'Punica' },
  iucn_status: 'VU',
  nutrition: 'Autotrophe',
  temp_min_c: 10,
  temp_max_c: 35,
  phRange: { min: 6, max: 8 },
  life_cycle: 'Vivace',
  habitat: 'Verger',
  sources: 'https://www.gbif.org/species/1',
  toxicity_level: 'aucune',
  identification_criteria: 'Fleurs rouge orangé, fruit à couronne.',
};

function renderFor(classNiveau) {
  return render(
    <BiodivPedagoProvider classCurriculumNiveaux={[classNiveau]}>
      <PlantBiodiversityCatalogPreviewCard plant={PLANT} />
    </BiodivPedagoProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('Fiche espèce — profil collège', () => {
  for (const [label, niveau] of [
    ['6e', 'cycle3'],
    ['3e', 'cycle4'],
  ]) {
    test(`${label} : étiquette, description collège, groupe d’usage, sans savant`, () => {
      const { container } = renderFor(niveau);
      expect(screen.getByTestId('plant-usage-label')).toHaveTextContent('Arbre fruitier');
      expect(screen.getByText(PLANT.description_college)).toBeInTheDocument();
      // Description complète : seulement dans le bloc replié qui suit la description collège.
      const full = screen.getByTestId('plant-full-description');
      expect(full.open).toBe(false);
      expect(within(full).getByText(PLANT.description)).toBeInTheDocument();
      expect(screen.getAllByText(PLANT.description)).toHaveLength(1);
      expect(screen.getByTestId('plant-usage-group')).toHaveTextContent('Arbres et arbustes');
      expect(screen.queryByText('Taxonomie')).not.toBeInTheDocument();
      // Nom scientifique jamais dans l'en-tête au collège.
      expect(container.querySelector('.plant-scientific')).toBeNull();
      if (COLLEGE_META_SECTIONS === 'hide') {
        expect(screen.queryByText('Punica granatum')).not.toBeInTheDocument();
        expect(screen.queryByText('Identité')).not.toBeInTheDocument();
        expect(screen.queryByText('Écologie et usages')).not.toBeInTheDocument();
      } else {
        expect(screen.getByText('Identité').closest('details').open).toBe(false);
        expect(screen.getByText('Écologie et usages').closest('details').open).toBe(false);
      }
      // Ressources gardée : sources, crédits et licences.
      expect(screen.getByText('Ressources')).toBeInTheDocument();
      // Jauges et pastilles (Nutrition, température) de l'en-tête : masquées au collège.
      expect(container.querySelector('.plant-range-gauges')).toBeNull();
      expect(container.querySelector('.plant-badges')).toBeNull();
      expect(screen.queryByText(/10-35°C/)).not.toBeInTheDocument();
      // UICN en mots, sans sigle.
      expect(screen.getByText('Liste rouge : vulnérable')).toBeInTheDocument();
      expect(screen.queryByText('UICN VU')).not.toBeInTheDocument();
      // Détermination toujours là.
      expect(screen.getByText(/Fleurs rouge orangé/)).toBeInTheDocument();
    });
  }

  test('6e et 3e : même rendu de fiche', () => {
    const sixieme = renderFor('cycle3').container.innerHTML;
    document.body.innerHTML = '';
    const troisieme = renderFor('cycle4').container.innerHTML;
    expect(troisieme).toBe(sixieme);
  });

  test('sans description collège : la description habituelle', () => {
    render(
      <BiodivPedagoProvider classCurriculumNiveaux={['cycle3']}>
        <PlantBiodiversityCatalogPreviewCard plant={{ ...PLANT, description_college: null }} />
      </BiodivPedagoProvider>,
    );
    expect(screen.getByText(PLANT.description)).toBeInTheDocument();
    expect(screen.queryByTestId('plant-full-description')).not.toBeInTheDocument();
  });
});

describe('Fiche espèce — profil lycée (inchangé)', () => {
  test('nom scientifique, taxonomie, sections, jauges, sigle UICN ; ni étiquette ni texte collège', () => {
    const { container } = renderFor('seconde');
    expect(screen.getAllByText('Punica granatum').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('plant-usage-label')).not.toBeInTheDocument();
    expect(screen.getByText(PLANT.description)).toBeInTheDocument();
    expect(screen.queryByText(PLANT.description_college)).not.toBeInTheDocument();
    expect(screen.queryByTestId('plant-full-description')).not.toBeInTheDocument();
    const taxonomy = screen.getByText('Taxonomie').closest('.plant-taxonomy-line');
    expect(within(taxonomy).getByText(/Lythracées/)).toBeInTheDocument();
    expect(screen.queryByTestId('plant-usage-group')).not.toBeInTheDocument();
    expect(screen.getByText('Identité')).toBeInTheDocument();
    expect(screen.getByText('Écologie et usages')).toBeInTheDocument();
    expect(container.querySelector('.plant-range-gauges')).not.toBeNull();
    expect(screen.getByText('UICN VU')).toBeInTheDocument();
  });
});
