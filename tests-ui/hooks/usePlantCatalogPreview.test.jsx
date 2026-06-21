import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { usePlantCatalogPreview } from '../../src/hooks/usePlantCatalogPreview';

const PLANTS = [
  { id: 1, name: 'Chêne' },
  { id: 2, name: 'Hêtre' },
];

describe('usePlantCatalogPreview', () => {
  it('démarre sans aperçu sélectionné', () => {
    const { result } = renderHook(() => usePlantCatalogPreview(PLANTS));
    expect(result.current.plantCatalogPreview).toBeNull();
    expect(typeof result.current.openPlantCatalogPreviewById).toBe('function');
    expect(typeof result.current.setPlantCatalogPreview).toBe('function');
  });

  it('ouvre la fiche correspondante par id (coercition numérique)', () => {
    const { result } = renderHook(() => usePlantCatalogPreview(PLANTS));
    act(() => {
      result.current.openPlantCatalogPreviewById('2');
    });
    expect(result.current.plantCatalogPreview).toEqual({ id: 2, name: 'Hêtre' });
  });

  it('ignore un id invalide ou absent du catalogue', () => {
    const { result } = renderHook(() => usePlantCatalogPreview(PLANTS));
    act(() => {
      result.current.openPlantCatalogPreviewById(0);
    });
    act(() => {
      result.current.openPlantCatalogPreviewById('abc');
    });
    act(() => {
      result.current.openPlantCatalogPreviewById(999);
    });
    expect(result.current.plantCatalogPreview).toBeNull();
  });

  it('permet la fermeture via setPlantCatalogPreview(null)', () => {
    const { result } = renderHook(() => usePlantCatalogPreview(PLANTS));
    act(() => {
      result.current.openPlantCatalogPreviewById(1);
    });
    expect(result.current.plantCatalogPreview).toEqual({ id: 1, name: 'Chêne' });
    act(() => {
      result.current.setPlantCatalogPreview(null);
    });
    expect(result.current.plantCatalogPreview).toBeNull();
  });

  it('tolère une liste plants absente sans planter', () => {
    const { result } = renderHook(() => usePlantCatalogPreview(undefined));
    act(() => {
      result.current.openPlantCatalogPreviewById(1);
    });
    expect(result.current.plantCatalogPreview).toBeNull();
  });
});
