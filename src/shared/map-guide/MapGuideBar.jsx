import { mapPlaceDisplayParts } from './mapGuidePlace.js';

/** Hauteur approximative de la barre (px scène) pour recadrer la carte au-dessus d'elle. */
export const MAP_GUIDE_BAR_FOCUS_INSET_PX = 96;

/**
 * Barre de guidage vers un lieu (« Y aller »), partagée Plan / Visite.
 *
 * Elle existe parce que le guidage était **enfermé dans la fiche du lieu** : la direction et
 * la distance ne s'affichaient que dans une feuille couvrant la moitié de l'écran — donc le
 * point bleu était caché au moment précis où l'on marche vers le lieu — et fermer la fiche
 * **arrêtait** le guidage, sans le dire (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md` B4 et
 * B5). Ici, le guidage vit en dehors de la fiche : une seule ligne en bas de l'écran, la carte
 * entière au-dessus, et il ne s'arrête que sur « Arrêter ».
 *
 * Ce n'est toujours pas un itinéraire : c'est une direction à vol d'oiseau et une distance.
 *
 * Dual-class `map-*` / `plan-*` : le Plan n'importe pas `index.css` (même convention que
 * `MapRouteBar`).
 *
 * @param {object} props
 * @param {object|null} props.place lieu visé (`null` = rien n'est rendu).
 * @param {string} [props.distanceLabel] distance déjà mise en forme (`formatDistanceFr`).
 * @param {boolean} [props.positionActive] la position est acquise.
 * @param {boolean} [props.canLocate] la carte est calée et le navigateur sait localiser.
 * @param {() => void} props.onStop
 * @param {() => void} [props.onOpenPlace] rouvrir la fiche du lieu visé.
 * @param {() => void} [props.onLocate] activer « Me situer » depuis la barre.
 * @param {(place: object) => { emoji: string, name: string }} [props.displayParts]
 * @param {string} [props.unavailableHint] phrase affichée quand la localisation est impossible.
 * @param {string} [props.testId]
 */
export function MapGuideBar({
  place,
  distanceLabel = '',
  positionActive = false,
  canLocate = false,
  onStop,
  onOpenPlace = null,
  onLocate = null,
  displayParts = mapPlaceDisplayParts,
  unavailableHint = 'Le lieu est mis en avant sur le plan ; la localisation n’est pas disponible ici.',
  testId = 'map-guide-bar',
}) {
  if (!place) return null;
  const { emoji, name } = displayParts(place);
  return (
    <aside
      className="map-guide-bar plan-guide-bar"
      data-testid={testId}
      aria-label={`Guidage vers ${name}`}
    >
      <div className="map-guide-bar__row plan-guide-bar__row">
        <button
          type="button"
          className="map-guide-bar__target plan-guide-bar__target"
          onClick={onOpenPlace || undefined}
          disabled={!onOpenPlace}
        >
          <span className="map-guide-bar__emoji plan-guide-bar__emoji" aria-hidden>
            {emoji}
          </span>
          <span className="map-guide-bar__texts plan-guide-bar__texts">
            <span className="map-guide-bar__name plan-guide-bar__name">{name}</span>
            <span className="map-guide-bar__distance plan-guide-bar__distance" aria-live="polite">
              {distanceLabel
                ? `à ${distanceLabel} à vol d’oiseau`
                : 'direction en attente de votre position'}
            </span>
          </span>
        </button>
        <button type="button" className="map-guide-bar__stop plan-guide-bar__stop" onClick={onStop}>
          Arrêter
        </button>
      </div>
      {!positionActive ? (
        <p className="map-guide-bar__hint plan-guide-bar__hint">
          {canLocate ? (
            <>
              Activez{' '}
              <button
                type="button"
                className="map-guide-bar__locate plan-guide-bar__locate"
                onClick={onLocate || undefined}
              >
                Me situer
              </button>{' '}
              pour voir la direction depuis l’endroit où vous êtes.
            </>
          ) : (
            unavailableHint
          )}
        </p>
      ) : null}
    </aside>
  );
}
