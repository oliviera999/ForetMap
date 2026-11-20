/**
 * « Tenir à deux » — la carte du moment de l'écran d'équipe (chantier « écrans de séance »,
 * étape 4). L'écran ne montre plus tout ce que l'équipe pourrait faire : il montre **une** chose,
 * celle qu'elle a à faire maintenant. Ce module dit laquelle.
 *
 * Fonctions PURES, sans React ni réseau : elles lisent des données déjà servies (droits,
 * tour, chasse) et ne décident d'aucun droit. Un geste fermé par le serveur n'apparaît jamais
 * ici : la carte **cache**, elle n'ouvre rien (`glTenirPermissionsCore` reste la vérité).
 *
 * Textes dits à l'équipe : « vous », jamais « tu » ; aucun mot interdit (`glGardeFousCore`).
 * Ce fichier est relu par `tests/content/gl-adresse-ecran-equipe.test.js`.
 */

import { PHASE_AUCUN_TOUR } from '../constants/tenirPhases.js';
import { TENIR_VERDICT_TEXTES } from '../constants/tenirTextes.js';
import { MESSAGE_SPECTATEUR } from '../../shared/glMainCore.js';
import { numeroCase } from '../../shared/glCaseNumeroCore.js';

/**
 * Les états de la carte du moment, du plus pressant au moins pressant : la carte affiche le
 * **premier vrai**. `camp` passe devant `clos` : une partie close a presque toujours son
 * dernier tour en phase `clos`, et « Ce qui change » ne se verrait jamais sinon.
 */
export const ETATS_DU_MOMENT = Object.freeze([
  'peripetie',
  'main_ailleurs',
  'appareil',
  'question',
  'jet_suspens',
  'saisie_des',
  'jet_attente',
  'retour',
  'geste',
  'joue',
  'souffle',
  'camp',
  'clos',
  'attente',
]);

/** Ordre du gros bouton : le premier geste ouvert de cette liste. */
export const ORDRE_DES_GESTES = Object.freeze(['repondre', 'lancer', 'fouiller', 'lire', 'jeter']);

/** Puces des autres gestes ouverts, sous le gros bouton. */
export const PUCES_MAX = 3;

/** Ce que la carte dit quand il n'y a rien à toucher. */
export const TEXTES_DU_MOMENT = Object.freeze({
  jet_attente: 'Jet saisi : le prof valide.',
  joue: 'Votre tour est joué. Regardez les autres équipes.',
  souffle: 'Le voile avance.',
  camp: 'Vous êtes au camp : le chapitre est terminé.',
  clos: 'Le tour est terminé.',
  ouverture: 'Le tour s’ouvre : à vous de jouer dans un instant.',
  attente: PHASE_AUCUN_TOUR,
});

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * Libellé du bouton d'un geste, et la précision qui l'accompagne (`detail`, ou `null`).
 * `court` est le libellé d'une puce : le bouton en plus petit.
 */
function habillerGeste(m, { des = 2, fouillesRestantes = null, sortsOuverts = false } = {}) {
  const base = { geste: m.geste, role: m.role || null, texte: m.texte || '' };
  switch (m.geste) {
    case 'lancer': {
      const unSeul = Number(des) === 1;
      const libelle = unSeul ? 'Lancer le dé' : 'Lancer les dés';
      return { ...base, libelle, detail: unSeul ? 'Un seul dé ce tour-ci.' : null, court: libelle };
    }
    case 'repondre':
      return { ...base, libelle: 'Répondre à la question', detail: null, court: 'Répondre' };
    case 'fouiller': {
      const n = fouillesRestantes == null ? null : Math.max(0, Number(fouillesRestantes) || 0);
      const detail = n == null ? null : pluriel(n, 'fouille');
      return {
        ...base,
        libelle: 'Fouiller',
        detail,
        court: detail ? `Fouiller · ${detail}` : 'Fouiller',
      };
    }
    case 'lire':
      return { ...base, libelle: 'Lire', detail: m.texte || null, court: 'Lire' };
    case 'jeter': {
      const libelle = sortsOuverts ? 'Fermer les sorts' : 'Jeter un sort';
      return { ...base, libelle, detail: null, court: libelle };
    }
    case 'trame':
      return { ...base, libelle: 'Défis de la Trame', detail: null, court: 'Défis de la Trame' };
    default:
      return { ...base, libelle: m.texte || m.geste, detail: null, court: m.texte || m.geste };
  }
}

/**
 * L'équipe n'a encore fait aucun geste du tour : ni jet, ni fouille. Tant que c'est vrai, la
 * carte propose « Il manque quelqu'un ? » ; ensuite, les présences vivent dans le tiroir.
 * @param {{ aLance?: boolean, fouilles?: { restantes?: number, quota?: number }|null }} p
 */
export function aucunGesteDuTour({ aLance = false, fouilles = null } = {}) {
  if (aLance) return false;
  if (!fouilles || fouilles.quota == null || fouilles.restantes == null) return true;
  return Number(fouilles.restantes) >= Number(fouilles.quota);
}

/**
 * La carte du moment : **un seul** état, le premier vrai de `ETATS_DU_MOMENT`.
 *
 * @param {object} p
 * @param {object|null} [p.peripetie] péripétie de l'équipe non encore passée
 * @param {{ texte?: string }|null} [p.mainAilleurs] un autre appareil de l'équipe tient la main
 * @param {number|Array} [p.appareils] tablettes qui demandent à rejoindre l'équipe
 * @param {boolean} [p.questionCase] une question de case est présentée
 * @param {boolean} [p.questionChasse] une question de page (fouille) est présentée
 * @param {object|null} [p.jetEnSuspens] jet dont la case ne s'est pas encore appliquée
 * @param {boolean} [p.saisieDes] l'équipe a touché « Lancer » : la saisie des dés est ouverte
 * @param {boolean} [p.jetEnAttente] jet saisi, que le prof n'a pas encore validé
 * @param {object|null} [p.retour] retour non acquitté (`retourDuMoment`)
 * @param {Array<{ geste: string, role: string|null, texte: string }>} [p.maintenant]
 *   gestes ouverts à cet instant (`maintenantVousPouvez`, `glSortMomentsCore`)
 * @param {boolean} [p.fouilleMode] le plateau attend un toucher de fouille
 * @param {number|null} [p.fouillesRestantes] fouilles encore possibles ce tour
 * @param {number} [p.des] dés du prochain jet (1 après une case Souffle)
 * @param {boolean} [p.sortsOuverts] la liste des sorts est dépliée
 * @param {string|null} [p.phase] phase du tour (`null` = aucun tour ouvert)
 * @param {boolean} [p.partieFinie] la partie est close (l'équipe est au camp)
 * @param {boolean} [p.spectateur] élève absent du tour ou en retrait : il voit, il ne joue pas
 * @param {boolean} [p.presenceOuverte] l'équipe peut dire qui manque (présences du tour)
 * @param {boolean} [p.aucunGeste] aucun geste joué ce tour (`aucunGesteDuTour`)
 * @returns {{ etat: string, texte: string|null, geste: string|null, role: string|null,
 *   libelle: string|null, detail: string|null, fouille: boolean, sorts: boolean,
 *   presence: boolean, origine: string|null, spectateur: boolean,
 *   puces: Array<{ geste: string, role: string|null, texte: string, libelle: string,
 *   detail: string|null, court: string }> }}
 */
export function momentDeLEquipe({
  peripetie = null,
  mainAilleurs = null,
  appareils = 0,
  questionCase = false,
  questionChasse = false,
  jetEnSuspens = null,
  saisieDes = false,
  jetEnAttente = false,
  retour = null,
  maintenant = [],
  fouilleMode = false,
  fouillesRestantes = null,
  des = 2,
  sortsOuverts = false,
  phase = null,
  partieFinie = false,
  spectateur = false,
  presenceOuverte = false,
  aucunGeste = false,
} = {}) {
  const rien = {
    texte: null,
    geste: null,
    role: null,
    libelle: null,
    detail: null,
    fouille: false,
    sorts: false,
    presence: false,
    origine: null,
    spectateur: false,
    puces: [],
  };
  const dire = (etat, extra = {}) => ({ ...rien, etat, ...extra });
  const habiller = (m) => habillerGeste(m, { des, fouillesRestantes, sortsOuverts });
  const ouverts = (Array.isArray(maintenant) ? maintenant : []).filter((m) => m && m.geste);
  const gestes = ORDRE_DES_GESTES.map((g) => ouverts.find((m) => m.geste === g)).filter(Boolean);
  // Les défis de la Trame ne sont pas un geste du tour : jamais le gros bouton, une puce.
  const trame = ouverts.find((m) => m.geste === 'trame') || null;
  const pucesHorsTour = trame ? [habiller(trame)] : [];
  const nbAppareils = Array.isArray(appareils) ? appareils.length : Number(appareils) || 0;

  if (peripetie) return dire('peripetie');
  if (mainAilleurs) return dire('main_ailleurs', { texte: mainAilleurs.texte || '' });
  if (nbAppareils > 0) return dire('appareil');
  if (questionCase) return dire('question', { origine: 'case' });
  if (questionChasse) return dire('question', { origine: 'chasse' });
  if (jetEnSuspens) return dire('jet_suspens');
  // La saisie ne reste ouverte que tant que le jet est encore permis : un autre appareil de
  // l'équipe a pu lancer entre-temps.
  const lancer = gestes.find((m) => m.geste === 'lancer') || null;
  if (saisieDes && lancer)
    return dire('saisie_des', { geste: 'lancer', role: lancer.role || null });
  if (jetEnAttente) return dire('jet_attente', { texte: TEXTES_DU_MOMENT.jet_attente });
  const fouilleEnCours = fouilleMode && gestes.some((m) => m.geste === 'fouiller');
  // Le geste suivant acquitte le retour : une fouille en cours passe devant lui.
  if (retour && !fouilleEnCours) return dire('retour');
  if (gestes.length) {
    const premier = fouilleEnCours ? gestes.find((m) => m.geste === 'fouiller') : gestes[0];
    const principal = habiller(premier);
    // En fouille, la carte ne dit qu'une chose : « Touchez la carte ».
    const autres = fouilleEnCours
      ? []
      : [...gestes.filter((m) => m !== premier), ...(trame ? [trame] : [])]
          .slice(0, PUCES_MAX)
          .map(habiller);
    return dire('geste', {
      geste: principal.geste,
      role: principal.role,
      texte: principal.texte,
      libelle: principal.libelle,
      detail: principal.detail,
      fouille: fouilleEnCours,
      sorts: !fouilleEnCours && sortsOuverts && gestes.some((m) => m.geste === 'jeter'),
      presence: !fouilleEnCours && presenceOuverte && aucunGeste,
      puces: autres,
    });
  }
  if (phase === 'jeu') {
    return spectateur
      ? dire('joue', { texte: MESSAGE_SPECTATEUR, spectateur: true })
      : dire('joue', { texte: TEXTES_DU_MOMENT.joue });
  }
  if (phase === 'souffle') return dire('souffle', { texte: TEXTES_DU_MOMENT.souffle });
  if (partieFinie) return dire('camp', { texte: TEXTES_DU_MOMENT.camp, puces: pucesHorsTour });
  if (phase === 'clos') return dire('clos', { texte: TEXTES_DU_MOMENT.clos, puces: pucesHorsTour });
  return dire('attente', {
    texte: phase === 'ouverture' ? TEXTES_DU_MOMENT.ouverture : TEXTES_DU_MOMENT.attente,
    puces: pucesHorsTour,
  });
}

/**
 * Le retour à montrer après une fouille ou une question de case : le plus récent des deux.
 * Une fouille qui ouvre une question (`zone`) n'est pas un retour : la question le dit déjà.
 *
 * @param {object} p
 * @param {{ verdict?: string, feedback?: string, piste?: object|null, at?: number }|null}
 *   [p.verdict] dernier verdict de chasse (`useGlChasse.dernierVerdict`)
 * @param {{ texte?: string, at?: number, id?: number|string }|null} [p.caseRetour] retour d'une
 *   question de case ; `id` le distingue d'un autre retour arrivé au même instant
 * @returns {null | { cle: string, origine: 'chasse'|'case', verdict: string|null, texte: string,
 *   piste: object|null }}
 */
export function retourDuMoment({ verdict = null, caseRetour = null } = {}) {
  const candidats = [];
  if (verdict && verdict.verdict && verdict.verdict !== 'zone') {
    const texte = String(verdict.feedback || TENIR_VERDICT_TEXTES[verdict.verdict] || '').trim();
    if (texte) {
      candidats.push({
        cle: `chasse:${verdict.at ?? verdict.verdict}`,
        origine: 'chasse',
        verdict: String(verdict.verdict),
        texte,
        piste: verdict.piste?.texte ? verdict.piste : null,
        at: Number(verdict.at) || 0,
      });
    }
  }
  const texteCase = String(caseRetour?.texte || '').trim();
  if (texteCase) {
    candidats.push({
      cle: `case:${caseRetour.id ?? caseRetour.at ?? texteCase}`,
      origine: 'case',
      verdict: null,
      texte: texteCase,
      piste: null,
      at: Number(caseRetour.at) || 0,
    });
  }
  if (!candidats.length) return null;
  const { at: _at, ...retour } = candidats.reduce((a, b) => (b.at > a.at ? b : a));
  return retour;
}

/**
 * Les bandeaux d'une ligne, au-dessus de la carte du moment : seulement ceux qui sont vrais.
 *
 * @param {object} p
 * @param {string} [p.etatPerime] « L'équipe a déjà joué ce geste. Voici où vous en êtes. »
 * @param {{ name?: string }|null} [p.encordeePar] équipe qui offre sa cordée ce tour
 * @param {boolean} [p.unDe] un seul dé est dû (case Souffle)
 * @param {number|null} [p.desProchainJet] dés du prochain jet (1 = le seul dé est dû ce tour)
 * @param {boolean} [p.enRetrait] l'élève est en retrait jusqu'à la fin du tour
 * @param {boolean} [p.sousVoile] la mascotte de l'équipe est sous le voile
 * @returns {Array<{ cle: string, fort: string|null, texte: string, testId: string }>}
 */
export function bandeauxDuMoment({
  etatPerime = '',
  encordeePar = null,
  unDe = false,
  desProchainJet = null,
  enRetrait = false,
  sousVoile = false,
} = {}) {
  const lignes = [];
  if (etatPerime) {
    lignes.push({
      cle: 'etat_perime',
      fort: null,
      texte: String(etatPerime),
      testId: 'gl-tenir-etat-perime',
    });
  }
  if (encordeePar?.name) {
    lignes.push({
      cle: 'encordee',
      fort: `L’équipe ${encordeePar.name} vous encorde.`,
      texte: 'Le meilleur de vos deux jets vaut pour les deux.',
      testId: 'gl-tenir-encorde',
    });
  }
  if (unDe) {
    lignes.push({
      cle: 'un_de',
      fort: null,
      // Le tour où le seul dé est dû, l'écran le dit au présent.
      texte:
        Number(desProchainJet) === 1
          ? 'Ce tour-ci : un seul dé.'
          : 'Au prochain tour : un seul dé.',
      testId: 'gl-tenir-un-de',
    });
  }
  if (enRetrait) {
    lignes.push({
      cle: 'en_retrait',
      fort: null,
      texte: 'En retrait jusqu’à la fin du tour.',
      testId: 'gl-tenir-en-retrait',
    });
  }
  if (sousVoile) {
    lignes.push({
      cle: 'sous_voile',
      fort: null,
      texte: 'Votre mascotte est sous le voile.',
      testId: 'gl-tenir-sous-voile',
    });
  }
  return lignes;
}

/**
 * La mascotte de l'équipe est-elle sous le voile ? La chasse le dit (`fouilles.sousVoile`) ;
 * à défaut, on compare les rangs (le voile couvre les cases jusqu'à son rang, inclus).
 */
export function estSousVoile({ fouilles = null, pathIndex = null, voilePosition = null } = {}) {
  if (fouilles && fouilles.sousVoile != null) return !!fouilles.sousVoile;
  const pion = Number(pathIndex);
  const voile = Number(voilePosition);
  if (pathIndex == null || voilePosition == null) return false;
  if (!Number.isInteger(pion) || !Number.isInteger(voile) || voile < 0) return false;
  return pion <= voile;
}

/** Pictogramme et mot court d'une case, par type (`event_type`) ou par tonalité. */
const CASES = Object.freeze({
  start: Object.freeze({ icone: '🏁', mot: 'Départ' }),
  question: Object.freeze({ icone: '❓', mot: 'Question' }),
  event: Object.freeze({ icone: '✨', mot: 'Péripétie' }),
  souffle: Object.freeze({ icone: '🌫️', mot: 'Souffle' }),
  trame: Object.freeze({ icone: '🧵', mot: 'Trame' }),
  challenge: Object.freeze({ icone: '🎯', mot: 'Défi' }),
  shortcut: Object.freeze({ icone: '↪️', mot: 'Raccourci' }),
  frontier: Object.freeze({ icone: '🚩', mot: 'Frontière' }),
  finish: Object.freeze({ icone: '⛺', mot: 'Camp' }),
  story: Object.freeze({ icone: '📖', mot: 'Histoire' }),
  narration: Object.freeze({ icone: '📖', mot: 'Récit' }),
});
const CASE_PAR_DEFAUT = Object.freeze({ icone: '📍', mot: 'Étape' });

/** Longueur d'un libellé de case dans une pastille. */
export const LIBELLE_DE_CASE_MAX = 18;

function couper(texte, max) {
  const t = String(texte || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Les cases à venir, en pastilles : numéro humain, pictogramme, libellé court. La tonalité
 * (`trame`, `souffle`) prime sur le type : c'est elle qui dit ce que la case fait.
 *
 * @param {Array<{ index?: number, label?: string|null, eventType?: string, tonalite?: string|null }>}
 *   cases cases servies par `GET /tenir/tour` (`teams[].casesAVenir`)
 * @returns {Array<{ cle: string, numero: number|null, icone: string, libelle: string,
 *   complet: string }>}
 */
export function casesEnPastilles(cases = []) {
  return (Array.isArray(cases) ? cases : []).map((c, i) => {
    const sorte = CASES[String(c?.tonalite || '')] || CASES[String(c?.eventType || '')];
    const { icone, mot } = sorte || CASE_PAR_DEFAUT;
    const complet = String(c?.label || '').trim() || mot;
    return {
      cle: `${c?.index ?? `i${i}`}`,
      numero: numeroCase(c?.index),
      icone,
      libelle: couper(complet, LIBELLE_DE_CASE_MAX),
      complet,
    };
  });
}

/** Longueur d'un pseudo dans une pastille de bourse. */
export const PSEUDO_MAX = 12;

/**
 * Les bourses de l'équipe, une pastille par membre : pseudo coupé à `PSEUDO_MAX` caractères,
 * gemmes servies (`null` quand le serveur les tait : la pastille ne montre alors que le nom).
 *
 * @param {Array<{ playerId?: number, pseudo?: string, firstName?: string, lastName?: string,
 *   powerPoints?: number|null }>} membres membres de l'équipe (`gameState.roster`)
 * @returns {Array<{ id: number|string, nom: string, complet: string, gemmes: number|null }>}
 */
export function boursesDeLEquipe(membres = []) {
  return (Array.isArray(membres) ? membres : []).map((m, i) => {
    const complet =
      String(m?.pseudo || '').trim() ||
      `${m?.firstName || ''} ${m?.lastName || ''}`.trim() ||
      'Élève';
    return {
      id: m?.playerId ?? `m${i}`,
      nom: couper(complet, PSEUDO_MAX),
      complet,
      gemmes: m?.powerPoints == null ? null : Number(m.powerPoints),
    };
  });
}

/**
 * Empreinte de ce que le tiroir « L'équipe » contient : quand elle change alors que le tiroir
 * est fermé, son bouton porte une pastille de nouveauté. Les cases à venir n'y entrent pas
 * (elles changent à chaque jet : la pastille ne s'éteindrait jamais).
 *
 * @param {object} p
 * @param {{ pages?: Array<{ zoneKey?: string, etat?: string }> }|null} [p.carnet]
 * @param {{ power?: number }|null} [p.reserve] réserve de la caravane
 * @param {Array<number>} [p.absents] membres déclarés absents ce tour
 * @param {number} [p.defis] défis à préparer (quand le compte est connu)
 * @returns {string}
 */
export function empreinteDuTiroir({ carnet = null, reserve = null, absents = [], defis = 0 } = {}) {
  const pages = (carnet?.pages || []).map((p) => `${p.zoneKey ?? ''}=${p.etat ?? ''}`).join(',');
  const manquants = [...(Array.isArray(absents) ? absents : [])].map(Number).sort((a, b) => a - b);
  return [
    `pages:${pages}`,
    `reserve:${reserve?.power ?? ''}`,
    `absents:${manquants.join(',')}`,
    `defis:${Number(defis) || 0}`,
  ].join('|');
}
