/**
 * Helpers purs de l'upload multi-photos « Galerie » du formulaire de fiche plante —
 * extraits de `PlantEditForm` (`foretmap-views.jsx`, O6).
 *
 * Plusieurs fichiers sélectionnés d'un coup sont répartis sur les champs photo
 * suivants dans l'ordre du modèle (photo espèce → … → partie récoltée) ; les
 * fichiers au-delà du dernier champ disponible sont ignorés (comptés `skipped`).
 */

/** Ne garde que les fichiers réels (taille > 0) d'une FileList ou d'un tableau. */
export function filterNonEmptyFiles(fileList) {
  return Array.from(fileList || []).filter((f) => f?.size);
}

/**
 * Planifie la répartition de `fileCount` fichiers sur les champs photo à partir
 * de `startFieldKey` (inclus).
 *
 * @param {Array<{key: string, label: string}>} photoFields champs photo dans l'ordre du formulaire
 * @param {string} startFieldKey clé du champ de départ
 * @param {number} fileCount nombre de fichiers à répartir
 * @returns {{assignments: Array<{fileIndex: number, fieldKey: string, label: string}>, skipped: number, startLabel: string}|null}
 *   `null` si le champ de départ est inconnu ; sinon les affectations fichier→champ,
 *   le nombre de fichiers sans champ disponible et le libellé du champ de départ.
 */
export function planGalleryPhotoSlots(photoFields, startFieldKey, fileCount) {
  const startIdx = photoFields.findIndex((f) => f.key === startFieldKey);
  if (startIdx < 0) return null;
  const assignments = photoFields
    .slice(startIdx, startIdx + fileCount)
    .map((field, i) => ({ fileIndex: i, fieldKey: field.key, label: field.label }));
  return {
    assignments,
    skipped: Math.max(0, fileCount - assignments.length),
    startLabel: photoFields[startIdx].label,
  };
}

/**
 * Messages de fin d'upload galerie (dans l'ordre d'affichage historique) :
 * d'abord l'avertissement de fichiers ignorés, puis le succès (singulier/pluriel).
 *
 * @param {{ok: number, skipped: number, startLabel: string}} outcome
 * @returns {string[]} 0, 1 ou 2 messages à toaster
 */
export function galleryUploadToastMessages({ ok, skipped, startLabel }) {
  const messages = [];
  if (skipped > 0) {
    messages.push(`${skipped} photo(s) non importée(s) — plus de champ disponible après « ${startLabel} ».`);
  }
  if (ok === 1 && skipped === 0) {
    messages.push('Photo importée ✓');
  } else if (ok > 1) {
    messages.push(`${ok} photos importées ✓`);
  }
  return messages;
}
