import { useEffect, useState } from 'react';

/**
 * « Carte choisie » : la carte touchée (dans la main ou sur la table) affichée en grand, sous la
 * table, avec ses deux faces. Sur téléphone une carte posée ne mesure que quelques millimètres :
 * ce panneau est l'endroit où on la LIT. L'image est montrée telle quelle (licence CC BY-NC-ND) :
 * les commandes sont sous l'image, jamais dessus.
 *
 * - `origin: 'hand'` : la face montrée est locale (la carte n'est pas encore posée) ; on la pose
 *   en touchant la table, ou sur une place libre.
 * - `origin: 'table'` : la face montrée est celle de la table ; « Retourner » retourne la carte
 *   posée, « Relier à… » part de cette carte.
 */
export function FresqueCardInspector({
  card,
  publicBase,
  origin,
  flipped = false,
  readOnly = false,
  linkActive = false,
  onFlip,
  onOpenLarge,
  onPlaceFree,
  onLink,
  onClose,
}) {
  const [handVerso, setHandVerso] = useState(false);
  useEffect(() => setHandVerso(false), [card?.id]);
  if (!card) return null;

  const verso = origin === 'hand' ? handVerso : flipped;
  const src = `${publicBase}${verso ? card.verso : card.recto}`;
  const alt = (verso ? card.alt?.verso : card.alt?.recto) || card.title;
  const flip = () => (origin === 'hand' ? setHandVerso((v) => !v) : onFlip?.(card.id));

  return (
    <section
      className="fm-fresque-inspector"
      aria-label={`Carte choisie : ${card.title}`}
      data-testid="fm-fresque-inspector"
      data-origin={origin}
    >
      <button
        type="button"
        className="fm-fresque-inspector__image"
        onClick={() => onOpenLarge?.(card, verso ? 1 : 0)}
        aria-label={`${alt} — afficher en plein écran`}
        data-testid="fm-fresque-inspector-image"
      >
        <img src={src} alt="" draggable="false" />
      </button>
      <div className="fm-fresque-inspector__body">
        <p className="fm-fresque-inspector__title">
          <strong>{card.title}</strong>
          <span className="fm-fresque-inspector__face">{verso ? 'Verso' : 'Recto'}</span>
        </p>
        {origin === 'hand' && !readOnly ? (
          <p className="fm-fresque-inspector__hint" data-testid="fm-fresque-inspector-hint">
            Touche la table à l’endroit où tu veux la poser.
          </p>
        ) : null}
        <div className="fm-fresque-inspector__actions">
          <button
            type="button"
            className="fm-fresque-btn"
            onClick={flip}
            disabled={origin === 'table' && readOnly}
            data-testid="fm-fresque-inspector-flip"
          >
            {verso ? 'Voir le recto' : 'Voir le verso'}
          </button>
          {origin === 'hand' && !readOnly ? (
            <button
              type="button"
              className="fm-fresque-btn"
              onClick={() => onPlaceFree?.(card.id)}
              data-testid="fm-fresque-inspector-place"
            >
              Poser sur une place libre
            </button>
          ) : null}
          {origin === 'table' && !readOnly ? (
            <button
              type="button"
              className={`fm-fresque-btn${linkActive ? ' fm-fresque-btn--primary' : ''}`}
              aria-pressed={linkActive ? 'true' : 'false'}
              onClick={() => onLink?.(card.id, { keyboard: true })}
              data-testid="fm-fresque-inspector-link"
            >
              Relier à…
            </button>
          ) : null}
          <button
            type="button"
            className="fm-fresque-btn fm-fresque-btn--ghost"
            onClick={onClose}
            data-testid="fm-fresque-inspector-close"
          >
            Fermer
          </button>
        </div>
      </div>
    </section>
  );
}
