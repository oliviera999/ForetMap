import { useCallback, useEffect, useRef, useState } from 'react';

let nonceSeq = 0;

/**
 * Demande de navigation « à usage unique » (ouvrir une tâche, un lieu, un sujet…) :
 * `issue(payload)` pose la demande avec un nonce neuf, la vue cible la traite puis
 * appelle `consume(nonce)`. Une demande non consommée après `timeoutMs` (élément
 * introuvable, droits insuffisants) est abandonnée et `onExpire(request)` est appelé.
 *
 * La consommation explicite évite qu'un remontage de la vue (changement d'onglet)
 * rejoue une demande déjà servie.
 */
export function useConsumableRequest({ timeoutMs = 6000, onExpire = null } = {}) {
  const [request, setRequest] = useState(null);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const issue = useCallback((payload) => {
    nonceSeq += 1;
    setRequest({ ...(payload || {}), nonce: `${Date.now()}-${nonceSeq}` });
  }, []);

  const consume = useCallback((nonce) => {
    setRequest((prev) => (prev && (nonce == null || prev.nonce === nonce) ? null : prev));
  }, []);

  useEffect(() => {
    if (!request || !(timeoutMs > 0)) return undefined;
    const id = setTimeout(() => {
      setRequest((prev) => (prev?.nonce === request.nonce ? null : prev));
      onExpireRef.current?.(request);
    }, timeoutMs);
    return () => clearTimeout(id);
  }, [request, timeoutMs]);

  return [request, issue, consume];
}
