import { parsePctPolygonPoints } from '../../shared/pct-map/pctPolygon.js';
import { SharedMapStage } from '../../shared/pct-map/SharedMapStage.jsx';
import { planPlaceFocusPct, splitNameEmoji } from '../utils/planPlaces.js';

/**
 * Carte plein écran du Plan Lyautey : mince enveloppe autour de `SharedMapStage`
 * (comportement et classes CSS inchangés pour AppPlan).
 *
 * @param {object} props
 * @param {{ map_image_url?: string, label?: string }} props.map
 * @param {Array<object>} props.zones
 * @param {Array<object>} props.markers
 * @param {object|null} props.selectedPlace lieu dont la fiche est ouverte (mis en avant, centré).
 * @param {(place: object) => void} props.onSelectPlace
 * @param {(markers: Array<object>) => void} [props.onOpenGroup] tap sur un groupe qui ne se
 *   sépare pas au zoom : le produit montre la liste de ses lieux (feuille basse).
 * @param {Map<string, object>} [props.categoriesById] catalogue des catégories (priorités,
 *   couleur de la pastille de groupe).
 * @param {object|null} [props.position] état de position (`useMapPosition`, lot 6).
 * @param {() => void} [props.onLocateToggle] remplace `position.toggle` (compteur d'usage).
 * @param {{ xp: number, yp: number }|null} [props.targetPct] lieu visé par « Y aller ».
 * @param {{ top?: number, right?: number, bottom?: number, left?: number }|null} [props.focusInsets]
 *   marges scène pour recentrer au-dessus d'une barre basse (parcours).
 * @param {string} [props.attribution] mention de source du fond de plan (`ui.plan.attribution`).
 * @param {string} [props.schoolLogoUrl] logo officiel du lycée (affichage discret sur la carte).
 */
export function PlanMapStage({ attribution = '', schoolLogoUrl = '', ...rest }) {
  return (
    <SharedMapStage
      {...rest}
      splitNameEmoji={splitNameEmoji}
      focusPlacePct={(place) => planPlaceFocusPct(place, parsePctPolygonPoints)}
      chromeSlot={
        schoolLogoUrl || attribution ? (
          <div className="plan-map__school-mark">
            {schoolLogoUrl ? (
              <img
                className="plan-map__school-logo"
                src={schoolLogoUrl}
                alt="Lycée Lyautey"
                width={120}
                height={36}
                decoding="async"
              />
            ) : null}
            {attribution ? <p className="plan-map__attribution">{attribution}</p> : null}
          </div>
        ) : null
      }
    />
  );
}
