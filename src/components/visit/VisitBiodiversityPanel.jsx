import { useMemo, useState } from 'react';
import { findFirstBiodivHeroPhotoCandidate } from '../../utils/biodivPlantForm.js';
import { normalizedPlantValue } from '../../utils/plantFormValues.js';
import { IconBiodiv } from '../../shared/icons.jsx';

/**
 * Biodiversité d'un lieu de visite : vignettes d'espèces ouvrant la fiche du catalogue.
 *
 * Remplace le volet replié « Biodiversité » du panneau détail (une simple liste de noms
 * dans un `<details>`) : les espèces du lieu sont la raison d'être d'une visite de forêt
 * comestible, elles sont donc visibles d'emblée, avec photo, nom scientifique et un extrait
 * de fiche. La fiche complète s'ouvre dans la modale d'aperçu déjà utilisée partout
 * ailleurs (carte, glossaire, quiz, réseau trophique).
 *
 * Comme la vignette du catalogue (`PlantCatalogTile`), ce composant **ne déclenche aucun
 * appel réseau** : tout vient de `GET /api/plants` (déjà chargé côté élève/prof, chargé à
 * la demande en visite invitée) et des espèces publiées par `GET /api/visit/content`. Seule
 * une photo **directe** est affichée — résoudre une catégorie Wikimedia Commons demanderait
 * une requête externe par vignette, réservée à la fiche ouverte.
 */

/** Extrait de fiche affiché sous le nom : rôle écologique, à défaut la description. */
function speciesTileExtract(plant) {
  return (
    normalizedPlantValue(plant?.ecosystem_role) || normalizedPlantValue(plant?.description) || null
  );
}

function VisitSpeciesTile({ name, emoji, plant, onOpenPlant }) {
  const photoCandidate = useMemo(
    () => (plant ? findFirstBiodivHeroPhotoCandidate(plant) : null),
    [plant],
  );
  /**
   * Photo injoignable (lien mort, hébergeur externe bloqué, hors ligne) : la vignette
   * retombe sur l'emoji plutôt que de laisser un cadre vide — beaucoup de photos du
   * catalogue pointent vers Wikimedia Commons, qu'une visite sur le terrain n'atteint pas
   * toujours.
   */
  const [failedPhotoSrc, setFailedPhotoSrc] = useState(null);
  const candidateSrc = photoCandidate?.kind === 'direct' ? photoCandidate.src : null;
  const photoSrc = candidateSrc && candidateSrc !== failedPhotoSrc ? candidateSrc : null;
  const displayEmoji = plant?.emoji || emoji || '🌱';
  const scientific = normalizedPlantValue(plant?.scientific_name);
  const extract = speciesTileExtract(plant);
  const canOpen = !!plant && typeof onOpenPlant === 'function';

  const inner = (
    <>
      <span className="visit-biodiv-tile__visual" aria-hidden="true">
        {photoSrc ? (
          <img
            src={photoSrc}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailedPhotoSrc(photoSrc)}
          />
        ) : (
          <span className="visit-biodiv-tile__emoji">{displayEmoji}</span>
        )}
      </span>
      <span className="visit-biodiv-tile__text">
        <span className="visit-biodiv-tile__name">
          {photoSrc ? (
            <span className="visit-biodiv-tile__name-emoji" aria-hidden="true">
              {displayEmoji}{' '}
            </span>
          ) : null}
          {name}
        </span>
        {scientific ? <span className="visit-biodiv-tile__scientific">{scientific}</span> : null}
        {extract ? <span className="visit-biodiv-tile__desc">{extract}</span> : null}
      </span>
    </>
  );

  if (!canOpen) {
    // Nom sans fiche catalogue (ou catalogue encore en chargement) : l'espèce reste
    // annoncée, mais rien ne suggère qu'on puisse l'ouvrir.
    return (
      <div className="visit-biodiv-tile visit-biodiv-tile--static" data-species-name={name}>
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="visit-biodiv-tile"
      data-species-name={name}
      data-biodiv-plant-id={plant.id}
      onClick={() => onOpenPlant(plant.id)}
      aria-label={`Ouvrir la fiche de ${name}`}
    >
      {inner}
    </button>
  );
}

/**
 * @param {object} props
 * @param {'zone'|'marker'} props.locationKind nature du lieu sélectionné
 * @param {string[]} props.names espèces du lieu (ordre d'affichage)
 * @param {Array<{id: number, name: string, emoji?: string}>} [props.species] espèces publiées
 *   par le contenu de visite — fournit emoji et identifiant avant que le catalogue soit là
 * @param {Array<object>} [props.plants] catalogue biodiversité (`GET /api/plants`)
 * @param {string[]} [props.namesOnlyOnTasks] espèces rattachées au lieu via les missions
 * @param {((plantId: number|string) => void)|null} [props.onOpenPlant] ouverture de la fiche
 */
export function VisitBiodiversityPanel({
  locationKind,
  names = [],
  species = [],
  plants = [],
  namesOnlyOnTasks = [],
  onOpenPlant = null,
}) {
  const plantByName = useMemo(() => {
    const map = new Map();
    for (const plant of plants || []) {
      const key = String(plant?.name || '').trim();
      if (key && !map.has(key)) map.set(key, plant);
    }
    return map;
  }, [plants]);

  const emojiByName = useMemo(() => {
    const map = new Map();
    for (const sp of species || []) {
      const key = String(sp?.name || '').trim();
      if (key && !map.has(key)) map.set(key, String(sp.emoji || '').trim());
    }
    return map;
  }, [species]);

  const primaryList = useMemo(() => dedupeNames(names), [names]);
  const taskList = useMemo(
    () => dedupeNames(namesOnlyOnTasks).filter((n) => !primaryList.includes(n)),
    [namesOnlyOnTasks, primaryList],
  );

  if (primaryList.length === 0 && taskList.length === 0) return null;

  const renderTiles = (list) =>
    list.map((name) => (
      <VisitSpeciesTile
        key={name}
        name={name}
        emoji={emojiByName.get(name)}
        plant={plantByName.get(name) || null}
        onOpenPlant={onOpenPlant}
      />
    ));

  const hasOpenable =
    typeof onOpenPlant === 'function' &&
    [...primaryList, ...taskList].some((name) => plantByName.has(name));

  return (
    <section className="visit-biodiv" aria-label="Biodiversité du lieu">
      <h4 className="visit-biodiv__title">
        <IconBiodiv size={15} />{' '}
        {locationKind === 'zone' ? 'Biodiversité de cette zone' : 'Biodiversité de ce repère'}
      </h4>
      {hasOpenable ? (
        <p className="visit-biodiv__hint">
          Touche une espèce pour ouvrir sa fiche (description, rôle, photos).
        </p>
      ) : null}
      {primaryList.length > 0 ? (
        <div className="visit-biodiv__grid">{renderTiles(primaryList)}</div>
      ) : null}
      {taskList.length > 0 ? (
        <div className="visit-biodiv__also">
          <h5 className="visit-biodiv__subtitle">Également dans les missions</h5>
          <div className="visit-biodiv__grid">{renderTiles(taskList)}</div>
        </div>
      ) : null}
    </section>
  );
}

/** Noms normalisés, sans doublon, ordre d'entrée conservé. */
function dedupeNames(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    const name = String(raw || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
