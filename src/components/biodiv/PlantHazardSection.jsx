import { MarkdownContent } from '../MarkdownContent.jsx';
import { GlossaryMarkdown } from '../GlossaryMarkdown.jsx';
import { useGlossaryLinkIndex } from '../../hooks/useGlossaryLinkIndex.js';
import { normalizedPlantValue } from '../../utils/plantFormValues.js';
import {
  HAZARD_EXPOSURE_LABELS,
  HAZARD_EXPOSURE_OPTIONS,
  TOXICITY_LEVEL_LABELS,
} from '../../constants/plantMetaSections.js';
import { IconWarning } from '../../shared/icons.jsx';

/**
 * Encadré « Danger » d'une fiche espèce — ce que l'espèce peut faire à l'élève qui la
 * touche, la cueille ou la porte à la bouche.
 *
 * Contrairement aux autres sections de la fiche, celle-ci n'est **pas repliable** : un
 * avertissement de toxicité derrière un `<details>` fermé n'avertit personne. Elle est
 * rendue en tête de fiche, avant la détermination.
 *
 * Elle ne s'affiche que pour un danger réel (`toxicity_level` renseigné et différent de
 * `aucune`) : « aucun danger connu » est une information utile en édition, pas un encadré
 * rouge sur la moitié du catalogue.
 *
 * `hazard_reviewed` ne conditionne PAS l'affichage — seulement la mention « à valider »
 * qui l'accompagne. Le pré-remplissage de la migration 251 est bibliographique : masquer
 * un avertissement jusqu'à relecture serait le seul choix réellement dangereux des deux.
 */

/** Ordre canonique des voies d'exposition, pour un affichage stable entre deux fiches. */
const EXPOSURE_ORDER = HAZARD_EXPOSURE_OPTIONS.map((entry) => entry.value);

/** Découpe la valeur du SET SQL (`'contact,seve_latex'`) en libellés lisibles. */
export function listHazardExposureLabels(value) {
  const raw = normalizedPlantValue(value);
  if (!raw) return [];
  const found = new Set(
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  return EXPOSURE_ORDER.filter((entry) => found.has(entry)).map(
    (entry) => HAZARD_EXPOSURE_LABELS[entry],
  );
}

export function PlantHazardSection({ plant, onOpenGlossaryTerm = undefined }) {
  const level = normalizedPlantValue(plant?.toxicity_level);
  const notes = normalizedPlantValue(plant?.hazard_notes);
  const exposures = listHazardExposureLabels(plant?.hazard_exposure);
  const isHazard = Boolean(level) && level !== 'aucune';
  const autolinkEnabled = typeof onOpenGlossaryTerm === 'function' && isHazard && Boolean(notes);
  // Hooks avant tout retour anticipé : l'ordre des hooks doit rester stable entre deux rendus.
  const glossaryItems = useGlossaryLinkIndex({ enabled: autolinkEnabled });
  if (!isHazard) return null;

  const Text = autolinkEnabled ? GlossaryMarkdown : MarkdownContent;
  const textProps = autolinkEnabled ? { glossaryItems, onOpenGlossaryTerm } : {};
  // `hazard_reviewed` arrive en 1/0 depuis MySQL, en '1'/'' depuis le formulaire.
  const reviewed = plant?.hazard_reviewed === 1 || plant?.hazard_reviewed === '1';

  return (
    <section
      className={`plant-hazard plant-hazard--${level}`}
      role="note"
      aria-label={`Danger : ${TOXICITY_LEVEL_LABELS[level] || level}`}
    >
      <div className="plant-hazard__head">
        <span className="plant-hazard__label">
          <IconWarning size={14} /> {TOXICITY_LEVEL_LABELS[level] || level}
        </span>
        {reviewed ? null : (
          <span className="plant-hazard__unreviewed" title="Information non encore relue">
            à valider
          </span>
        )}
      </div>
      {exposures.length > 0 ? (
        <ul className="plant-hazard__exposures">
          {exposures.map((label) => (
            <li key={label} className="plant-hazard__exposure">
              {label}
            </li>
          ))}
        </ul>
      ) : null}
      {notes ? (
        <Text className="plant-hazard__notes" {...textProps}>
          {notes}
        </Text>
      ) : null}
    </section>
  );
}
