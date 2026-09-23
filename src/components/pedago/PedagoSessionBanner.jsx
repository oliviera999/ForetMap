import { Button } from '../../shared/ui/Button.jsx';

/**
 * Bandeau de séance active : titre · étape i/n · Précédent / Suivant / Quitter.
 * Reste visible au-dessus des vues existantes (clé, fiche, réseau, quiz…).
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
  if (!step) return null;
  const isMessage = step.action?.type === 'message';
  const isLast = stepIndex >= stepCount - 1;

  return (
    <aside
      className="pedago-session-banner"
      data-testid="pedago-session-banner"
      aria-label={`Séance ${sessionTitle}`}
    >
      <div className="pedago-session-banner__text">
        <p className="pedago-session-banner__session">{sessionTitle}</p>
        <h2 className="pedago-session-banner__step">
          <span className="pedago-session-banner__num" aria-hidden>
            {stepIndex + 1}/{stepCount}
          </span>
          {step.title}
        </h2>
        {!isMessage && step.body ? (
          <p className="pedago-session-banner__hint">{step.body}</p>
        ) : null}
      </div>
      <div className="pedago-session-banner__actions">
        {isMessage && onShowMessage ? (
          <Button type="button" variant="ghost" size="sm" onClick={onShowMessage}>
            Lire
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={onPrev} disabled={stepIndex <= 0}>
          Précédent
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={onNext}>
          {isLast ? 'Terminer' : 'Suivant'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onExit}>
          Quitter
        </Button>
      </div>
    </aside>
  );
}
