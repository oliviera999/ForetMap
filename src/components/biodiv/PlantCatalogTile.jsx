import { useMemo } from 'react';
import { PlantSpeciesDiscoveryAcknowledgeButton } from '../PlantSpeciesDiscoveryAcknowledge';
import { PlantPedagoTraitBadges } from './PlantSummaryBlocks.jsx';
import { normalizedPlantValue } from '../../utils/plantFormValues.js';
import { findFirstBiodivHeroPhotoCandidate } from '../../utils/biodivPlantForm.js';
import { IconMarker } from '../../shared/icons.jsx';

/**
 * Vignette du catalogue biodiversité (élève et prof).
 *
 * Remplace le rendu de la **fiche complète** dans la grille : le catalogue montrait
 * jusqu'ici toutes les fiches dépliées, et chaque fiche allait chercher ses propres
 * données au montage (bloc pédagogique ×3, commentaires ×3) — ~471 requêtes pour
 * 78 espèces, de quoi saturer le plafond de 1200 req/min d'un établissement à trois
 * ouvertures simultanées (`docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md`, §1).
 *
 * La vignette **ne déclenche aucun appel réseau** : tout ce qu'elle affiche vient déjà
 * de `GET /api/plants` (photo, nom, taxonomie, traits) ou d'appels de **page** mutualisés
 * (compteurs d'observation, annonce du contrôle de compréhension). La fiche complète
 * s'ouvre au clic, dans la modale d'aperçu déjà utilisée partout ailleurs dans
 * l'application (carte, glossaire, quiz, réseau trophique, visite).
 *
 * Deux détails volontaires côté coût :
 * - seule une photo **directe** est affichée ; une photo renseignée par catégorie
 *   Wikimedia Commons demanderait une résolution par requête externe, réservée à la
 *   fiche ouverte (`PlantBiodivHeroPhoto`) ;
 * - la description est un extrait **en texte brut** tronqué par CSS, pas un rendu
 *   Markdown : 78 rendus Markdown pour deux lignes d'aperçu ne se justifient pas.
 *
 * @param {object} props
 * @param {object} props.plant Ligne du catalogue (`GET /api/plants`).
 * @param {(id: number|string) => void} [props.onOpen] Ouverture de la fiche complète.
 * @param {boolean} [props.hasMapLink] La fiche est reliée à une zone ou un repère.
 * @param {import('react').ReactNode} [props.actions] Actions de fin de vignette (prof).
 */
export function PlantCatalogTile({
  plant,
  onOpen = null,
  hasMapLink = false,
  myObservationCount = 0,
  siteObservationCount = 0,
  gatingSummary = null,
  onObservationAcknowledged = null,
  offerPlantCommentAfterObservation = false,
  onForceLogout = null,
  actions = null,
}) {
  const photoCandidate = useMemo(
    () => (plant ? findFirstBiodivHeroPhotoCandidate(plant) : null),
    [plant],
  );
  const photoSrc = photoCandidate?.kind === 'direct' ? photoCandidate.src : null;

  if (!plant) return null;

  const name = normalizedPlantValue(plant.name) || 'Être vivant';
  const scientific = normalizedPlantValue(plant.scientific_name);
  const description = normalizedPlantValue(plant.description);
  const open = () => onOpen?.(plant.id);

  return (
    <article className="biodiv-tile" data-biodiv-plant-id={plant.id}>
      <button
        type="button"
        className="biodiv-tile__open"
        onClick={open}
        aria-label={`Ouvrir la fiche de ${name}`}
      >
        <span className="biodiv-tile__visual" aria-hidden="true">
          {photoSrc ? (
            <img src={photoSrc} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="biodiv-tile__emoji">{plant.emoji || '🌱'}</span>
          )}
        </span>
        <span className="biodiv-tile__titles">
          <span className="biodiv-tile__name">
            {plant.emoji && photoSrc ? (
              <span className="biodiv-tile__name-emoji" aria-hidden="true">
                {plant.emoji}
              </span>
            ) : null}
            {name}
          </span>
          {scientific ? <span className="biodiv-tile__scientific">{scientific}</span> : null}
        </span>
      </button>

      {description ? <p className="biodiv-tile__desc">{description}</p> : null}

      <PlantPedagoTraitBadges plant={plant} />

      {hasMapLink ? (
        <div className="task-meta">
          <span className="task-chip">
            <IconMarker size={12} /> Sur la carte
          </span>
        </div>
      ) : null}

      <div className="biodiv-tile__footer">
        <PlantSpeciesDiscoveryAcknowledgeButton
          plantId={plant.id}
          speciesName={plant.name}
          myObservationCount={myObservationCount}
          siteObservationCount={siteObservationCount}
          gatingSummary={gatingSummary}
          offerPlantCommentAfterObservation={offerPlantCommentAfterObservation}
          onAcknowledged={(id, next) => onObservationAcknowledged?.(id, next)}
          onForceLogout={onForceLogout}
        />
        {actions}
      </div>
    </article>
  );
}
