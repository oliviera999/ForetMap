import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

/**
 * Assouplissement du profil collège (22/11/2026, flux C2, lot 4) : les sections Identité et
 * Écologie et usages reviennent au collège, **repliées**, quand la brique `meta_sections` de la
 * table de visibilité vaut `collapsed`. La valeur de la table est posée par le flux C1 : ici, on
 * la simule par un contexte pédagogique dont on choisit la valeur de chaque brique.
 */

let VISIBILITY = {};

vi.mock('../../../src/contexts/BiodivPedagoContext.jsx', () => ({
  useBiodivPedago: () => ({
    canShow: (feature) => (VISIBILITY[feature] ?? 'show') !== 'hide',
    visibility: (feature) => VISIBILITY[feature] ?? 'show',
  }),
}));
vi.mock('../../../src/components/map-views', () => ({ Lightbox: () => null }));
vi.mock('../../../src/components/MarkdownContent.jsx', () => ({
  MarkdownContent: ({ children, className }) => <div className={className}>{children}</div>,
}));

const { PlantMetaSections, metaSectionDisplay } =
  await import('../../../src/components/biodiv/PlantMetaSections.jsx');

const PLANT = {
  scientific_name: 'Solanum lycopersicum',
  life_cycle: 'Annuelle',
  size: '1 à 2 m',
  habitat: 'Potager ensoleillé',
  trophic_role: 'producteur',
  nutrition: 'Autotrophe',
  sources: 'https://www.gbif.org/species/2930137',
};

beforeEach(() => {
  VISIBILITY = {};
});

describe('metaSectionDisplay', () => {
  const table = (value) => () => value;
  test('hide → section non rendue', () => {
    expect(metaSectionDisplay('meta_sections', table('hide'))).toBeNull();
  });
  test('collapsed et show → repliée ; open → dépliée', () => {
    expect(metaSectionDisplay('meta_sections', table('collapsed'))).toEqual({
      open: false,
      visibility: 'collapsed',
    });
    expect(metaSectionDisplay('meta_sections', table('show'))).toEqual({
      open: false,
      visibility: 'show',
    });
    expect(metaSectionDisplay('meta_sections', table('open'))).toEqual({
      open: true,
      visibility: 'open',
    });
  });
  test('section sans brique → toujours rendue, repliée', () => {
    expect(metaSectionDisplay(undefined, table('hide'))).toEqual({
      open: false,
      visibility: 'show',
    });
  });
});

describe('PlantMetaSections selon la brique meta_sections', () => {
  test('collapsed : Identité et Écologie présentes, repliées, valeurs lisibles', () => {
    VISIBILITY = { meta_sections: 'collapsed' };
    render(<PlantMetaSections plant={PLANT} />);
    const identity = screen.getByText('Identité').closest('details');
    const ecology = screen.getByText('Écologie et usages').closest('details');
    expect(identity.open).toBe(false);
    expect(ecology.open).toBe(false);
    expect(identity).toHaveAttribute('data-pedago-visibility', 'collapsed');
    // Le nom scientifique, absent de l'en-tête au collège, est rendu dans la section Identité.
    expect(within(identity).getByText('Nom scientifique (usage)')).toBeInTheDocument();
    expect(within(identity).getByText('Solanum lycopersicum')).toBeInTheDocument();
    // Cycle de vie et habitat (séances 6e) : lisibles une fois la section dépliée.
    expect(within(identity).getByText('Annuelle')).toBeInTheDocument();
    expect(within(ecology).getByText('Potager ensoleillé')).toBeInTheDocument();
    // La valeur de la pastille Nutrition (masquée dans l'en-tête) est dans la section repliée.
    expect(within(ecology).getByText('Autotrophe')).toBeInTheDocument();
    expect(screen.getByText('Ressources')).toBeInTheDocument();
  });

  test('hide (ancien comportement) : Identité et Écologie absentes, Ressources gardée', () => {
    VISIBILITY = { meta_sections: 'hide' };
    render(<PlantMetaSections plant={PLANT} />);
    expect(screen.queryByText('Identité')).not.toBeInTheDocument();
    expect(screen.queryByText('Écologie et usages')).not.toBeInTheDocument();
    expect(screen.getByText('Ressources')).toBeInTheDocument();
  });

  test('show (lycée) : sections repliées comme avant', () => {
    VISIBILITY = { meta_sections: 'show' };
    const { container } = render(<PlantMetaSections plant={PLANT} />);
    const details = container.querySelectorAll('details');
    expect(details).toHaveLength(3);
    for (const d of details) expect(d.open).toBe(false);
  });

  test('open : sections dépliées d’emblée', () => {
    VISIBILITY = { meta_sections: 'open' };
    render(<PlantMetaSections plant={PLANT} />);
    expect(screen.getByText('Identité').closest('details').open).toBe(true);
    expect(screen.getByText('Ressources').closest('details').open).toBe(false);
  });
});
