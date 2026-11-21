import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EMPTY_PLANT_FORM } from '../../../src/utils/plantFormValues.js';
import { DataProvider } from '../../../src/contexts/DataContext.jsx';

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
 * nature enregistrée, et n'envoie une valeur qu'après un choix.
 */
const CATALOG = [
  { id: 42, name: 'Litière de feuilles', entity_kind: 'ressource' },
  { id: 43, name: 'Cloporte', entity_kind: 'taxon' },
];

function setup({ plantId = 42, form = { ...EMPTY_PLANT_FORM }, plants = CATALOG } = {}) {
  const setForm = vi.fn();
  render(
    <DataProvider value={{ plants }}>
      <PlantEditForm
        title="Modifier"
        form={form}
        setForm={setForm}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        saving={false}
        plantId={plantId}
        onToast={vi.fn()}
      />
    </DataProvider>,
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
    const { select, setForm } = setup({ plantId: null });
    expect(select.value).toBe('taxon');
    expect(setForm).not.toHaveBeenCalled();
  });

  test('un choix est porté par le formulaire (donc envoyé à l’enregistrement)', () => {
    const { select, setForm } = setup({ plantId: 43 });
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

  test('la valeur du formulaire l’emporte sur celle du catalogue', () => {
    const { select } = setup({
      plantId: 42,
      form: { ...EMPTY_PLANT_FORM, entity_kind: 'consortium' },
    });
    expect(select.value).toBe('consortium');
  });
});
