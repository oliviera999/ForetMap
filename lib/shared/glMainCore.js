/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/glMainCore.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

/**
 * « Tenir à deux », ensemble unifié (M13) — plusieurs appareils par équipe : **la main** et la
 * **version d'état**. Noyau pur, partagé par le serveur (miroir `lib/shared/glMainCore.js`, la
 * vérité) et par l'écran (qui affiche et grise).
 *
 * - **Version d'état** : chaque équipe en partie porte un compteur qui avance à chaque geste.
 *   Un geste envoie la version vue ; périmée, il est refusé sans perte (`ETAT_PERIME`) et
 *   l'écran se recharge.
 * - **La main** : un geste décisif (répondre, fouiller, faire tenir, préparer un sort) prend la
 *   main pour 60 s au plus. Les autres appareils de l'équipe affichent qui joue et refusent
 *   proprement (`MAIN_AILLEURS`). Une main échue ne compte plus : aucune attente sans sortie.
 * - **Porteur** : l'appareil qui agit — `p:<id>` pour un compte d'élève, `s:<clé>` pour une
 *   tablette d'équipe. Le prof n'a pas de porteur : il n'est jamais retenu par la main.
 */

/** Durée de la main : 60 s au plus. */
const MAIN_DUREE_MS = 60 * 1000;
/** Une demande d'appareil (session d'équipe à accepter) expire seule au bout de deux minutes. */
const DEMANDE_APPAREIL_SECONDES = 120;

const CODE_ETAT_PERIME = 'ETAT_PERIME';
const CODE_MAIN_AILLEURS = 'MAIN_AILLEURS';
const CODE_SPECTATEUR = 'SPECTATEUR';

/** Gestes décisifs : ceux qui prennent la main. */
const GESTES_DE_MAIN = Object.freeze(['repondre', 'fouiller', 'tenir', 'sort']);

const VERBES = Object.freeze({
  repondre: 'répond',
  fouiller: 'fouille',
  tenir: 'fait tenir une page',
  sort: 'prépare un sort',
});

const MESSAGE_ETAT_PERIME = 'L’équipe a déjà joué ce geste. Voici où vous en êtes.';
const MESSAGE_SPECTATEUR =
  'Tu regardes ce tour : tu vois tout, et tu joueras de nouveau au prochain.';

/** Porteur d'un acteur (`lib/glActeur.js`) : `null` pour le prof, la projection, un invité. */
function porteurDe(actor, cleSession = null) {
  if (!actor) return null;
  if (actor.kind === 'player' && Number(actor.playerId) > 0) return `p:${Number(actor.playerId)}`;
  if (actor.kind === 'team' && cleSession) return `s:${String(cleSession)}`;
  return null;
}

/** Identifiant d'élève d'un porteur `p:<id>`, sinon `null` (une tablette n'a pas de nom). */
function joueurDuPorteur(porteur) {
  const m = /^p:(\d+)$/.exec(String(porteur || ''));
  return m ? Number(m[1]) : null;
}

/** Version vue envoyée par l'écran (en-tête ou corps) : entier ≥ 0, ou `null` si absente. */
function lireVersionVue(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** La version vue est-elle périmée ? Une version absente n'est jamais périmée. */
function versionPerimee(vue, courante) {
  return vue != null && Number(vue) !== Number(courante);
}

/**
 * La main encore tenue d'une équipe : `{ holder, geste, expireMs }`, ou `null` si personne ne
 * la tient ou si elle est échue.
 * @param {{ main_holder?: string|null, main_geste?: string|null, main_expire_ms?: number|string|null }} row
 * @param {number} nowMs
 */
function mainTenue(row, nowMs) {
  const holder = row?.main_holder ? String(row.main_holder) : null;
  const expireMs = Number(row?.main_expire_ms);
  if (!holder || !Number.isFinite(expireMs) || expireMs <= Number(nowMs)) return null;
  return { holder, geste: row?.main_geste ? String(row.main_geste) : null, expireMs };
}

/** Ce porteur peut-il agir ? Oui si personne ne tient la main, ou si c'est lui. */
function peutAgir(main, porteur) {
  if (!main) return true;
  return porteur != null && String(main.holder) === String(porteur);
}

/** « Lina répond… » : prénom seul ; une tablette d'équipe n'a pas de nom. */
function texteMain({ prenom = null, geste = null } = {}) {
  const qui = String(prenom || '').trim() || 'Une autre tablette';
  return `${qui} ${VERBES[geste] || 'joue'}…`;
}

/** Refus `MAIN_AILLEURS` : qui joue, et quoi faire. */
function messageMainAilleurs({ prenom = null, geste = null } = {}) {
  return `${texteMain({ prenom, geste })} Attendez la fin de son geste.`;
}

/**
 * Ce que l'écran d'un appareil lit de la main de son équipe.
 * @returns {null | { moi: boolean, geste: string|null, tablette: boolean, prenom: string|null,
 *   texte: string, resteSecondes: number }}
 */
function decrireMain({ main, porteur = null, prenom = null, nowMs }) {
  if (!main) return null;
  const moi = porteur != null && String(main.holder) === String(porteur);
  const tablette = joueurDuPorteur(main.holder) == null;
  const nom = tablette ? null : String(prenom || '').trim() || null;
  return {
    moi,
    geste: main.geste,
    tablette,
    prenom: moi ? null : nom,
    texte: moi ? '' : texteMain({ prenom: nom, geste: main.geste }),
    resteSecondes: Math.max(0, Math.ceil((Number(main.expireMs) - Number(nowMs)) / 1000)),
  };
}

/**
 * Délai de débat (réglage `tenir_delai_debat_secondes`) : secondes qu'il reste avant que le
 * bouton de réponse d'une question de case s'allume.
 */
function resteDeDebat({ delaiSecondes = 0, ecouleMs = 0 } = {}) {
  const delai = Number(delaiSecondes);
  if (!Number.isFinite(delai) || delai <= 0) return 0;
  return Math.max(0, Math.ceil(delai - Math.max(0, Number(ecouleMs) || 0) / 1000));
}

module.exports = {
  MAIN_DUREE_MS,
  DEMANDE_APPAREIL_SECONDES,
  CODE_ETAT_PERIME,
  CODE_MAIN_AILLEURS,
  CODE_SPECTATEUR,
  GESTES_DE_MAIN,
  MESSAGE_ETAT_PERIME,
  MESSAGE_SPECTATEUR,
  porteurDe,
  joueurDuPorteur,
  lireVersionVue,
  versionPerimee,
  mainTenue,
  peutAgir,
  texteMain,
  messageMainAilleurs,
  decrireMain,
  resteDeDebat,
};
