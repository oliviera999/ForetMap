/**
 * Libellés et textes des observations d'espèces (migration 307).
 *
 * Réunis ici pour deux raisons : une seule orthographe des statuts et des modes de détection
 * dans tous les écrans, et un contrôle automatique de la règle permanente du projet — **aucun
 * texte n'invite à cueillir, goûter ou manipuler un être vivant** : on observe en regardant,
 * en écoutant et en photographiant, sans toucher ni prélever (`lib/visitorTextGuard.js`,
 * vérifié par `tests/species-observations-texts.test.js`).
 */

import { SPECIES_OBSERVATION_STATUS_ENUM } from '../../shared/enums/terrainEnums.js';

/** Statuts du serveur → libellés affichés (référentiel partagé, `terrainEnums.js`). */
export const OBSERVATION_STATUS_LABELS = SPECIES_OBSERVATION_STATUS_ENUM.labels;

/** Pastille courte (liste compacte). */
export const OBSERVATION_STATUS_SHORT = Object.freeze({
  soumise: 'À valider',
  validee: 'Validée',
  refusee: 'Non retenue',
});

/** Vocabulaire de `map_species.detection_mode`, une valeur par observation. */
export const DETECTION_MODE_OPTIONS = Object.freeze([
  { value: 'vue', label: 'Vu de mes yeux' },
  { value: 'chant', label: 'Entendu (chant, cri)' },
  { value: 'trace', label: 'Trace (empreinte, galerie)' },
  { value: 'indice', label: 'Indice (plume, mue, reste de repas)' },
  { value: 'nocturne', label: 'Observé de nuit' },
]);

export function detectionModeLabel(value) {
  const hit = DETECTION_MODE_OPTIONS.find((o) => o.value === value);
  return hit ? hit.label : '';
}

export const OBSERVATION_TEXTS = Object.freeze({
  reportButton: 'Signaler une observation',
  reportHereButton: 'Signaler une observation ici',
  myObservationsButton: 'Mes observations',
  formTitle: 'Signaler une observation',
  formIntro:
    'Observe sans toucher ni prélever : regarde, écoute, photographie. Un enseignant vérifiera ton observation avant qu’elle compte pour le site.',
  speciesLabel: 'Espèce observée',
  speciesUnknown: '— Je ne sais pas —',
  placeLabel: 'Lieu (facultatif)',
  placeNone: '— Sans lieu précis —',
  dateLabel: 'Date',
  modeLabel: 'Comment l’as-tu repérée ?',
  modeNone: '— Non précisé —',
  textLabel: 'Ce que tu as vu',
  textPlaceholder: 'Nombre, taille, couleur, comportement, météo…',
  photoLabel: 'Photo (facultatif)',
  photoOfflineHint:
    'Sans réseau, la photo est gardée sur l’appareil et partira avec ton observation.',
  needSpeciesOrText: 'Choisis l’espèce ou décris ce que tu as vu.',
  submit: 'Envoyer',
  cancel: 'Annuler',
  sent: 'Observation envoyée : un enseignant va la vérifier ✓',
  sentWithoutPhoto: 'Observation envoyée, mais la photo n’a pas pu partir.',
  queued: 'Pas de réseau : ton observation est gardée sur l’appareil et partira toute seule.',
  queuedWithoutPhoto:
    'Pas de réseau : ton observation est gardée et partira toute seule, mais l’appareil n’a pas pu garder la photo (stockage plein).',
  pendingPhoto: 'Photo jointe',
  queueFailed:
    'Pas de réseau et l’appareil ne peut pas garder ton observation. Réessaie plus tard.',
  confirmedOnSite: 'Confirmée sur le site',
  confirmedOnSiteHint: 'Un enseignant a validé une observation de cette espèce ici.',
  myListTitle: 'Mes observations',
  myListEmpty: 'Tu n’as encore signalé aucune observation.',
  pendingOffline: 'En attente de réseau',
  refusedOffline: 'Refusée par le serveur',
  deleteLabel: 'Supprimer',
  teacherNote: 'Note de l’enseignant',
  reviewTitle: 'Observations à valider',
  reviewIntro:
    'Observations signalées par les élèves. Valider confirme la présence de l’espèce sur la carte (« confirmée sur le site ») ; la décision est définitive.',
  reviewEmpty: 'Aucune observation dans cette liste.',
  moduleOffBanner:
    'Module éteint pour les élèves (Paramètres → Modules) : ils ne voient plus « Signaler une observation ». La file reste ouverte ici.',
  validate: 'Valider',
  refuse: 'Ne pas retenir',
  notePlaceholder: 'Note pour l’élève (facultatif)',
  evidenceTitle: 'Preuve d’une relation du réseau trophique',
  evidenceHint:
    'Rattache l’observation à une relation qu’elle montre : validée, elle la fait passer à « observé sur le site ».',
  evidenceAttach: 'Rattacher',
});
