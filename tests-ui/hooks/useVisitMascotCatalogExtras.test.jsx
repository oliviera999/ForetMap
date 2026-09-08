import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import useVisitMascotCatalogExtras, {
  invalidateVisitMascotCatalogExtras,
  loadVisitMascotCatalogExtras,
  useVisitMascotRegistry,
} from '../../src/hooks/useVisitMascotCatalogExtras.js';
import { api } from '../../src/services/api';

vi.mock('../../src/services/api', () => ({ api: vi.fn() }));

function registryPackRow(id = 'srv-1') {
  return {
    id,
    catalog_id: id,
    label: 'Gnome importé',
    source: 'pack',
    map_id: 'foret',
    pack: {
      mascotPackVersion: 2,
      id,
      label: 'Gnome importé',
      renderer: 'sprite_cut',
      framesBase: `/api/visit/mascot-packs/${id}/assets/`,
      frameWidth: 150,
      frameHeight: 180,
      fallbackSilhouette: 'gnome',
      stateFrames: { idle: { files: ['cell-r1-c0.png'], fps: 2 } },
    },
  };
}

/** Entrée « mascotte livrée » du registre : pas de pack, donc aucune entrée extra produite. */
function registryCatalogRow(id = 'gnome1') {
  return { id, catalog_id: id, label: 'Gnome 1', source: 'catalog', map_id: null, pack: null };
}

beforeEach(() => {
  invalidateVisitMascotCatalogExtras();
});

afterEach(() => {
  vi.clearAllMocks();
  invalidateVisitMascotCatalogExtras();
});

describe('useVisitMascotCatalogExtras', () => {
  it('récupère le registre global des packs publiés et construit les extras', async () => {
    api.mockResolvedValueOnce({
      mascots: [registryCatalogRow(), registryPackRow('srv-abc')],
    });
    const { result } = renderHook(() => useVisitMascotCatalogExtras());
    await waitFor(() => expect(result.current).toHaveLength(1));
    // Registre global : aucune carte en paramètre — la mascotte suit le visiteur partout.
    expect(api).toHaveBeenCalledWith('/api/visit/mascots');
    expect(result.current[0].id).toBe('srv-abc');
    expect(result.current[0].renderer).toBe('sprite_cut');
  });

  it('désactivé → [] sans appel réseau', async () => {
    const { result } = renderHook(() => useVisitMascotCatalogExtras({ enabled: false }));
    expect(result.current).toEqual([]);
    expect(api).not.toHaveBeenCalled();
  });

  it('mise en cache : plusieurs écrans ne déclenchent qu’une requête', async () => {
    api.mockResolvedValueOnce({ mascots: [registryPackRow('srv-abc')] });
    const first = renderHook(() => useVisitMascotCatalogExtras());
    await waitFor(() => expect(first.result.current).toHaveLength(1));
    const second = renderHook(() => useVisitMascotCatalogExtras());
    await waitFor(() => expect(second.result.current).toHaveLength(1));
    expect(api).toHaveBeenCalledTimes(1);

    // Publication d'un pack au studio → invalidation explicite du cache.
    invalidateVisitMascotCatalogExtras();
    api.mockResolvedValueOnce({
      mascots: [registryPackRow('srv-abc'), registryPackRow('srv-def')],
    });
    await waitFor(async () => expect(await loadVisitMascotCatalogExtras()).toHaveLength(2));
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('erreur réseau → [] (pas de crash)', async () => {
    api.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useVisitMascotCatalogExtras());
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});

describe('useVisitMascotRegistry', () => {
  it('expose les ids proposés — mascottes livrées comprises, qui ne produisent aucun extra', async () => {
    api.mockResolvedValueOnce({
      mascots: [registryCatalogRow('gnome1'), registryPackRow('srv-abc')],
    });
    const { result } = renderHook(() => useVisitMascotRegistry());
    await waitFor(() => expect(result.current.offeredIds).not.toBeNull());
    // Une livrée n'apporte pas de pack : elle est absente des extras (le front a déjà sa
    // définition en dur) mais bien présente dans la liste offerte, sinon elle disparaîtrait.
    expect(result.current.extras.map((e) => e.id)).toEqual(['srv-abc']);
    expect(result.current.offeredIds).toEqual(['gnome1', 'srv-abc']);
  });

  it('registre inconnu (erreur réseau) → offeredIds null, pas []', async () => {
    api.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useVisitMascotRegistry());
    await waitFor(() => expect(api).toHaveBeenCalled());
    // `null` = « je ne sais pas, ne restreins rien ». Un `[]` serait lu comme une restriction
    // vide par les appelants et pourrait vider le sélecteur sur une simple panne de lecture.
    expect(result.current.offeredIds).toBeNull();
    expect(result.current.extras).toEqual([]);
  });

  it('désactivé → registre inconnu, sans appel réseau', () => {
    const { result } = renderHook(() => useVisitMascotRegistry({ enabled: false }));
    expect(result.current.offeredIds).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });
});
