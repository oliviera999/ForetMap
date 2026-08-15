import VisitMascotFallbackSvg from '../../components/VisitMascotFallbackSvg.jsx';
import {
  DEFAULT_MASCOT_EXPRESSION,
  resolveMascotExpression,
  resolveMascotFraming,
} from '../../utils/mascotExpressions.js';

/** Taille de rendu par cadrage, en pixels (§4.4). */
const FRAMING_BOX = Object.freeze({
  face: { width: 44, height: 44 },
  bust: { width: 88, height: 110 },
  body: { width: 128, height: 160 },
});

const DEFAULT_SILHOUETTE = 'olu';

/**
 * Résout la source d'un portrait selon la cascade du §4.2 :
 * cadrage demandé de l'expression → `bust` de l'expression (recadrage CSS)
 * → cadrage demandé de `neutre` → `bust` de `neutre` → aucune (SVG de repli).
 *
 * @returns {{ src: string, framing: string, expression: string } | null}
 */
function resolvePortraitSource(portraits, expression, framing) {
  if (!portraits || typeof portraits !== 'object') return null;
  const candidates = [
    [expression, framing],
    [expression, 'bust'],
    [DEFAULT_MASCOT_EXPRESSION, framing],
    [DEFAULT_MASCOT_EXPRESSION, 'bust'],
  ];
  for (const [key, wanted] of candidates) {
    const src = portraits[key]?.[wanted];
    if (typeof src === 'string' && src) return { src, framing: wanted, expression: key };
  }
  return null;
}

/**
 * Portrait du narrateur (OLU) — **rendu seul**, sans texte ni mise en page.
 *
 * Voir `docs/MASCOT_NARRATEUR_OLU.md` §4.2. Trois règles structurent ce composant :
 *
 * 1. **Décoratif par construction.** `aria-hidden="true"` systématique, `alt=""`.
 *    Le portrait ne porte jamais d'information : le texte reste le contenu.
 * 2. **Jamais d'écran vide.** La cascade se termine toujours par le SVG de repli
 *    (niveau 3, 0 Ko réseau), donc l'absence totale de portraits est un mode de
 *    fonctionnement normal, pas une panne.
 * 3. **Aucun renderer lourd.** Interdiction d'importer `VisitMapMascotRive`,
 *    `VisitMapMascotSpriteCut` ou `VisitMapMascotSpritesheet` (100–170 Ko en
 *    chunks lazy) — verrouillée par un test d'architecture (§15.8).
 *
 * `narrator` est reçu en **prop** et non lu depuis un réglage : le composant est
 * partagé ForetMap + GL, et chaque produit a sa propre configuration (§8.2).
 *
 * @param {object} props
 * @param {object|null} [props.narrator] configuration narrateur (`content.help.narrator` côté FM)
 * @param {string} [props.expression] expression canonique (§4.3) — inconnue ⇒ `neutre`
 * @param {'face'|'bust'|'body'} [props.size] cadrage — inconnu ⇒ `bust`
 * @param {string} [props.className]
 */
export function MascotSpeaker({ narrator = null, expression, size = 'bust', className = '' }) {
  // Interrupteur global (§9.4) : seul un `false` explicite éteint le portrait.
  // Une configuration absente (réglages pas encore chargés, lecture en échec) rend
  // quand même le repli SVG — c'est la règle « jamais d'écran vide ».
  if (narrator && narrator.enabled === false) return null;

  const wantedExpression = resolveMascotExpression(expression);
  const wantedFraming = resolveMascotFraming(size);
  const portrait = resolvePortraitSource(narrator?.portraits, wantedExpression, wantedFraming);
  const box = FRAMING_BOX[wantedFraming] || FRAMING_BOX.bust;
  const silhouette = narrator?.fallbackSilhouette || DEFAULT_SILHOUETTE;

  const classes = ['fm-mascot-speaker', `fm-mascot-speaker--${wantedFraming}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={classes}
      aria-hidden="true"
      data-mascot-speaker={silhouette}
      data-expression={wantedExpression}
      data-framing={wantedFraming}
      data-source={portrait ? 'portrait' : 'svg'}
      style={{ width: box.width, height: box.height }}
    >
      {portrait ? (
        <img
          className="fm-mascot-speaker__img"
          src={portrait.src}
          alt=""
          width={box.width}
          height={box.height}
          loading="lazy"
          decoding="async"
          // `face` servi depuis un `bust` : le recadrage sur la tête est fait en CSS (§4.4).
          data-derived={portrait.framing === wantedFraming ? undefined : portrait.framing}
        />
      ) : (
        <VisitMascotFallbackSvg silhouette={silhouette} variant="forest" />
      )}
    </span>
  );
}

export default MascotSpeaker;
