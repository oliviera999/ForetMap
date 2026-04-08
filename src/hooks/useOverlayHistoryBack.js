import { useEffect, useRef } from 'react';
import { pushOverlayClose, removeOverlayClose } from '../utils/overlayHistory';

/**
 * Associe isOpen à une entrée history : le retour navigateur appelle onRequestClose
 * au lieu de quitter la page / l’étape précédente.
 */
function useOverlayHistoryBack(isOpen, onRequestClose) {
  const onRequestCloseRef = useRef(onRequestClose);
  onRequestCloseRef.current = onRequestClose;

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeFn = () => {
      onRequestCloseRef.current?.();
    };
    pushOverlayClose(closeFn);
    return () => {
      removeOverlayClose(closeFn);
    };
  }, [isOpen]);
}

export { useOverlayHistoryBack };
