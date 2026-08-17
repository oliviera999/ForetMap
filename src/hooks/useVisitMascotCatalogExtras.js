import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { buildVisitMascotCatalogExtrasFromContent } from '../utils/visitMascotPackExtras.js';

/**
 * Packs mascotte **publiés**, toutes cartes confondues (`GET /api/visit/mascots`), convertis
 * en entrées catalogue (`extras`) attendues par le renderer et la résolution de mascotte.
 *
 * Le registre est **global** : une mascotte choisie (pack compris) suit le visiteur d'une
 * carte à l'autre, et peut être la mascotte par défaut de l'application. Aucun jeton requis
 * (les assets des packs publiés sont publics). Renvoie `[]` tant que désactivé / en erreur.
 */

/** Cache module (une requête par session) : le registre change rarement et sert 4 écrans. */
let cachedEntries = null;
let inFlight = null;

async function fetchVisitMascotCatalogExtras() {
  const res = await api('/api/visit/mascots');
  const rows = Array.isArray(res?.mascots) ? res.mascots : [];
  return buildVisitMascotCatalogExtrasFromContent(rows);
}

/** Charge (ou relit depuis le cache) les entrées catalogue des packs publiés. */
export async function loadVisitMascotCatalogExtras() {
  if (cachedEntries) return cachedEntries;
  if (!inFlight) {
    inFlight = fetchVisitMascotCatalogExtras()
      .then((entries) => {
        cachedEntries = entries;
        return entries;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Vide le cache — à appeler après publication / dépublication d'un pack au studio. */
export function invalidateVisitMascotCatalogExtras() {
  cachedEntries = null;
  inFlight = null;
}

/**
 * @param {{ enabled?: boolean }} [params]
 * @returns {Array<object>} entrées catalogue `sprite_cut`
 */
export default function useVisitMascotCatalogExtras({ enabled = true } = {}) {
  const [extras, setExtras] = useState(() => cachedEntries || []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    loadVisitMascotCatalogExtras()
      .then((next) => {
        if (!cancelled) setExtras(next);
      })
      .catch(() => {
        if (!cancelled) setExtras([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return extras;
}
