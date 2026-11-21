import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EMPTY_PLANT_FORM, extractPlantForm } from '../../../src/utils/plantFormValues.js';

vi.mock('../../../src/services/api', () => ({ api: vi.fn(async () => ({})) }));
vi.mock('../../../src/components/biodiv/PlantnetIdentifyPanel.jsx', () => ({
  PlantnetIdentifyPanel: () => <div data-testid="plantnet-panel" />,
}));
vi.mock('../../../src/components/biodiv/PlantPrefillPanel.jsx', () => ({
  PlantPrefillPanel: () => <div data-testid="prefill-panel" />,
}));

import { PlantEditForm } from '../../../src/components/biodiv/PlantEditForm.jsx';

/**
 * Champ « Nature de la fiche » (`plants.entity_kind`) du formulaire de gestion : il montre la
 * nature enregistrée (portée par le formulaire, `extractPlantForm`) et la modifie.
 */
const RESOURCE = { id: 42, name: 'Litière de feuilles', entity_kind: 'ressource' };
const SPECIES = { id: 43, name: 'Cloporte', entity_kind: 'taxon' };

function setup({ plantId = 42, form = extractPlantForm(RESOURCE) } = {}) {
  const setForm = vi.fn();
  render(
    <PlantEditForm
      title="Modifier"
      form={form}
      setForm={setForm}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      saving={false}
      plantId={plantId}
      onToast={vi.fn()}
    />,
  );
  return { setForm, select: screen.getByLabelText('Nature de la fiche') };
}

describe('PlantEditForm — nature de la fiche', () => {
  test('propose les quatre natures du référentiel, avec leur libellé', () => {
    const { select } = setup();
    expect([...select.querySelectorAll('option')].map((o) => o.value)).toEqual([
      'taxon',
      'groupe_fonctionnel',
      'consortium',
      'ressource',
    ]);
    expect(screen.getByRole('option', { name: 'Ressource non vivante' })).toBeTruthy();
  });

  test('édition : montre la nature enregistrée et prévient qu’une ressource est masquée des élèves', () => {
    const { select } = setup({ plantId: 42 });
    expect(select.value).toBe('ressource');
    expect(screen.getByText(/Absente de la liste et de la recherche des élèves/)).toBeTruthy();
  });

  test('création : « taxon » par défaut, rien n’est écrit dans le formulaire sans choix', () => {
    expect(EMPTY_PLANT_FORM.entity_kind).toBe('');
    const { select, setForm } = setup({ plantId: null, form: { ...EMPTY_PLANT_FORM } });
    expect(select.value).toBe('taxon');
    expect(setForm).not.toHaveBeenCalled();
  });

  test('un choix est porté par le formulaire (donc envoyé à l’enregistrement)', () => {
    const { select, setForm } = setup({ plantId: 43, form: extractPlantForm(SPECIES) });
    expect(select.value).toBe('taxon');
    // Le parent applique la mise à jour pendant l'évènement (comme `useState`) : on la rejoue
    // au même moment, avant que React ne rétablisse la valeur du champ contrôlé.
    let next = null;
    setForm.mockImplementation((updater) => {
      next = updater({ name: 'Cloporte' });
    });
    fireEvent.change(select, { target: { value: 'ressource' } });
    expect(next).toEqual({ name: 'Cloporte', entity_kind: 'ressource' });
  });

  test('extractPlantForm reprend la nature de la fiche, sans la transformer', () => {
    expect(extractPlantForm(RESOURCE).entity_kind).toBe('ressource');
    expect(extractPlantForm({ id: 9, name: 'Sans nature' }).entity_kind).toBe('');
  });
});
