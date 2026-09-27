import { MarkdownContent } from '../MarkdownContent.jsx';
import { GlossaryMarkdown } from '../GlossaryMarkdown.jsx';
import { useGlossaryLinkIndex } from '../../hooks/useGlossaryLinkIndex.js';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { normalizedPlantValue } from '../../utils/plantFormValues.js';
import { IconClock, IconSearch, IconWarning } from '../../shared/icons.jsx';

/**
 * Section « Détermination » d'une fiche espèce — aide à une identification rigoureuse.
 *
 * Repliable comme les autres sections de la fiche (`details.plant-more`), placée haut dans
 * la carte : devant l'être vivant, on cherche d'abord à savoir ce que c'est. Le réglage de
 * site `ui.biodiv.determination_always_open` la déplie d'office, sans toucher au code.
 *
 * Les trois champs sont neutres vis-à-vis du règne (cf. `PLANT_DETERMINATION_FIELDS`) : le
 * catalogue mêle végétaux, animaux, champignons, micro-organismes et fiches-ressources.
 *
 * Les confusions sortent de la grille et s'affichent en encadré d'alerte : la forêt est
 * comestible et les élèves récoltent, une ressemblance avec une espèce toxique ne doit pas
 * se lire comme une ligne de métadonnée parmi d'autres.
 *
 * Rien n'est rendu tant qu'aucun des trois champs n'est renseigné — une section vide sur
 * toutes les fiches du catalogue serait du bruit.
 */
export function PlantDeterminationSection({
  plant,
  onOpenGlossaryTerm = undefined,
  /** Ouvre la fiche d'un sosie (lien « Ne pas confondre avec… »). */
  onOpenPlant = null,
  /** Force l'état d'ouverture (tests, aperçu) ; sinon réglage de site puis replié. */
  defaultOpen = undefined,
}) {
  const publicSettings = usePublicSettings();
  const criteria = normalizedPlantValue(plant?.identification_criteria);
  const lookalikes = normalizedPlantValue(plant?.lookalike_species);
  const period = normalizedPlantValue(plant?.identification_period);
  // Sosies du catalogue (migration 305) : la paire vaut dans les deux sens.
  const sosies = Array.isArray(plant?.lookalikes)
    ? plant.lookalikes.filter((l) => l && l.plant_id != null && l.name)
    : [];
  const hasContent = Boolean(criteria || lookalikes || period || sosies.length);
  const autolinkEnabled = typeof onOpenGlossaryTerm === 'function' && hasContent;
  // Hooks avant tout retour anticipé : l'ordre des hooks doit rester stable entre deux rendus.
  const glossaryItems = useGlossaryLinkIndex({ enabled: autolinkEnabled });
  if (!hasContent) return null;

  const Text = autolinkEnabled ? GlossaryMarkdown : MarkdownContent;
  const textProps = autolinkEnabled ? { glossaryItems, onOpenGlossaryTerm } : {};
  const open =
    typeof defaultOpen === 'boolean'
      ? defaultOpen
      : Boolean(publicSettings?.biodiv?.determination_always_open);

  return (
    <details className="plant-more plant-determination" open={open}>
      <summary>
        <span className="plant-determination__summary">
          <IconSearch size={13} /> Détermination
        </span>
      </summary>
      <div className="plant-meta-grid">
        {criteria ? (
          <div className="plant-meta-item">
            <div className="plant-meta-label">Critères de détermination</div>
            <Text className="plant-meta-value" {...textProps}>
              {criteria}
            </Text>
          </div>
        ) : null}
        {sosies.length > 0 ? (
          <div className="plant-determination__alert" role="note">
            <div className="plant-determination__alert-label">
              <IconWarning size={13} /> Sosies
            </div>
            <ul className="plant-determination__lookalikes" style={{ margin: 0, paddingLeft: 18 }}>
              {sosies.map((sosie) => {
                const label = `${sosie.emoji ? `${sosie.emoji} ` : ''}${sosie.name}`;
                return (
                  <li key={sosie.plant_id}>
                    Ne pas confondre avec{' '}
                    {typeof onOpenPlant === 'function' ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ minHeight: 44 }}
                        onClick={() => onOpenPlant(sosie.plant_id)}
                        aria-label={`Ouvrir la fiche ${sosie.name}`}
                      >
                        {label}
                      </button>
                    ) : (
                      <strong>{label}</strong>
                    )}
                    {sosie.note ? <span> — {sosie.note}</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {lookalikes ? (
          <div className="plant-determination__alert" role="note">
            <div className="plant-determination__alert-label">
              <IconWarning size={13} /> Confusions possibles
            </div>
            <Text className="plant-determination__alert-text" {...textProps}>
              {lookalikes}
            </Text>
          </div>
        ) : null}
        {period ? (
          <div className="plant-meta-item">
            <div className="plant-meta-label">
              <IconClock size={12} /> Quand l’observer
            </div>
            <Text className="plant-meta-value" {...textProps}>
              {period}
            </Text>
          </div>
        ) : null}
      </div>
    </details>
  );
}
