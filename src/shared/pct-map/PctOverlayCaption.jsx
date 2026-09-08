/**
 * Légende d'un lieu sur une carte « % image » : emoji + nom, même habillage pour une
 * zone (`PctLabelsLayer`) et un repère (`PctMarkerButton`). Le parent décide du
 * placement (colonne centrée, ou nom sous l'épingle) ; ici on ne dessine que les glyphes.
 *
 * @param {object} props
 * @param {string} [props.emoji]
 * @param {string} [props.name]
 * @param {string} [props.emojiClassName] alias produit (ex. `fm-pct-label__emoji`).
 * @param {string} [props.nameClassName] alias produit (ex. `fm-pct-marker__label`).
 */
export function PctOverlayCaption({
  emoji = '',
  name = '',
  emojiClassName = '',
  nameClassName = '',
}) {
  const pin = String(emoji || '').trim();
  const text = String(name || '').trim();
  return (
    <>
      {pin ? (
        <span
          className={['fm-pct-overlay__emoji', 'map-overlay-emoji-label', emojiClassName]
            .filter(Boolean)
            .join(' ')}
          aria-hidden
        >
          {pin}
        </span>
      ) : null}
      {text ? (
        <span
          className={[
            'fm-pct-overlay__name',
            'map-overlay-name-label',
            'map-overlay-name-label--html',
            nameClassName,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {text}
        </span>
      ) : null}
    </>
  );
}
