import { HelpDock } from '../../shared/help/HelpDock.jsx';

/**
 * Aide du Plan Lyautey (lot 7) : le **dock d'aide partagé**, celui de G&L et de ForetMap.
 * Le plan n'a qu'un écran, donc une seule entrée d'aide — mais un visiteur qui ouvre le plan
 * pour la première fois doit pouvoir apprendre les trois gestes utiles sans tâtonner.
 *
 * Le contenu est court et fixe : le plan est un produit public sans compte, il ne charge pas
 * de corpus d'aide éditable. La phrase d'accueil réglable par l'établissement
 * (`ui.plan.welcome_hint`) est reprise en tête quand elle existe.
 *
 * @param {object} props
 * @param {string} [props.welcomeHint] phrase d'accueil de l'établissement.
 * @param {boolean} [props.canLocate] la carte est calée pour la localisation (lot 6).
 * @param {() => void} [props.onOpen] compteur d'usage (`help_open`).
 */
export function PlanHelp({ welcomeHint = '', canLocate = false, onOpen = null }) {
  return (
    <HelpDock
      helpKey="plan:home"
      title="Comment utiliser ce plan"
      storagePrefix="plan_help_seen:"
      className="plan-help-dock"
      buttonClassName="plan-help-btn"
      overlayClassName="plan-help-overlay"
      dialogClassName="plan-help-dialog fade-in"
      onOpen={onOpen}
      body={
        <div className="plan-help__body">
          {welcomeHint ? <p className="plan-help__hint">{welcomeHint}</p> : null}
          <ul className="plan-help__list">
            <li>
              <strong>Chercher un lieu</strong> : tapez son nom en haut de l’écran. Les autres noms
              d’un lieu fonctionnent aussi (« bibliothèque » trouve le CDI).
            </li>
            <li>
              <strong>Filtrer</strong> : les étiquettes sous la recherche n’affichent que les lieux
              d’une catégorie. « Tout » remet l’ensemble.
            </li>
            <li>
              <strong>Se déplacer sur le plan</strong> : un doigt pour glisser, deux doigts ou les
              boutons pour zoomer, « Voir tout le plan » pour revenir en arrière.
            </li>
            <li>
              <strong>Les pastilles chiffrées</strong> regroupent des lieux trop proches pour être
              touchés séparément : touchez-les pour zoomer ou voir la liste.
            </li>
            {canLocate ? (
              <li>
                <strong>Me situer</strong> affiche votre position et sa précision. « Y aller » donne
                alors la direction et la distance à vol d’oiseau, pas un itinéraire.
              </li>
            ) : null}
          </ul>
        </div>
      }
    />
  );
}
