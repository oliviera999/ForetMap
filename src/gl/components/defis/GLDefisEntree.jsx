import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOverlayHistoryBack } from '../../../shared/platform/useOverlayHistoryBack.js';
import { GLButton } from '../ui/GLButton.jsx';

const GLDefisView = lazy(() =>
  import('./GLDefisView.jsx').then((m) => ({ default: m.GLDefisView })),
);

/**
 * Entrée « Défis » (Seuil de l'élève, tablette d'équipe hors tour) : un bouton, puis les défis
 * de la Trame **en plein écran** — le plateau de cartes a besoin de toute la largeur de la
 * tablette. Rien n'est chargé tant que l'élève n'a pas touché le bouton ; « Fermer », Échap ou
 * le retour du navigateur ramènent à l'écran d'où l'on vient.
 *
 * `boutonProps` : attributs en plus sur le bouton (la carte du moment y pose `data-geste`).
 */
export function GLDefisEntree({ gameId, label = 'Défis de la Trame', boutonProps = null }) {
  const [ouvert, setOuvert] = useState(false);
  const fermerRef = useRef(null);
  const boutonRef = useRef(null);
  const fermer = useCallback(() => {
    setOuvert(false);
    // Le focus revient au bouton qui a ouvert la vue.
    boutonRef.current?.focus?.();
  }, []);
  useOverlayHistoryBack(ouvert, fermer);

  useEffect(() => {
    if (!ouvert) return undefined;
    fermerRef.current?.focus?.();
    const onKey = (event) => {
      if (event.key === 'Escape') fermer();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ouvert, fermer]);

  if (!gameId) return null;
  const vue = ouvert ? (
    <div
      className="gl-defis-plein"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid="gl-defis-plein"
    >
      <header className="gl-defis-plein__tete">
        <h2>{label}</h2>
        <GLButton
          ref={fermerRef}
          type="button"
          variant="ghost"
          onClick={fermer}
          data-testid="gl-defis-fermer"
        >
          Fermer
        </GLButton>
      </header>
      <div className="gl-defis-plein__corps">
        <Suspense fallback={<div className="gl-tab-loading" role="status" aria-busy="true" />}>
          <GLDefisView gameId={gameId} />
        </Suspense>
      </div>
    </div>
  ) : null;
  return (
    <div className="gl-defis-entree" data-testid="gl-defis-entree">
      <GLButton
        ref={boutonRef}
        type="button"
        variant="secondary"
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        onClick={() => setOuvert(true)}
        data-testid="gl-defis-entree-bouton"
        {...(boutonProps || {})}
      >
        {label}
      </GLButton>
      {vue && typeof document !== 'undefined' ? createPortal(vue, document.body) : vue}
    </div>
  );
}
