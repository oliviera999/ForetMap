import { BottomSheet } from '../../shared/ui/BottomSheet.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { placeDisplayParts } from '../utils/planPlaces.js';
import { PlanLinkedText } from '../utils/planLinkedText.jsx';
import { PlaceSuggestionForm } from './PlaceSuggestionForm.jsx';
import { placeStatusClass, placeStatusLabel } from '../../shared/place-messages/placeStatus.js';

/**
 * Fiche d'un lieu du plan (lot 4), en feuille basse à crans : un aperçu (nom + accroche)
 * qui laisse la carte visible, puis le détail en glissant vers le haut.
 *
 * « Y aller » (lot 6) trace une **ligne droite** entre la position et le lieu, avec la
 * distance : le plan ne connaît pas encore les chemins, et une direction honnête vaut mieux
 * qu'un itinéraire inventé. Le bouton reste désactivé quand la carte n'est pas calée pour la
 * localisation, avec la raison en clair.
 *
 * @param {object} props
 * @param {object|null} props.place lieu sélectionné (`null` = feuille fermée).
 * @param {() => void} props.onClose
 * @param {Array<{ id: string, label: string, emoji: string, color: string }>} props.categories
 * @param {boolean} [props.canLocate] la carte est calée et le navigateur sait localiser.
 * @param {(place: object) => void} [props.onGoTo]
 * @param {boolean} [props.isTarget] ce lieu est déjà visé.
 * @param {string} [props.distanceLabel] distance à vol d'oiseau, déjà mise en forme.
 * @param {string} [props.shareUrl] lien profond du lieu (`?lieu=`).
 * @param {{ label: string, onClick: () => void }|null} [props.secondaryAction] action de retour
 *   contextuelle — en mode parcours, « Revenir à l'étape » (N5 de l'audit navigation).
 * @param {string} [props.editUrl] lien vers la console ForetMap, affiché seulement aux comptes
 *   qui peuvent réellement éditer les lieux (plan des personnels).
 * @param {((body: string) => Promise<void>)|null} [props.onSuggest] envoi d'un message à
 *   l'équipe à propos de ce lieu (plan des personnels, comptes authentifiés).
 * @param {Array<{ id: string, body: string, created_at: string, place_status: string }>}
 *   [props.myReports] ce que **ce lecteur** a déjà signalé sur ce lieu, avec l'état de
 *   traitement. Sans cette liste, signaler revenait à parler dans le vide : la fiche n'affiche
 *   pas les commentaires, et la console refuse le profil `personnel` en lecture.
 * @param {'peek'|'half'|'full'} [props.initialSnap] cran d'ouverture. `peek` sert pendant un
 *   parcours : une fiche à mi-hauteur recouvrait entièrement la barre d'étape, « Quitter »,
 *   « Précédent » et « Suivant » compris
 *   (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md` B3).
 */
/** Défaut d'identité stable : un `[]` littéral en défaut de prop relancerait les memos. */
const EMPTY_REPORTS = Object.freeze([]);

/** Date d'envoi, en clair et sans heure : ce qui compte est « quand », pas « à quelle minute ». */
function formatReportDate(value) {
  const ts = Date.parse(String(value || ''));
  if (!Number.isFinite(ts)) return 'date inconnue';
  return new Date(ts).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  });
}

export function PlanPlaceSheet({
  place,
  onClose,
  categories,
  canLocate = false,
  onGoTo = null,
  isTarget = false,
  distanceLabel = '',
  shareUrl = '',
  secondaryAction = null,
  editUrl = '',
  onSuggest = null,
  myReports = EMPTY_REPORTS,
  initialSnap = 'half',
}) {
  if (!place) return null;
  // Le nom porte presque toujours l'emoji en tête, et la colonne `emoji` le répète : sans
  // séparation, l'en-tête affiche « 🥙 🥙 Cafétéria » (audit B3).
  const { emoji, name } = placeDisplayParts(place);
  const detailsTitle = String(place.visit_details_title || '').trim() || 'Détails';
  const detailsText = String(place.visit_details_text || '').trim();
  const shortDescription = String(place.visit_short_description || '').trim();
  const description = String(place.description || place.note || '').trim();
  const photo = place.map_lead_photo;
  /**
   * Complément réservé (`restricted_note`) : il n'arrive dans la charge que si le serveur a
   * jugé que ce lecteur-ci y a droit (`lib/locationAudience.js`). Le front n'a donc aucun
   * filtrage à refaire — seulement à le distinguer nettement du texte public, pour que
   * personne ne lise une consigne interne en croyant lire la fiche du plan public.
   */
  const restrictedNote = String(place.restricted_note || '').trim();
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={
        <span className="plan-place__heading">
          <span className="plan-place__emoji" aria-hidden>
            {emoji}
          </span>
          {name}
        </span>
      }
      ariaLabel={name}
      snapPoints={['peek', 'half', 'full']}
      // Au cran bas, l'en-tête et le pied ne laissaient que 12 px de contenu visible pour
      // 745 px de texte : on ouvrait la fiche sans rien pouvoir y lire
      // (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N4).
      initialSnap={initialSnap}
      // Feuille non bloquante : la carte reste manipulable derrière (N2).
      blockBackground={false}
      className="plan-sheet plan-place-sheet"
      testId="plan-place-sheet"
      closeLabel="Fermer la fiche du lieu"
      wideAsDialog
      footer={
        <div className="plan-place__actions">
          {secondaryAction ? (
            <Button
              variant="secondary"
              block
              className="plan-place__back"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          ) : null}
          <Button
            variant="primary"
            block
            disabled={!canLocate}
            title={
              canLocate
                ? 'Afficher la direction et la distance depuis votre position'
                : 'Ce plan n’est pas calé pour la localisation'
            }
            className="plan-place__go"
            onClick={() => onGoTo?.(place)}
          >
            {isTarget ? 'Revoir la direction' : 'Y aller'}
          </Button>
          <p className="plan-place__go-hint">
            {!canLocate
              ? 'Plan non calé : position indisponible.'
              : isTarget && distanceLabel
                ? `À ${distanceLabel} à vol d’oiseau. La fiche se referme : le guidage reste en bas.`
                : 'Direction à vol d’oiseau, pas un itinéraire. La fiche se referme.'}
          </p>
        </div>
      }
    >
      {place.visit_subtitle ? <p className="plan-place__subtitle">{place.visit_subtitle}</p> : null}
      {categories.length > 0 ? (
        <ul className="plan-place__categories">
          {categories.map((category) => (
            <li key={category.id} className="plan-place__category">
              {category.emoji ? <span aria-hidden>{category.emoji}</span> : null} {category.label}
            </li>
          ))}
        </ul>
      ) : null}
      {photo?.image_url ? (
        <img
          className="plan-place__photo"
          src={photo.thumb_url || photo.image_url}
          alt={photo.caption || `Photo de ${name}`}
          loading="lazy"
        />
      ) : null}
      {shortDescription ? (
        <PlanLinkedText className="plan-place__lead" text={shortDescription} />
      ) : null}
      {detailsText ? (
        <section className="plan-place__details">
          <h3 className="plan-place__details-title">{detailsTitle}</h3>
          <PlanLinkedText className="plan-place__details-text" text={detailsText} />
        </section>
      ) : null}
      {!shortDescription && !detailsText && description ? (
        <PlanLinkedText className="plan-place__lead" text={description} />
      ) : null}
      {Array.isArray(place.links) && place.links.length ? (
        <section className="plan-place__links">
          <h3 className="plan-place__links-title">Liens</h3>
          <ul className="plan-place__links-list">
            {place.links
              .filter((link) => link && link.url && link.label)
              .map((link) => (
                <li key={link.id ?? `${link.label}-${link.url}`}>
                  <a
                    className="plan-place__link"
                    href={link.url}
                    {...(link.is_external
                      ? {
                          target: '_blank',
                          rel: 'noopener noreferrer',
                          'aria-label': `${link.label} (ouvre un nouvel onglet)`,
                        }
                      : {})}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
      {place.search_aliases?.length ? (
        <p className="plan-place__aliases">Aussi appelé : {place.search_aliases.join(', ')}</p>
      ) : null}
      {restrictedNote ? (
        <section className="plan-place__restricted">
          <h3 className="plan-place__restricted-title">
            <span aria-hidden>🔒</span> Réservé aux personnels
          </h3>
          <PlanLinkedText className="plan-place__restricted-text" text={restrictedNote} />
        </section>
      ) : null}
      {shareUrl ? <p className="plan-place__share">Lien direct : {shareUrl}</p> : null}
      {myReports.length ? (
        <section className="plan-place__reports">
          <h3 className="plan-place__reports-title">Mes signalements sur ce lieu</h3>
          <ul className="plan-place__reports-list">
            {myReports.map((report) => (
              <li key={report.id} className="plan-place__report">
                <p className="plan-place__report-body">{report.body}</p>
                <p className="plan-place__report-meta">
                  <span className={placeStatusClass(report.place_status)}>
                    {placeStatusLabel(report.place_status, { forAuthor: true })}
                  </span>{' '}
                  · envoyé le {formatReportDate(report.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {onSuggest ? <PlaceSuggestionForm onSubmit={onSuggest} /> : null}
      {editUrl ? (
        <p className="plan-place__edit">
          <a href={editUrl} target="_blank" rel="noopener noreferrer">
            Ouvrir la console ForetMap pour corriger ce lieu
          </a>
        </p>
      ) : null}
    </BottomSheet>
  );
}
