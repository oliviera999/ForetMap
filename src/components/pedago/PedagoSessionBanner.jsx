import { useEffect, useRef, useState } from 'react';

import { Button } from '../../shared/ui/Button.jsx';
import { PEDAGO_STEP_ACTION } from '../../shared/enums/pedagoStepActions.js';
import { usePedagoSessionContext } from '../../contexts/PedagoSessionContext.jsx';
import { TutorialPreviewModal } from '../TutorialPreviewModal.jsx';

/** Variable posée sur `<html>` : hauteur du bandeau seule. */
export const SESSION_BANNER_HEIGHT_VAR = '--fm-session-banner-h';

/**
 * Variable posée sur `<html>` : **emprise** du bandeau depuis le bas de l'écran, soit sa
 * hauteur plus le décalage qui le pose au-dessus de la barre basse élève
 * (`--fm-session-banner-lift`, `pedago-sessions.css`). C'est elle que réservent les surfaces
 * qui couvrent toute la fenêtre (`.modal-overlay`, feuille basse, plein écran carte) et le
 * contenu de la page sur téléphone : elles passent par-dessus la barre basse, pas le bandeau.
 */
export const SESSION_BANNER_RESERVE_VAR = '--fm-session-banner-reserve';

/**
 * Publie la hauteur réelle du bandeau dans `--fm-session-banner-h` et son emprise dans
 * `--fm-session-banner-reserve` tant qu'il est affiché : le contenu de la page (`.main`), les
 * fenêtres (`.modal-overlay`), la feuille « Plus », le plein écran carte, les commandes
 * flottantes et les toasts réservent cet espace en bas, si bien que rien d'utile ne passe
 * sous le bandeau.
 */
function useBannerHeightVar(ref) {
  useEffect(() => {
    const el = ref.current;
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    if (!el || !root) return undefined;
    const publish = () => {
      const h = Math.ceil(el.offsetHeight || 0);
      root.style.setProperty(SESSION_BANNER_HEIGHT_VAR, `${h}px`);
      // Le décalage se résout en CSS : il suit l'apparition / disparition de la barre basse.
      root.style.setProperty(
        SESSION_BANNER_RESERVE_VAR,
        `calc(${h}px + var(--fm-session-banner-lift, 0px))`,
      );
    };
    publish();
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(publish);
      observer.observe(el);
    }
    return () => {
      observer?.disconnect();
      root.style.removeProperty(SESSION_BANNER_HEIGHT_VAR);
      root.style.removeProperty(SESSION_BANNER_RESERVE_VAR);
    };
  }, [ref]);
}

/**
 * Bandeau de séance active : titre · « Étape n sur N » · Précédent / Suivant / Quitter.
 *
 * Fixé en bas de l'écran, au-dessus de la barre de navigation basse **et** des fenêtres que
 * l'étape ouvre (fiche plante, réseau…) : palier `--fm-z-session-banner` de `z-layers.css`.
 * Avant le lot 5, il était collant en haut de `#app` : hors écran dès que la page défilait
 * (étape « message »), recouvert par la fiche ouverte (étape « fiche »).
 *
 * « Quitter » demande confirmation et rappelle que la séance se reprend à la même étape.
 *
 * Étape « tutoriel » (`open_tutorial`) : le bandeau rend lui-même l'aperçu du tutoriel, lu
 * dans le contexte de séance (`sessionTutorial`), sans passer par le shell. Une fois fermé,
 * le bouton « Tutoriel » le rouvre.
 */
export function PedagoSessionBanner({
  sessionTitle,
  step,
  stepIndex,
  stepCount,
  onPrev,
  onNext,
  onExit,
  onShowMessage,
}) {
  const ref = useRef(null);
  const [confirmExit, setConfirmExit] = useState(false);
  useBannerHeightVar(ref);
  // Hors fournisseur (tests de rendu isolés) : pas d'aperçu de tutoriel.
  const sessionCtx = usePedagoSessionContext();
  const sessionTutorial = sessionCtx?.sessionTutorial || null;
  const [tutorialHidden, setTutorialHidden] = useState(false);
  const tutorialId = sessionTutorial?.tutorial?.id ?? null;

  // Nouveau tutoriel (ou nouvelle étape) : l'aperçu se rouvre.
  useEffect(() => {
    setTutorialHidden(false);
  }, [tutorialId, stepIndex]);

  // Changer d'étape referme une confirmation restée ouverte.
  useEffect(() => {
    setConfirmExit(false);
  }, [stepIndex]);

  if (!step) return null;
  const isMessage = step.action?.type === PEDAGO_STEP_ACTION.MESSAGE;
  const isTutorial = step.action?.type === PEDAGO_STEP_ACTION.OPEN_TUTORIAL;
  const showTutorial = isTutorial && sessionTutorial?.tutorial && !tutorialHidden;
  const isLast = stepIndex >= stepCount - 1;
  const stepNumber = stepIndex + 1;
  const progressPct = stepCount > 0 ? Math.round((stepNumber / stepCount) * 100) : 0;

  return (
    <>
      {showTutorial ? (
        <TutorialPreviewModal
          tutorial={sessionTutorial.tutorial}
          onClose={() => setTutorialHidden(true)}
          readAcknowledge={
            sessionTutorial.canAcknowledge
              ? {
                  isRead: !!sessionTutorial.isRead,
                  onAcknowledged: sessionCtx.markSessionTutorialRead,
                }
              : null
          }
        />
      ) : null}
      <aside
        ref={ref}
        className="pedago-session-banner"
        data-testid="pedago-session-banner"
        aria-label={`Séance ${sessionTitle}`}
      >
        <div className="pedago-session-banner__text">
          <p className="pedago-session-banner__session">
            <span className="pedago-session-banner__session-title">{sessionTitle}</span>
            <span className="pedago-session-banner__num" data-testid="pedago-session-progress">
              Étape {stepNumber} sur {stepCount}
            </span>
          </p>
          <div
            className="pedago-session-banner__bar"
            role="progressbar"
            aria-label="Progression de la séance"
            aria-valuemin={1}
            aria-valuemax={stepCount}
            aria-valuenow={stepNumber}
            aria-valuetext={`Étape ${stepNumber} sur ${stepCount}`}
          >
            <span
              className="pedago-session-banner__bar-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <h2 className="pedago-session-banner__step">{step.title}</h2>
          {!isMessage && step.body ? (
            <p className="pedago-session-banner__hint">{step.body}</p>
          ) : null}
        </div>
        {confirmExit ? (
          <div
            className="pedago-session-banner__confirm"
            role="group"
            aria-label="Quitter la séance ?"
            data-testid="pedago-session-exit-confirm"
          >
            <p className="pedago-session-banner__confirm-text">
              Quitter la séance ? Tu pourras la reprendre à l’étape {stepNumber} depuis l’onglet
              Séances.
            </p>
            <div className="pedago-session-banner__actions">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="pedago-session-banner__btn pedago-session-banner__btn--light"
                onClick={() => setConfirmExit(false)}
              >
                Continuer
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="pedago-session-banner__btn pedago-session-banner__btn--main"
                onClick={onExit}
              >
                Oui, quitter
              </Button>
            </div>
          </div>
        ) : (
          <div className="pedago-session-banner__actions">
            {isTutorial && sessionTutorial?.tutorial && tutorialHidden ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="pedago-session-banner__btn pedago-session-banner__btn--light"
                onClick={() => setTutorialHidden(false)}
              >
                Tutoriel
              </Button>
            ) : null}
            {isMessage && onShowMessage ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="pedago-session-banner__btn pedago-session-banner__btn--light"
                onClick={onShowMessage}
              >
                Lire
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="pedago-session-banner__btn pedago-session-banner__btn--light"
              onClick={onPrev}
              disabled={stepIndex <= 0}
            >
              Précédent
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="pedago-session-banner__btn pedago-session-banner__btn--main"
              onClick={onNext}
            >
              {isLast ? 'Terminer' : 'Suivant'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="pedago-session-banner__btn pedago-session-banner__btn--light"
              onClick={() => setConfirmExit(true)}
            >
              Quitter
            </Button>
          </div>
        )}
      </aside>
    </>
  );
}
