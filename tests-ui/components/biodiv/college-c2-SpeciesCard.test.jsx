import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { BiodivPedagoProvider } from '../../../src/contexts/BiodivPedagoContext.jsx';
import { VISIBILITY_TABLE } from '../../../src/shared/pedagoVisibilityCore.js';
import { interactionTypeLabelSimple } from '../../../src/shared/enums/biodivEnums.js';
import { interactionTypeLabel } from '../../../src/shared/foodWebTypes.js';

/**
 * Assouplissement du profil collège (22/11/2026, flux C2, lot 4) : la fiche espèce lue en 6e,
 * en 3e et en 2de, avec le vrai contexte pédagogique (table de visibilité).
 *
 * - description collège d'abord, description complète dans un bloc replié ;
 * - interactions de la fiche : libellés du profil, jamais le code brut ;
 * - sections Identité et Écologie repliées au collège : ce test ne tourne qu'une fois la brique
 *   `meta_sections` passée à `collapsed` par le flux C1 (sauté sinon, voir le journal C2).
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

const INTERACTIONS = {
  asSource: [
    { id: 1, interaction_type: 'plante_hote', to_id: 57, to_name: 'Chou', to_emoji: '🥬' },
  ],
  asTarget: [{ id: 2, interaction_type: 'predation', from_id: 82, from_name: 'Coccinelle' }],
};
vi.mock('../../../src/services/api', () => ({
  api: vi.fn(async (url) => (String(url).endsWith('/interactions') ? INTERACTIONS : {})),
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
  id: 57,
  name: 'Piéride du chou',
  emoji: '🦋',
  scientific_name: 'Pieris brassicae',
  description: 'Description complète et savante de la piéride.',
  description_college: 'Papillon blanc dont la chenille mange les feuilles de chou.',
  life_cycle: 'Annuelle',
  habitat: 'Potager',
  trophic_role: 'consommateur_primaire',
  sources: 'https://www.gbif.org/species/1',
};

const COLLEGE_META_SECTIONS = VISIBILITY_TABLE.meta_sections.college;

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

const COLLEGE_PROFILES = [
  ['6e', 'cycle3'],
  ['3e', 'cycle4'],
];

describe('Fiche espèce collège — description et interactions', () => {
  for (const [label, niveau] of COLLEGE_PROFILES) {
    test(`${label} : description collège d’abord, description complète repliée`, () => {
      renderFor(niveau);
      const college = screen.getByText(PLANT.description_college);
      const full = screen.getByTestId('plant-full-description');
      expect(full.open).toBe(false);
      expect(within(full).getByText('Description complète')).toBeInTheDocument();
      expect(within(full).getByText(PLANT.description)).toBeInTheDocument();
      // La description collège précède le bloc replié.
      expect(college.compareDocumentPosition(full) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    test(`${label} : interactions en libellés simples, sans code brut`, async () => {
      renderFor(niveau);
      const hostLabel = interactionTypeLabelSimple('plante_hote');
      await waitFor(() => expect(screen.getByText(hostLabel)).toBeInTheDocument());
      expect(screen.getByText(interactionTypeLabelSimple('predation'))).toBeInTheDocument();
      expect(screen.queryByText('plante_hote')).not.toBeInTheDocument();
      expect(screen.queryByText('predation')).not.toBeInTheDocument();
    });
  }

  test('2de : description habituelle seule, interactions en mots savants', async () => {
    renderFor('seconde');
    expect(screen.getByText(PLANT.description)).toBeInTheDocument();
    expect(screen.queryByText(PLANT.description_college)).not.toBeInTheDocument();
    expect(screen.queryByTestId('plant-full-description')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(interactionTypeLabel('plante_hote'))).toBeInTheDocument(),
    );
    expect(screen.getByText(interactionTypeLabel('predation'))).toBeInTheDocument();
    expect(screen.queryByText('plante_hote')).not.toBeInTheDocument();
  });
});

describe.runIf(COLLEGE_META_SECTIONS === 'collapsed')(
  'Fiche espèce collège — sections complètes repliées (après le flux C1)',
  () => {
    for (const [label, niveau] of COLLEGE_PROFILES) {
      test(`${label} : Identité et Écologie repliées, nom scientifique dans Identité`, () => {
        const { container } = renderFor(niveau);
        const identity = screen.getByText('Identité').closest('details');
        const ecology = screen.getByText('Écologie et usages').closest('details');
        expect(identity.open).toBe(false);
        expect(ecology.open).toBe(false);
        expect(within(identity).getByText(PLANT.scientific_name)).toBeInTheDocument();
        expect(within(identity).getByText(PLANT.life_cycle)).toBeInTheDocument();
        expect(within(ecology).getByText(PLANT.habitat)).toBeInTheDocument();
        // Toujours hors de l'en-tête.
        expect(container.querySelector('.plant-scientific')).toBeNull();
      });
    }
  },
);

describe('Fiche espèce 2de — sections complètes (inchangé)', () => {
  test('Identité et Écologie présentes, nom scientifique dans l’en-tête', () => {
    const { container } = renderFor('seconde');
    expect(screen.getByText('Identité').closest('details').open).toBe(false);
    expect(screen.getByText('Écologie et usages').closest('details').open).toBe(false);
    expect(container.querySelector('.plant-scientific')).toHaveTextContent(PLANT.scientific_name);
  });
});
