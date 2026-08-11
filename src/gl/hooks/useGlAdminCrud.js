import { useCallback } from 'react';
import { apiGL } from '../services/apiGL.js';
import { useAdminCrud } from '../../shared/hooks/useAdminCrud.js';

/**
 * Squelette CRUD des panneaux d'édition admin GL (espèces, sorts, glossaire).
 *
 * Adaptateur mince du hook partagé
 * [`useAdminCrud`](../../shared/hooks/useAdminCrud.js) : il ne fait que lier le
 * transport HTTP GL (`apiGL`). Toute la mécanique (liste, fiche, « next-code »,
 * autosave débouncé, états loading/error/info) vit dans le hook partagé, que
 * ForetMap peut désormais consommer avec son propre transport.
 *
 * Options et valeur de retour identiques à `useAdminCrud`, sans `request`.
 */
export function useGlAdminCrud(options) {
  const request = useCallback((path, method, body) => apiGL(path, method, body), []);
  return useAdminCrud({ ...options, request });
}
