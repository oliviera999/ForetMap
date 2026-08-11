import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';

/** Millisecondes entre deux caractères révélés. */
const DEFAULT_CHAR_DELAY = 18;

function normalizeText(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

/**
 * Bulle de dialogue partagée ForetMap + GL : cadre, étiquette de locuteur et
 * effet machine à écrire. Composant de présentation pur — il ne connaît ni le
 * portrait de la mascotte, ni la mise en page de l'hôte, ni la navigation.
 *
 * Voir `docs/MASCOT_NARRATEUR_OLU.md` §4.6 (mise en scène) et §9.1 (accessibilité).
 *
 * **Accessibilité.** Le texte n'est jamais révélé lettre par lettre pour les
 * technologies d'assistance : le texte *complet* est présent dans le DOM dès le
 * premier rendu, seule la portion non encore atteinte est rendue invisible en CSS
 * (`opacity: 0`, donc toujours dans l'arbre d'accessibilité). La bulle n'est
 * délibérément **pas** une région `aria-live` : un lecteur d'écran la relirait à
 * chaque caractère.
 *
 * **Mouvement réduit.** Sous `prefers-reduced-motion: reduce`, l'affichage est
 * immédiat : aucune animation, aucun curseur.
 *
 * La réf expose `{ revealAll(), isTyping() }` pour que l'hôte puisse câbler
 * « la première validation termine le texte, la seconde avance ».
 *
 * @param {object} props
 * @param {string} props.text          Texte à afficher.
 * @param {string} [props.speakerName] Étiquette de locuteur (ex. « OLU »). Vide = pas d'étiquette.
 * @param {boolean} [props.typewriter] Effet machine à écrire (défaut : vrai).
 * @param {number} [props.charDelay]   Millisecondes par caractère.
 * @param {string} [props.className]   Classes additionnelles sur la racine.
 */
export const SpeechBubble = forwardRef(function SpeechBubble(
  { text, speakerName = '', typewriter = true, charDelay = DEFAULT_CHAR_DELAY, className = '' },
  ref,
) {
  const reducedMotion = usePrefersReducedMotion();
  const content = normalizeText(text);
  const animate = Boolean(typewriter) && !reducedMotion && content.length > 0;

  const [shownCount, setShownCount] = useState(() => (animate ? 0 : content.length));
  const timerRef = useRef(0);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = 0;
    }
  }, []);

  useEffect(() => {
    stopTimer();
    if (!animate) {
      setShownCount(content.length);
      return undefined;
    }
    setShownCount(0);
    const delay = Number(charDelay) > 0 ? Number(charDelay) : DEFAULT_CHAR_DELAY;
    let count = 0;
    timerRef.current = setInterval(() => {
      count += 1;
      setShownCount(count);
      if (count >= content.length) stopTimer();
    }, delay);
    return stopTimer;
  }, [content, animate, charDelay, stopTimer]);

  const isTyping = animate && shownCount < content.length;

  const revealAll = useCallback(() => {
    stopTimer();
    setShownCount(content.length);
  }, [content.length, stopTimer]);

  useImperativeHandle(ref, () => ({ revealAll, isTyping: () => isTyping }), [revealAll, isTyping]);

  const classes = ['fm-speech-bubble', isTyping ? 'is-typing' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      data-speech-bubble=""
      data-typing={isTyping ? 'true' : 'false'}
      onClick={isTyping ? revealAll : undefined}
    >
      {speakerName ? (
        <span className="fm-speech-bubble__speaker" data-speech-bubble-speaker="">
          {speakerName}
        </span>
      ) : null}
      <p className="fm-speech-bubble__text">
        <span className="fm-speech-bubble__revealed">{content.slice(0, shownCount)}</span>
        {isTyping ? (
          <>
            <span className="fm-speech-bubble__caret" aria-hidden="true" />
            {/* Non masqué aux lecteurs d'écran : le texte complet doit être lisible d'un coup. */}
            <span className="fm-speech-bubble__pending">{content.slice(shownCount)}</span>
          </>
        ) : null}
      </p>
    </div>
  );
});
