import { useEffect, useRef, useState } from 'react';
import { acquireGlSocket } from '../realtime/glSocketClient.js';

/** Délai de grâce avant de dire « coupé » : une connexion qui s'ouvre n'est pas une coupure. */
export const TEMPS_REEL_GRACE_MS = 4000;

/**
 * Le temps réel de cet écran est-il coupé ? Vrai quand le socket du jeton reste déconnecté plus
 * de `TEMPS_REEL_GRACE_MS` (Wi-Fi tombé, serveur en redémarrage). L'écran d'équipe s'en sert
 * pour montrer son icône « Relire l'écran » — et seulement alors.
 *
 * Quand la connexion revient après une coupure, `onRetour` est appelé une fois : l'écran se
 * relit, puisqu'il a pu manquer des évènements. Le socket est celui que les autres hooks
 * partagent (`acquireGlSocket`, compteur de références) : rien n'est ouvert en plus.
 *
 * @param {string|null} token jeton de la session (`null` : jamais coupé)
 * @param {{ onRetour?: () => void }} [options]
 * @returns {boolean}
 */
export function useGlTempsReelCoupe(token, { onRetour = null } = {}) {
  const [coupe, setCoupe] = useState(false);
  const onRetourRef = useRef(onRetour);
  onRetourRef.current = onRetour;

  useEffect(() => {
    if (!token) return undefined;
    const { socket, release } = acquireGlSocket(token);
    if (!socket) return undefined;
    let timer = null;
    let etaitCoupe = false;
    const armer = () => {
      if (timer || etaitCoupe) return;
      timer = setTimeout(() => {
        timer = null;
        etaitCoupe = true;
        setCoupe(true);
      }, TEMPS_REEL_GRACE_MS);
    };
    const onConnect = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (etaitCoupe) {
        etaitCoupe = false;
        setCoupe(false);
        onRetourRef.current?.();
      }
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', armer);
    if (!socket.connected) armer();
    return () => {
      if (timer) clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('disconnect', armer);
      setCoupe(false);
      release();
    };
  }, [token]);

  return coupe;
}
