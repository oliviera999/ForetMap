// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { useVisitMapMascotController } from '../../src/hooks/useVisitMapMascotController.js';
import { invalidateVisitMascotCatalogExtras } from '../../src/hooks/useVisitMascotCatalogExtras.js';
import { buildVisitMascotOptions } from '../../src/utils/studentProfileFields.js';
import { getVisitMascotCatalog } from '../../src/utils/visitMascotCatalog.js';
import { api } from '../../src/services/api';

vi.mock('../../src/services/api', () => ({ api: vi.fn() }));

/**
 * **Le sélecteur dit ce que dit le studio.**
 *
 * `buildVisitMascotSelectionOptions` empile d'abord tout le catalogue livré (seize entrées en
 * dur), puis les packs : sans restriction, il propose donc toujours les seize, quoi qu'on ait
 * dépublié ou supprimé au studio. La mécanique de restriction existait (`allowedMascotIds`) et
 * était testée dans `tests/visit-mascot-catalog.test.js` ; ce qui manquait, c'est **le câblage** :
 * personne ne lui passait la liste du registre depuis la disparition de
 * `ui.visit.mascot.allowed_ids`. Résultat : trois mascottes au studio, dix-huit au sélecteur, et
 * un `400 « Mascotte indisponible »` à l'enregistrement d'une préférence pourtant proposée
 * (le serveur, lui, tranchait déjà par le registre).
 *
 * Ces tests montent les deux écrans qui **proposent** des mascottes — la visite et « Mon profil »
 * — et vérifient qu'ils s'en tiennent au registre. Ils échouent sur le code d'avant.
 */

/** Une ligne de registre « mascotte livrée » : pas de pack, le front a déjà sa définition. */
function catalogRow(id, label = id) {
  return { id, catalog_id: id, label, source: 'catalog', pack: null };
}

function Harness({ apiRef, profileVisitMascotId = null }) {
  const visitMapFitRef = useRef({ height: 600 });
  apiRef.current = useVisitMapMascotController({
    mapId: 'foret',
    loading: false,
    content: { markers: [], mascot_packs: [] },
    prefersReducedMotion: false,
    profileVisitMascotId,
    visitMapFitRef,
    viewportFitHeight: 600,
    setSelected: () => {},
    setSelectedType: () => {},
  });
  return null;
}

beforeEach(() => {
  window.localStorage.clear();
  invalidateVisitMascotCatalogExtras();
});

afterEach(() => {
  vi.clearAllMocks();
  invalidateVisitMascotCatalogExtras();
});

describe('mascottes proposées : le registre borne le sélecteur', () => {
  it('visite : seules les mascottes du registre sont proposées', async () => {
    api.mockResolvedValue({
      mascots: [catalogRow('gnome1'), catalogRow('renard2-cut-spritesheet')],
    });
    const apiRef = { current: null };
    render(<Harness apiRef={apiRef} />);

    await waitFor(() =>
      expect(apiRef.current.visitMascotOptions.map((o) => o.id)).toEqual([
        'renard2-cut-spritesheet',
        'gnome1',
      ]),
    );
    // Le catalogue livré en compte bien davantage : c'est le registre qui tranche, pas le code.
    expect(getVisitMascotCatalog().length).toBeGreaterThan(2);
  });

  it('visite : une préférence retirée de la visite retombe sur une mascotte proposée', async () => {
    api.mockResolvedValue({ mascots: [catalogRow('gnome1')] });
    const apiRef = { current: null };
    // `spore-rive` existe au catalogue livré mais n'est plus proposée : la garder afficherait
    // une mascotte que le serveur refuse d'enregistrer (`isVisitMascotOffered`).
    render(<Harness apiRef={apiRef} profileVisitMascotId="spore-rive" />);

    await waitFor(() => expect(apiRef.current.visitMascotId).toBe('gnome1'));
  });

  it('registre inconnu → aucune restriction, le sélecteur ne se vide pas', async () => {
    api.mockRejectedValue(new Error('réseau'));
    const apiRef = { current: null };
    render(<Harness apiRef={apiRef} />);

    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(apiRef.current.visitMascotOptions.length).toBe(getVisitMascotCatalog().length);
  });

  it('« Mon profil » propose exactement la même liste que la visite', () => {
    const offeredIds = ['gnome1', 'renard2-cut-spritesheet'];
    expect(buildVisitMascotOptions(offeredIds, []).map((o) => o.id)).toEqual([
      'renard2-cut-spritesheet',
      'gnome1',
    ]);
    // Registre pas encore lu : pas de restriction, comme en visite.
    expect(buildVisitMascotOptions(null, []).length).toBe(getVisitMascotCatalog().length);
  });
});

/**
 * Garde de câblage — le défaut d'origine n'était pas dans la mécanique de restriction (testée,
 * juste), mais dans le fait que **personne ne l'appelait**. Un écran qui propose des mascottes
 * sans passer `offeredIds` repart silencieusement du catalogue livré complet : rien ne casse,
 * rien ne le signale, et le studio et le sélecteur divergent à nouveau.
 *
 * Le montage réel (au-dessus) couvre la visite ; `map-views.jsx` est trop lourd à monter pour
 * une seule ligne de câblage, d'où cette lecture de source, dans l'esprit de
 * `tests/gl-visit-map-mascot-css.test.js`.
 */
describe('câblage : tout écran qui propose des mascottes borne sa liste', () => {
  const ecrans = [
    ['src/components/map-views.jsx', 'allowedMascotIds: visitMascotOfferedIds'],
    ['src/hooks/useVisitMapMascotController.js', 'allowedMascotIds: visitMascotOfferedIds'],
    ['src/components/stats-views.jsx', 'buildVisitMascotOptions(visitMascotOfferedIds'],
  ];

  it.each(ecrans)('%s passe la liste du registre', (fichier, attendu) => {
    const source = readFileSync(join(process.cwd(), fichier), 'utf8');
    expect(source).toContain('useVisitMascotRegistry');
    expect(source).toContain(attendu);
  });
});
