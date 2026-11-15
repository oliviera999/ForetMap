import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

/** Délai avant l'envoi d'un geste : l'écran répond tout de suite, le Wi-Fi de la classe suit. */
export const TRAME_SAVE_DELAY_MS = 350;

/**
 * Un défi de la Trame côté écran (« Tenir à deux », lot 3) : création ou reprise, état local
 * immédiat, **sauvegarde stricte** différée (révision attendue ; sur 409 `edit_conflict` le défi
 * est rechargé : l'élève reprend où le serveur en est), indice suivant.
 *
 * Les solutions ne sont jamais ici : le classement des flèches et les vérifications reviennent
 * du serveur avec chaque enregistrement.
 *
 * @param {object} p
 * @param {number} p.gameId
 * @param {{ type: string, unite: string, teamId?: number|null }|null} p.cible défi à ouvrir
 * @param {(reussite: object) => void} [p.onReussi]
 */
export function useGlTrameDefi({ gameId, cible, onReussi = null }) {
  const [defi, setDefi] = useState(null);
  const [etat, setEtat] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reussite, setReussite] = useState(null);
  const [indice, setIndice] = useState(null);
  const revisionRef = useRef(0);
  const enAttenteRef = useRef(null);
  const timerRef = useRef(null);
  const envoiRef = useRef(Promise.resolve());
  const onReussiRef = useRef(onReussi);
  onReussiRef.current = onReussi;

  const recevoir = useCallback((d) => {
    revisionRef.current = Number(d?.revision) || 0;
    setDefi(d);
  }, []);

  const type = cible?.type || null;
  const unite = cible?.unite || null;
  const teamId = cible?.teamId ?? null;
  useEffect(() => {
    if (!gameId || !type || !unite) return undefined;
    let annule = false;
    setDefi(null);
    setEtat(null);
    setReussite(null);
    setIndice(null);
    setError('');
    setBusy(true);
    apiGL(`/api/gl/games/${gameId}/defis`, 'POST', {
      type,
      unite,
      ...(teamId ? { teamId } : {}),
    })
      .then((data) => {
        if (!annule) recevoir(data.defi);
      })
      .catch((err) => {
        if (!annule) setError(err.message || 'Défi indisponible');
      })
      .finally(() => {
        if (!annule) setBusy(false);
      });
    return () => {
      annule = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gameId, type, unite, teamId, recevoir]);

  const envoyer = useCallback(() => {
    timerRef.current = null;
    const aEnvoyer = enAttenteRef.current;
    if (!aEnvoyer || !defi?.id) return envoiRef.current;
    enAttenteRef.current = null;
    // Un seul enregistrement à la fois : chacun part avec la révision rendue par le précédent.
    envoiRef.current = envoiRef.current.then(async () => {
      try {
        const data = await apiGL(`/api/gl/games/${gameId}/defis/${defi.id}`, 'PUT', {
          revision: revisionRef.current,
          etat: aEnvoyer,
        });
        recevoir(data.defi);
        if (!enAttenteRef.current) setEtat(null);
        if (data.reussite) {
          setReussite(data.reussite);
          onReussiRef.current?.(data.reussite);
        }
        setError('');
      } catch (err) {
        if (err?.status === 409 && (err?.body?.code || err?.code) === 'edit_conflict') {
          // Un autre appareil a enregistré : on repart de l'état du serveur.
          enAttenteRef.current = null;
          setEtat(null);
          try {
            const data = await apiGL(`/api/gl/games/${gameId}/defis/${defi.id}`);
            recevoir(data.defi);
          } catch (_) {
            /* le prochain geste rechargera */
          }
          setError('Ce défi a été modifié sur un autre appareil : il est rechargé.');
        } else {
          setError(err.message || 'Enregistrement impossible, réessaie.');
        }
      }
    });
    return envoiRef.current;
  }, [defi?.id, gameId, recevoir]);

  /** Applique un geste : l'écran change tout de suite, l'envoi part après un court délai. */
  const enregistrer = useCallback(
    (prochain, { toutDeSuite = false } = {}) => {
      enAttenteRef.current = prochain;
      setEtat(prochain);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (toutDeSuite) return envoyer();
      timerRef.current = setTimeout(envoyer, TRAME_SAVE_DELAY_MS);
      return null;
    },
    [envoyer],
  );

  const demanderIndice = useCallback(async () => {
    if (!defi?.id) return;
    try {
      const data = await apiGL(`/api/gl/games/${gameId}/defis/${defi.id}/indice`, 'POST', {});
      setIndice(data.indice);
    } catch (err) {
      setError(err.message || 'Indice indisponible');
    }
  }, [defi?.id, gameId]);

  return { defi, etat, error, busy, reussite, indice, enregistrer, demanderIndice };
}
