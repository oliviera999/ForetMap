import { useEffect, useState } from 'react';
import { api } from '../../services/api';

let cachedPromise = null;

/** Catégories d'événements servies par `GET /api/audit/catalog` (mises en cache par session). */
export function useAuditCatalog() {
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    let alive = true;
    if (!cachedPromise) {
      cachedPromise = api('/api/audit/catalog').catch((err) => {
        cachedPromise = null;
        throw err;
      });
    }
    cachedPromise
      .then((data) => {
        if (alive) setCategories(Array.isArray(data?.categories) ? data.categories : []);
      })
      .catch(() => {
        // Filtre de catégorie indisponible : le reste du journal fonctionne.
      });
    return () => {
      alive = false;
    };
  }, []);
  return categories;
}

/** Réinitialise le cache (tests). */
export function resetAuditCatalogCache() {
  cachedPromise = null;
}
