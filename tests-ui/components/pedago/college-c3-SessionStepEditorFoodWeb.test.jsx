// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionStepEditor } from '../../../src/components/pedago/SessionStepEditor.jsx';
import { buildPedagoSessionNote } from '../../../src/components/pedago/PedagoSessionDoneDialog.jsx';
import { PEDAGO_STEP_ACTION as A } from '../../../src/shared/enums/pedagoStepActions.js';

/** Chantier collège (flux C3) : espèces montrées par une étape « réseau trophique ». */

const plantOptions = [
  { id: 1, label: 'Renard' },
  { id: 2, label: 'Lapin' },
  { id: 3, label: 'Trèfle' },
];
const foodWebStep = (payload) => ({
  id: 's1',
  title: 'Qui mange qui',
  body: '',
  action: { type: A.OPEN_FOODWEB, payload },
  completeWhen: 'manual',
});

describe('SessionStepEditor — étape réseau trophique', () => {
  it('ajoute puis retire une espèce montrée', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SessionStepEditor
        steps={[foodWebStep({ highlightPlantId: 1 })]}
        onChange={onChange}
        plantOptions={plantOptions}
      />,
    );
    fireEvent.change(screen.getByLabelText('Ajouter une espèce montrée'), {
      target: { value: '2' },
    });
    expect(onChange.mock.calls.at(-1)[0][0].action.payload).toEqual({
      highlightPlantId: 1,
      plantIds: [2],
    });
    rerender(
      <SessionStepEditor
        steps={[foodWebStep({ highlightPlantId: 1, plantIds: [2, 3] })]}
        onChange={onChange}
        plantOptions={plantOptions}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retirer Lapin' }));
    expect(onChange.mock.calls.at(-1)[0][0].action.payload.plantIds).toEqual([3]);
    // Le menu d'ajout ne repropose pas une espèce déjà choisie.
    const addMenu = screen.getByLabelText('Ajouter une espèce montrée');
    const offered = [...addMenu.querySelectorAll('option')].map((o) => o.textContent);
    expect(offered).toContain('Renard');
    expect(offered).not.toContain('Trèfle');
  });
});

describe('buildPedagoSessionNote', () => {
  it('les espèces montrées par le réseau rejoignent les plantes de la séance', () => {
    const note = buildPedagoSessionNote({
      title: 'Réseau',
      steps: [foodWebStep({ plantIds: [7, 8] })],
    });
    const text = JSON.stringify(note);
    expect(text).toContain('data-ref=\\"7\\"');
    expect(text).toContain('data-ref=\\"8\\"');
  });
});
