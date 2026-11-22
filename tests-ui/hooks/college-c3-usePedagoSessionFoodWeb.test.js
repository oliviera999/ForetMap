import { describe, it, expect, vi } from 'vitest';
import { runPedagoSessionStepAction } from '../../src/hooks/usePedagoSession.js';
import { PEDAGO_STEP_ACTION as A } from '../../src/shared/enums/pedagoStepActions.js';

/** Chantier collège (flux C3) : étape « réseau trophique » avec `plantIds`. */

function nav() {
  return {
    navigateTab: vi.fn(),
    setPlantCatalogPreview: vi.fn(),
    openPedagoFoodWeb: vi.fn(),
    setFoodWebRequest: vi.fn(),
  };
}
const step = (type, payload) => ({ title: type, action: { type, payload } });

describe('runPedagoSessionStepAction — réseau trophique', () => {
  it('plantIds : demande transmise au réseau, highlightPlantId inchangé', () => {
    const n = nav();
    runPedagoSessionStepAction(
      step(A.OPEN_FOODWEB, { mapId: 'foret', highlightPlantId: 4, plantIds: [4, '5', 4] }),
      n,
    );
    expect(n.openPedagoFoodWeb).toHaveBeenCalledWith(4, 'foret');
    const request = n.setFoodWebRequest.mock.calls.at(-1)[0];
    expect(request).toMatchObject({ plantIds: [4, 5], mapId: 'foret' });
    expect(typeof request.nonce).toBe('number');
  });

  it('sans plantIds (ou invalide) : aucune demande, comportement historique', () => {
    const n = nav();
    runPedagoSessionStepAction(step(A.OPEN_FOODWEB, { highlightPlantId: 4 }), n);
    expect(n.setFoodWebRequest).toHaveBeenLastCalledWith(null);
    runPedagoSessionStepAction(step(A.OPEN_FOODWEB, { plantIds: 'x' }), n);
    expect(n.setFoodWebRequest).toHaveBeenLastCalledWith(null);
    expect(n.openPedagoFoodWeb).toHaveBeenLastCalledWith(null, null);
  });

  it('une autre étape efface la demande', () => {
    const n = nav();
    runPedagoSessionStepAction(step(A.MESSAGE, {}), n);
    expect(n.setFoodWebRequest).toHaveBeenCalledWith(null);
  });
});
