import { useEffect, useState } from 'react';

import { api } from '../services/api';

/**
 * Groupes proposables dans un réglage d'audience (classe, club, équipe) — migration 262.
 *
 * `GET /api/groups/options` est déjà **borné au périmètre de celui qui édite**
 * (`lib/groupScope.js`) : un prof de classe ne peut donc restreindre un lieu qu'aux groupes
 * qu'il voit lui-même, un administrateur à tous. Aucun filtrage supplémentaire ici.
 *
 * L'échec est volontairement silencieux et retombe sur une liste vide : l'éditeur d'audience
 * masque alors le bloc « groupes » et continue de fonctionner sur les rôles seuls. Un réglage
 * de confidentialité ne doit pas devenir inaccessible parce qu'une liste annexe n'a pas
 * chargé — et le serveur refiltre de toute façon.
 *
 * @param {boolean} enabled ne charge que pour un compte qui édite réellement des lieux.
 * @returns {Array<{ id: string, name: string, slug: string, kind: string }>}
 */
export function useAudienceGroupOptions(enabled = true) {
  const [groupOptions, setGroupOptions] = useState([]);

  useEffect(() => {
    if (!enabled) {
      setGroupOptions([]);
      return undefined;
    }
    let cancelled = false;
    api('/api/groups/options')
      .then((payload) => {
        if (cancelled) return;
        setGroupOptions(Array.isArray(payload?.groups) ? payload.groups : []);
      })
      .catch(() => {
        if (!cancelled) setGroupOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return groupOptions;
}
