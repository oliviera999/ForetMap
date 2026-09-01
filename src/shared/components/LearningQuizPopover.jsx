import { createPortal } from 'react-dom';
import { useDialogA11y } from '../../hooks/useDialogA11y';

/**
 * Popover du contrôle de compréhension — COMMUN aux deux applications.
 *
 * Même interface que `DialogShell` : il s'y substitue par simple injection, sans que le
 * bouton d'accusé partagé ait à connaître l'un ou l'autre.
 *
 * Pourquoi un popover plutôt qu'une modale pleine largeur : la question surgit par-dessus
 * le contenu qu'on vient de lire, sans le masquer entièrement ni donner l'impression d'un
 * examen. Le vocabulaire visuel est celui du popover de glossaire, déjà familier.
 *
 * Les classes gardent le préfixe `fm-` — c'est la convention du dépôt pour une coque
 * partagée (cf. `fm-modal-*`) : Gnomes & Licornes la rehabille par variables CSS dans
 * `gl-theme.css` au lieu de dupliquer le composant.
 *
 * Accessibilité : portail sous `body` (aucun rognage par un parent), `role="dialog"`
 * + `aria-modal`, piège et restauration du focus, fermeture par Échap et par
 * l'arrière-plan — tout cela vient de `useDialogA11y`, comme la modale.
 */
export function LearningQuizPopover({
  open = true,
  onClose,
  overlayClassName = 'fm-quiz-popover',
  dialogClassName = 'fm-quiz-popover__panel animate-pop',
  dialogStyle,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  closeButtonLabel = 'Fermer',
  showCloseButton = true,
  closeButtonClassName = 'fm-quiz-popover__close',
  closeButtonDisabled = false,
  closeOnOverlay = true,
  dialogRef: externalDialogRef = null,
  children,
}) {
  const internalDialogRef = useDialogA11y(() => {
    onClose?.();
  });
  const dialogRef = externalDialogRef || internalDialogRef;

  if (!open || typeof document === 'undefined' || !document.body) return null;

  return createPortal(
    <div
      className={overlayClassName}
      role="presentation"
      onClick={(e) => {
        if (!closeOnOverlay) return;
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className={dialogClassName}
        style={dialogStyle}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Liseré de tête : même repère visuel que le popover de glossaire. */}
        <div className="fm-quiz-popover__strip" aria-hidden="true" />
        {showCloseButton ? (
          <button
            type="button"
            className={closeButtonClassName}
            onClick={onClose}
            aria-label={closeButtonLabel}
            disabled={closeButtonDisabled}
          >
            ✕
          </button>
        ) : null}
        <div className="fm-quiz-popover__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
