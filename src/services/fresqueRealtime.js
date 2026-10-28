import { getForetmapSocket, onForetmapSocket } from './foretmapSocketRegistry.js';

/**
 * Abonnement d'un plateau de fresque au signal `fresque:board:changed` (`{ boardId, revision }`),
 * sur la socket ForetMap courante : `subscribe:fresque-board` à l'abonnement et à chaque
 * (re)connexion, `unsubscribe:fresque-board` au départ. Aucun flux haute fréquence : un seul
 * message par enregistrement, le client recharge ou ouvre le dialogue de conflit.
 *
 * @param {string} boardId
 * @param {(payload: object) => void} onChanged
 * @returns {() => void} désabonnement
 */
export function subscribeFresqueBoard(boardId, onChanged) {
  const id = String(boardId || '').trim();
  if (!id) return () => {};
  let socket = null;
  const onEvent = (payload) => {
    if (!payload || String(payload.boardId) !== id) return;
    onChanged(payload);
  };
  const onRefused = (payload) => {
    if (payload && String(payload.boardId) === id) onChanged({ boardId: id, refused: true });
  };
  const subscribe = () => {
    if (!socket) return;
    socket.emit('subscribe:fresque-board', { boardId: id });
  };
  const detach = () => {
    if (!socket) return;
    try {
      socket.emit('unsubscribe:fresque-board', { boardId: id });
    } catch {
      /* socket fermée */
    }
    socket.off('fresque:board:changed', onEvent);
    socket.off('fresque:board:subscription-refused', onRefused);
    socket.off('connect', subscribe);
    socket = null;
  };
  const attach = (next) => {
    detach();
    socket = next || null;
    if (!socket) return;
    socket.on('fresque:board:changed', onEvent);
    socket.on('fresque:board:subscription-refused', onRefused);
    socket.on('connect', subscribe);
    if (socket.connected) subscribe();
  };
  attach(getForetmapSocket());
  const stop = onForetmapSocket(attach);
  return () => {
    stop();
    detach();
  };
}
