import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { buildVisitMascotCatalogExtrasFromContent } from '../utils/visitMascotPackExtras.js';

/**
 * Registre des mascottes **proposées aux visiteurs** (`GET /api/visit/mascots`) — la même
 * source que le studio et le panneau d'administration.
 *
 * Il porte deux choses, et il faut les deux :
 *
 * - `extras` : les entrées catalogue des lignes qui apportent un pack (packs importés, et
 *   mascottes livrées éditées au studio) — ce qui **s'ajoute** au catalogue livré ;
 * - `offeredIds` : les identifiants proposés, dans l'ordre du registre — ce qui **borne** le
 *   sélecteur. Sans lui, le front repartait du catalogue statique complet
 *   (`buildVisitMascotSelectionOptions` empile les seize livrées avant les packs), si bien que
 *   dépublier ou supprimer une mascotte au studio n'avait aucun effet sur la liste offerte au
 *   visiteur : le studio en montrait trois, le sélecteur dix-huit. Le serveur, lui, tranchait
 *   déjà par le registre (`isVisitMascotOffered`), d'où des refus incompréhensibles à
 *   l'enregistrement d'une préférence pourtant proposée.
 *
 * `offeredIds` vaut **`null` tant que le registre est inconnu** — pas encore chargé, désactivé,
 * ou en erreur — et une liste dès qu'il a répondu. Les deux ne veulent pas dire la même chose :
 * `null` = « je ne sais pas, ne restreins rien ». Les confondre viderait le sélecteur le temps
 * d'un aller-retour réseau, ce qui est bien pire que d'y laisser une mascotte de trop pendant
 * une seconde.
 *
 * Aucun jeton requis (les assets des packs publiés sont publics).
 */

/** Registre inconnu : identités stables, pour ne pas relancer les `useMemo` en aval. */
const UNKNOWN_REGISTRY = Object.freeze({ extras: [], offeredIds: null });

/** Cache module (une requête par session) : le registre change rarement et sert 4 écrans. */
let cachedRegistry = null;
let inFlight = null;

async function fetchVisitMascotRegistry() {
  const res = await api('/api/visit/mascots');
  const rows = Array.isArray(res?.mascots) ? res.mascots : [];
  return {
    extras: buildVisitMascotCatalogExtrasFromContent(rows),
    offeredIds: rows
      .map((row) => String(row?.id || row?.catalog_id || '').trim())
      .filter(Boolean)
      .filter((id, idx, arr) => arr.indexOf(id) === idx),
  };
}

/** Charge (ou relit depuis le cache) le registre : `{ extras, offeredIds }`. */
export async function loadVisitMascotRegistry() {
  if (cachedRegistry) return cachedRegistry;
  if (!inFlight) {
    inFlight = fetchVisitMascotRegistry()
      .then((registry) => {
        cachedRegistry = registry;
        return registry;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Entrées catalogue des packs publiés seules — conservé pour les appelants qui n'ont que ça à faire. */
export async function loadVisitMascotCatalogExtras() {
  const registry = await loadVisitMascotRegistry();
  return registry.extras;
}

/** Vide le cache — à appeler après publication / dépublication d'un pack au studio. */
export function invalidateVisitMascotCatalogExtras() {
  cachedRegistry = null;
  inFlight = null;
}

/**
 * Registre complet : `{ extras, offeredIds }`. À préférer partout où une **liste de mascottes
 * est proposée à un utilisateur** — c'est `offeredIds` qui fait que le sélecteur dit la même
 * chose que le studio.
 *
 * @param {{ enabled?: boolean }} [params]
 * @returns {{ extras: Array<object>, offeredIds: string[]|null }}
 */
export function useVisitMascotRegistry({ enabled = true } = {}) {
  const [registry, setRegistry] = useState(() => cachedRegistry || UNKNOWN_REGISTRY);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    loadVisitMascotRegistry()
      .then((next) => {
        if (!cancelled) setRegistry(next);
      })
      .catch(() => {
        // Registre injoignable : on ne restreint rien plutôt que de vider le sélecteur.
        if (!cancelled) setRegistry(UNKNOWN_REGISTRY);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return registry;
}

/**
 * Entrées catalogue des packs publiés (`extras`) seules.
 *
 * ⚠️ Ne borne pas la liste : un écran qui **propose** des mascottes doit utiliser
 * `useVisitMascotRegistry` et passer `offeredIds`, sinon il repart du catalogue livré complet.
 *
 * @param {{ enabled?: boolean }} [params]
 * @returns {Array<object>} entrées catalogue dérivées des packs
 */
export default function useVisitMascotCatalogExtras({ enabled = true } = {}) {
  return useVisitMascotRegistry({ enabled }).extras;
}
