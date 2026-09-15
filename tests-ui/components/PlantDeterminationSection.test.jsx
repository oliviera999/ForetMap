import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { PlantDeterminationSection } from '../../src/components/biodiv/PlantDeterminationSection.jsx';
import { PublicSettingsProvider } from '../../src/contexts/PublicSettingsContext.jsx';

/**
 * Section « Détermination » des fiches espèces.
 *
 * Les trois champs sont neutres vis-à-vis du règne : les cas de test mêlent
 * volontairement champignon, animal et végétal, parce qu'un libellé botanique
 * rendrait la section inutilisable sur la moitié du catalogue.
 */

const CHAMPIGNON = {
  name: 'Amanite phalloïde',
  identification_criteria: 'Volve à la base du pied, lames blanches libres, anneau retombant.',
  lookalike_species: 'Confusion mortelle avec le rosé des prés : lames roses puis brunes.',
  identification_period: 'Fin d’été et automne, sous les chênes',
};

function renderSection(plant, { settings = null, ...props } = {}) {
  return render(
    <PublicSettingsProvider value={settings}>
      <PlantDeterminationSection plant={plant} {...props} />
    </PublicSettingsProvider>,
  );
}

describe('PlantDeterminationSection', () => {
  test('ne rend rien tant qu’aucun des trois champs n’est renseigné', () => {
    const { container } = renderSection({ name: 'Ronce', description: 'Buisson épineux.' });
    expect(container.querySelector('.plant-determination')).toBeNull();
  });

  test('ignore les valeurs de remplissage du catalogue (« - », espaces)', () => {
    const { container } = renderSection({
      name: 'Compost',
      identification_criteria: '  ',
      lookalike_species: '-',
      identification_period: '',
    });
    expect(container.querySelector('.plant-determination')).toBeNull();
  });

  test('affiche les trois champs renseignés', () => {
    const { container, getByText } = renderSection(CHAMPIGNON);
    expect(container.querySelector('.plant-determination')).not.toBeNull();
    expect(getByText('Critères de détermination')).toBeTruthy();
    expect(container.textContent).toContain('Volve à la base du pied');
    expect(container.textContent).toContain('lames roses puis brunes');
    expect(container.textContent).toContain('sous les chênes');
  });

  test('les confusions sortent de la grille et passent en encadré d’alerte', () => {
    const { container } = renderSection(CHAMPIGNON);
    const alert = container.querySelector('.plant-determination__alert');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain('Confusions possibles');
    expect(alert.textContent).toContain('rosé des prés');
  });

  test('un champ seul suffit : la section s’affiche sans les blocs vides', () => {
    const { container } = renderSection({
      name: 'Lombric commun',
      identification_criteria: 'Clitellum vers le tiers avant, corps cylindrique.',
    });
    expect(container.querySelector('.plant-determination')).not.toBeNull();
    expect(container.querySelector('.plant-determination__alert')).toBeNull();
    expect(container.textContent).toContain('Clitellum');
  });

  test('repliée par défaut quand le réglage de site est absent', () => {
    const { container } = renderSection(CHAMPIGNON);
    expect(container.querySelector('details').open).toBe(false);
  });

  test('dépliée d’office quand ui.biodiv.determination_always_open est actif', () => {
    const { container } = renderSection(CHAMPIGNON, {
      settings: { biodiv: { determination_always_open: true } },
    });
    expect(container.querySelector('details').open).toBe(true);
  });

  test('le réglage à false laisse la section repliée', () => {
    const { container } = renderSection(CHAMPIGNON, {
      settings: { biodiv: { determination_always_open: false } },
    });
    expect(container.querySelector('details').open).toBe(false);
  });

  test('defaultOpen l’emporte sur le réglage de site', () => {
    const { container } = renderSection(CHAMPIGNON, {
      settings: { biodiv: { determination_always_open: true } },
      defaultOpen: false,
    });
    expect(container.querySelector('details').open).toBe(false);
  });
});
