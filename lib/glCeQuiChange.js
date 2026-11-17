'use strict';

/**
 * « Ce qui change » (« Tenir à deux », ensemble unifié, M8) : au camp, trois lignes pour le
 * chapitre suivant — ton peuple, tes nouveaux sorts, la nouveauté du plateau.
 *
 * Rien n'est écrit à la main par chapitre : les sorts viennent des rattachements du catalogue
 * (`sorts.json › ouverture_par_chapitre`, table `gl_chapter_spells`), le reste des réglages
 * résolus. Aucun texte de lore, aucun nom de pays à venir.
 */

const {
  resolveTenirSettings,
  resolveZonesParPlateau,
  resolveVoileBonus,
  parseJsonColumn,
} = require('./glTenir');
const { etatEscalier } = require('./shared/glTenirEscalierCore');

const DERNIER_PLATEAU = 4;
const PEUPLES = Object.freeze({ gnome: 'Gnomes', unicorn: 'Licornes' });

/** Peuple (`gnome` | `unicorn`) d'un type d'équipe, ou `null`. */
function peupleDe(teamType) {
  const t = String(teamType || '').toLowerCase();
  if (t === 'unicorn' || t === 'licorne') return 'unicorn';
  if (t === 'gnome') return 'gnome';
  return null;
}

/**
 * Peuple d'un élève au chapitre suivant : chaque élève change de peuple entre les chapitres 1 et
 * 2, puis 3 et 4 (contrainte dure de la composition). Entre 2 et 3, les équipes se recomposent
 * librement : `null`.
 */
function peupleSuivant(plateau, teamType) {
  const actuel = peupleDe(teamType);
  if (!actuel || ![1, 3].includes(Number(plateau))) return null;
  return actuel === 'gnome' ? 'unicorn' : 'gnome';
}

/** Ligne « ton peuple » (`classe` : pour la projection, sans équipe). */
function lignePeuple(plateau, teamType) {
  const change = [1, 3].includes(Number(plateau));
  const suivant = peupleSuivant(plateau, teamType);
  if (suivant) {
    return {
      cle: 'peuple',
      titre: 'Ton peuple',
      texte: `Tu passes chez les ${PEUPLES[suivant]}.`,
    };
  }
  if (!peupleDe(teamType)) {
    return {
      cle: 'peuple',
      titre: 'Votre peuple',
      texte: change
        ? 'Tout le monde passe dans l’autre peuple.'
        : 'Les équipes se recomposent : vous le découvrirez au départ.',
    };
  }
  return {
    cle: 'peuple',
    titre: 'Ton peuple',
    texte: 'Les équipes se recomposent : tu le découvriras au départ.',
  };
}

/** Sorts officiels « Tenir » ouverts à un plateau : `[{ code, nom, peuple }]`. */
async function sortsDuPlateau(db, plateau) {
  const rows = await db.queryAll(
    `SELECT s.spell_code AS code, s.nom, s.peuple
       FROM gl_chapter_spells cs
       INNER JOIN gl_spells s ON s.spell_code = cs.spell_code
      WHERE cs.chapter_id = (SELECT id FROM gl_chapters WHERE plateau_number = ? ORDER BY id ASC LIMIT 1)
        AND s.tenir_v2 = 1 AND s.statut = 'officiel'
      ORDER BY cs.order_index ASC, s.spell_code ASC`,
    [plateau],
  );
  return rows.map((r) => ({
    code: String(r.code),
    nom: String(r.nom || r.code),
    peuple: String(r.peuple || 'any'),
  }));
}

/**
 * Ligne « tes nouveaux sorts » : ce que le chapitre suivant ouvre et que celui-ci n'avait pas.
 * Un sort réservé à un peuple n'est annoncé qu'à ce peuple quand on le connaît ; sinon il est
 * dit avec son peuple. Un élève qui change de peuple (`peupleActuel` ≠ `peuple`) découvre aussi
 * les sorts de son nouveau peuple déjà ouverts : ils sont nouveaux pour lui.
 */
function ligneSorts(actuels, suivants, peuple, peupleActuel = null) {
  const reserve = (s) => ['gnome', 'unicorn'].includes(s.peuple);
  const connus = new Set(
    actuels
      .filter((s) => !peuple || !peupleActuel || !reserve(s) || s.peuple === peupleActuel)
      .map((s) => s.code),
  );
  const nouveaux = suivants.filter((s) => !connus.has(s.code) && s.peuple !== 'classe');
  const pourMoi = nouveaux.filter(
    (s) => !peuple || !['gnome', 'unicorn'].includes(s.peuple) || s.peuple === peuple,
  );
  const noms = pourMoi.map((s) =>
    !peuple && PEUPLES[s.peuple] ? `${s.nom} (${PEUPLES[s.peuple]})` : s.nom,
  );
  const titre = peuple ? 'Tes nouveaux sorts' : 'Les nouveaux sorts';
  return {
    cle: 'sorts',
    titre,
    texte: noms.length ? `${noms.join(', ')}.` : 'Pas de nouveau sort : les mêmes, bien connus.',
    sorts: pourMoi.map((s) => s.code),
  };
}

/** Une Cordée est-elle offerte à chaque équipe à ce plateau (M16) ? Lu dans le catalogue. */
async function cordeeOfferteAuPlateau(db, plateau) {
  if (Number(plateau) !== DERNIER_PLATEAU) return false;
  const rows = await db.queryAll(
    `SELECT s.effet_auto_json
       FROM gl_chapter_spells cs
       INNER JOIN gl_spells s ON s.spell_code = cs.spell_code
      WHERE cs.chapter_id = (SELECT id FROM gl_chapters WHERE plateau_number = ? ORDER BY id ASC LIMIT 1)
        AND s.tenir_v2 = 1 AND s.statut = 'officiel'`,
    [plateau],
  );
  return rows.some((r) => {
    const effet = parseJsonColumn(r.effet_auto_json, null);
    return effet?.type === 'cordee' && effet.offerte_plateau_4 !== false;
  });
}

/**
 * Ligne « le plateau » : ce que les réglages changent d'un plateau au suivant (pur).
 * @param {object} resolved réglages résolus de la partie qui se termine
 * @param {number} plateau plateau qui se termine
 * @param {{ cordeeOfferte?: boolean }} [opts]
 */
function lignePlateau(resolved, plateau, { cordeeOfferte = false } = {}) {
  const suivant = Number(plateau) + 1;
  const quoi = [];
  if (etatEscalier(resolved)) quoi.push('tout est ouvert dès la première séance');
  const pages = resolveZonesParPlateau(resolved, suivant);
  if (pages !== resolveZonesParPlateau(resolved, plateau)) {
    quoi.push(`${pages} pages à retrouver`);
  }
  if (resolved?.voile !== false || etatEscalier(resolved)) {
    const avant = resolveVoileBonus(resolved, plateau);
    const apres = resolveVoileBonus(resolved, suivant);
    if (apres > avant) quoi.push('le voile avance un peu plus vite');
    if (apres < avant) quoi.push('le voile avance un peu moins vite');
  }
  if (cordeeOfferte) quoi.push('une Cordée offerte à chaque équipe');
  const phrase = quoi.join(' ; ');
  return {
    cle: 'plateau',
    titre: 'Le plateau',
    texte: phrase
      ? `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}.`
      : 'Les mêmes règles, un nouveau chemin.',
  };
}

/**
 * Les trois lignes du camp, pour une équipe (`teamType`) ou pour la classe (`null`).
 * @param {object} db `{ queryAll, queryOne }`
 * @param {{ game: object, settings: object, teamType?: string|null }} p `game` porte
 *   `plateau_number`, `tenir_profil`, `tenir_overrides_json`
 * @returns {Promise<null|{ plateau: number, lignes: Array<{ cle, titre, texte }> }>} `null` au
 *   dernier plateau : il n'y a pas de chapitre suivant
 */
async function ceQuiChange(db, { game, settings, teamType = null }) {
  const plateau = Number(game?.plateau_number) || 0;
  if (plateau < 1 || plateau >= DERNIER_PLATEAU) return null;
  const resolved = resolveTenirSettings(settings, game);
  const [actuels, suivants, cordeeOfferte] = await Promise.all([
    sortsDuPlateau(db, plateau),
    sortsDuPlateau(db, plateau + 1),
    cordeeOfferteAuPlateau(db, plateau + 1),
  ]);
  const { sorts: _codes, ...sorts } = ligneSorts(
    actuels,
    suivants,
    peupleSuivant(plateau, teamType),
    peupleDe(teamType),
  );
  return {
    plateau: plateau + 1,
    lignes: [
      lignePeuple(plateau, teamType),
      sorts,
      lignePlateau(resolved, plateau, { cordeeOfferte }),
    ],
  };
}

module.exports = {
  peupleSuivant,
  lignePeuple,
  ligneSorts,
  lignePlateau,
  sortsDuPlateau,
  ceQuiChange,
};
