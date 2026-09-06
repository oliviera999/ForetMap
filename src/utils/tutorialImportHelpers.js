/**
 * Helpers purs de la fenêtre « Importer /tutos/ » — extraits de `tutorials-views.jsx`.
 *
 * L'import parcourt le dossier serveur `tutos/` et ne propose que les fiches absentes de la
 * base. Chaque fiche écartée l'est pour une raison précise (déjà en base, fichier illisible) :
 * la fenêtre ne montrait que les fiches à importer, si bien qu'un dossier sans nouveauté —
 * ou une fiche mal rapprochée d'un tutoriel existant — se présentait comme un bouton grisé
 * sans explication. Ces fonctions donnent les libellés et le message d'échec correspondants.
 */

/** Libellé du critère qui a rapproché une fiche du disque d'un tutoriel déjà en base. */
export function tutorialImportMatchReasonLabel(reason) {
  switch (String(reason || '')) {
    case 'source_file_path':
      return 'même chemin de fichier';
    case 'content':
      return 'contenu identique';
    case 'slug':
      return 'même identifiant';
    case 'title':
      return 'même titre';
    case 'filename_stem':
      return 'nom de fichier proche';
    default:
      return 'déjà en base';
  }
}

/** Libellé de l'état d'une fiche du dossier `tutos/` dans le rapport d'analyse. */
export function tutorialImportStatusLabel(status) {
  switch (String(status || '')) {
    case 'pending':
      return 'À importer';
    case 'imported':
      return 'Importée';
    case 'already_imported':
      return 'Déjà en base';
    case 'error':
      return 'Erreur';
    default:
      return 'Inconnu';
  }
}

/**
 * Message d'échec d'un import : reprend la première erreur remontée par le serveur plutôt
 * qu'un décompte muet, pour que le professeur sache quoi corriger sur le fichier.
 */
export function firstImportErrorMessage(report, failedCount = 0) {
  const items = Array.isArray(report?.items) ? report.items : [];
  const failed = items.filter((item) => item?.status === 'error');
  const count = Number(failedCount) || failed.length;
  const first = failed[0];
  if (!first) {
    return count > 0
      ? `${count} fiche(s) n’ont pas pu être importées.`
      : 'Import impossible : le serveur n’a rien importé.';
  }
  const detail = first.error ? ` — ${first.error}` : '';
  const others = count > 1 ? ` (et ${count - 1} autre(s))` : '';
  return `Échec sur ${first.filename}${detail}${others}`;
}

/**
 * Explique pourquoi aucune fiche n'est proposée à l'import : sans cela, le bouton
 * « Importer les nouvelles fiches » restait grisé sans que rien ne dise pourquoi.
 */
export function emptyImportExplanation(report) {
  const onDisk = Number(report?.totals?.on_disk) || 0;
  const errors = Number(report?.totals?.errors) || 0;
  if (onDisk === 0) {
    return 'Le dossier serveur tutos/ ne contient aucun fichier .html. Déposez-y une fiche, puis relancez l’analyse.';
  }
  if (errors >= onDisk) {
    return 'Aucune fiche lisible dans le dossier serveur tutos/ : voir les erreurs ci-dessus.';
  }
  return 'Toutes les fiches du dossier serveur tutos/ correspondent déjà à un tutoriel en base (voir la colonne de droite). Pour ajouter une fiche, déposez son fichier .html dans tutos/ puis relancez l’analyse ; pour créer un tutoriel depuis votre ordinateur, utilisez « + Ajouter » puis « Importer un fichier HTML ».';
}
