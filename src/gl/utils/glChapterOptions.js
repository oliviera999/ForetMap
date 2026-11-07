/**
 * Options du sélecteur de chapitres de la console MJ (« Tenir à deux », simulation du 7/11) :
 * seuls les chapitres de plateau (`plateau_number`) sont proposés, préfixés « Plateau N — » ;
 * la case « Afficher les chapitres hors plateau » révèle la démo « La forêt magique » et « test ».
 * Pur : testé sans React (tests-ui/gl/glChapterOptions.test.js).
 */

function plateauOf(chapter) {
  const n = Number(chapter?.plateau_number ?? chapter?.plateauNumber);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Libellé d'un chapitre : « Plateau N — Titre » pour un plateau, le titre sinon. */
export function chapterOptionLabel(chapter) {
  const title = String(chapter?.title || chapter?.slug || `Chapitre #${chapter?.id ?? '?'}`);
  const plateau = plateauOf(chapter);
  return plateau ? `Plateau ${plateau} — ${title}` : title;
}

/**
 * Options triées : plateaux par numéro puis titre ; hors plateau (si demandés, ou si le chapitre
 * est celui déjà sélectionné, pour ne jamais vider un <select>) à la suite.
 * @param {Array<object>} chapters
 * @param {{ horsPlateau?: boolean, selectedId?: string|number|null }} [opts]
 * @returns {Array<{ id: number, label: string, plateau: number|null }>}
 */
export function buildChapterOptions(chapters, { horsPlateau = false, selectedId = null } = {}) {
  const list = Array.isArray(chapters) ? chapters : [];
  const selected = selectedId != null && selectedId !== '' ? Number(selectedId) : null;
  const plateaux = list
    .filter((c) => plateauOf(c) != null)
    .sort(
      (a, b) =>
        plateauOf(a) - plateauOf(b) ||
        String(a.title || '').localeCompare(String(b.title || ''), 'fr'),
    );
  const autres = list
    .filter((c) => plateauOf(c) == null && (horsPlateau || Number(c?.id) === selected))
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr'));
  return [...plateaux, ...autres].map((c) => ({
    id: Number(c.id),
    label: chapterOptionLabel(c),
    plateau: plateauOf(c),
  }));
}

/** Vrai si la liste contient au moins un chapitre hors plateau (sinon la case est inutile). */
export function hasChaptersHorsPlateau(chapters) {
  return (Array.isArray(chapters) ? chapters : []).some((c) => plateauOf(c) == null);
}
