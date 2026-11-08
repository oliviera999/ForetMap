'use strict';

/**
 * Attendus d'équilibrage du banc (§ 7.6 du cahier des charges) : des **avertissements** dans le
 * rapport, jamais des échecs (seuls les invariants, les 5xx et les mots interdits font échouer).
 *
 * `evaluerAttendus({ classe, plateau, indicateurs })` compare les médianes agrégées d'un
 * scénario à la table ci-dessous et renvoie une ligne par indicateur :
 * `{ indicateur, libelle, valeur, attendu, ok }` (`ok: null` quand l'indicateur n'est pas
 * mesuré ou qu'aucun attendu ne s'applique).
 *
 * Indicateurs (en %, sauf `matthieu`, `gini`, `spearmanBadges` qui sont des coefficients) :
 * `partEntre4et6`, `equipesSousVoile`, `pagesPalies`, `pagesTenues`, `carnetComplet`,
 * `partGnomes`, `elevesZero`, `doublePlafond`, `matthieu`, `gini`, `badgesPalier`,
 * `spearmanBadges`.
 */

function plage(min, max) {
  return { min, max };
}
function auPlus(max) {
  return { max };
}
function auMoins(min) {
  return { min };
}

const LIBELLES = Object.freeze({
  partEntre4et6: 'Chapitre entre 4 et 6 séances (% des exécutions)',
  equipesSousVoile: 'Équipes passées sous le voile au moins une fois (%)',
  pagesPalies: 'Pages pâlies au Seuil (% des zones actives)',
  pagesTenues: 'Pages tenues au Seuil (% des zones actives)',
  carnetComplet: 'Carnet complet atteint (% des exécutions)',
  partGnomes: 'Part des Gnomes dans les pages trouvées + réparées (%)',
  elevesZero: 'Élèves à 0 dans les deux ressources en fin de chapitre (%)',
  doublePlafond: 'Élèves au double plafond 8/8 en fin d’année (%)',
  matthieu: 'Indice Matthieu (Spearman justesse ↔ ressources gagnées hors Marché)',
  gini: 'Gini des bourses (cœurs + gemmes) en fin de chapitre',
  badgesPalier: 'Élèves avec au moins un palier Fil en fin de chapitre 1 (%)',
  spearmanBadges: 'Spearman justesse ↔ nombre de paliers',
});

/** Attendus par classe et par plateau (P1-P4) : fonction (plateau) → plage. */
const ATTENDUS = Object.freeze({
  moyenne: {
    partEntre4et6: () => auMoins(95),
    equipesSousVoile: (p) => (p === 1 ? plage(15, 30) : p === 2 ? plage(30, 45) : plage(50, 70)),
    pagesPalies: (p) => (p <= 2 ? auPlus(30) : auPlus(50)),
    pagesTenues: (p) => (p <= 2 ? auMoins(70) : auMoins(50)),
    carnetComplet: (p) => (p <= 2 ? plage(20, 40) : auMoins(1)),
    partGnomes: () => plage(40, 55),
    elevesZero: () => auPlus(5),
    doublePlafond: () => auPlus(20),
    matthieu: () => auPlus(0.3),
    gini: () => auPlus(0.25),
    badgesPalier: (p) => (p === 1 ? auMoins(90) : null),
    spearmanBadges: () => auPlus(0.3),
  },
  difficulte: {
    partEntre4et6: () => auMoins(90),
    equipesSousVoile: (p) => (p <= 2 ? auPlus(50) : auPlus(80)),
    pagesPalies: (p) => (p <= 2 ? auPlus(40) : auPlus(65)),
    pagesTenues: (p) => (p <= 2 ? auMoins(55) : auMoins(33)),
    carnetComplet: () => null,
    partGnomes: () => plage(40, 55),
    elevesZero: () => auPlus(5),
    doublePlafond: () => null,
    matthieu: () => auPlus(0.3),
    gini: () => auPlus(0.25),
    badgesPalier: (p) => (p === 1 ? auMoins(85) : null),
    spearmanBadges: () => auPlus(0.3),
  },
});

/** `experte` lit les attendus de la classe moyenne (aucune colonne dédiée dans le cahier). */
function classeAttendus(classe) {
  const c = String(classe || 'moyenne');
  if (c === 'difficulte') return 'difficulte';
  return 'moyenne';
}

function formatAttendu(a) {
  if (!a) return '—';
  if (a.min != null && a.max != null) return `${a.min} – ${a.max}`;
  if (a.min != null) return `≥ ${a.min}`;
  if (a.max != null) return `≤ ${a.max}`;
  return '—';
}

function dansPlage(v, a) {
  if (a.min != null && v < a.min) return false;
  if (a.max != null && v > a.max) return false;
  return true;
}

/**
 * @param {{ classe: string, plateau: number, indicateurs: Record<string, number|null> }} input
 * @returns {Array<{ indicateur, libelle, valeur, attendu, ok }>}
 */
function evaluerAttendus({ classe = 'moyenne', plateau = 1, indicateurs = {} } = {}) {
  const table = ATTENDUS[classeAttendus(classe)];
  const p = Number(plateau) || 1;
  const out = [];
  for (const [indicateur, libelle] of Object.entries(LIBELLES)) {
    const attendu = table[indicateur] ? table[indicateur](p) : null;
    const raw = indicateurs[indicateur];
    const valeur = raw == null || !Number.isFinite(Number(raw)) ? null : Number(raw);
    let ok = null;
    if (attendu && valeur != null) ok = dansPlage(valeur, attendu);
    out.push({ indicateur, libelle, valeur, attendu: formatAttendu(attendu), ok });
  }
  return out;
}

/** Seules les lignes évaluées (`ok !== null`) comptent ; `ok` global = aucune ligne fausse. */
function bilanAttendus(lignes) {
  const evaluees = (lignes || []).filter((l) => l.ok !== null);
  return {
    evaluees: evaluees.length,
    respectees: evaluees.filter((l) => l.ok).length,
    manquees: evaluees.filter((l) => !l.ok).map((l) => l.indicateur),
    ok: evaluees.every((l) => l.ok),
  };
}

module.exports = {
  LIBELLES,
  ATTENDUS,
  classeAttendus,
  evaluerAttendus,
  bilanAttendus,
  formatAttendu,
};
