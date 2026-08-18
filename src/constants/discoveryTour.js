/**
 * Contenu du mode visite/découverte ForetMap.
 *
 * À la première ouverture d'un onglet, ses éléments sont présentés « petit à petit »
 * via une séquence d'étapes (coach marks). Chaque parcours peut être relancé à tout
 * moment depuis le bouton d'aide « ? » de la page (cf. `HelpPanel`).
 *
 * Les clés correspondent aux identifiants d'onglet (`tab`) ET aux `sectionId` des
 * panneaux d'aide, afin que l'auto-démarrage par onglet et la relance manuelle
 * partagent la même définition.
 *
 * Structure d'une étape :
 *   - `key`      : identifiant stable de l'étape **dans son parcours**. Sert de clé de
 *     surcharge éditoriale (voir plus bas) : le renommer perd les textes déjà saisis.
 *   - `target`   : sélecteur CSS de l'élément à mettre en lumière (`null` => carte centrée).
 *   - `title`    : titre court de l'étape.
 *   - `body`     : texte affiché (élève par défaut).
 *   - `bodyTeacher` (optionnel) : texte alternatif pour le mode prof (n3boss).
 *   - `placement` (optionnel) : 'top' | 'bottom' | 'left' | 'right' | 'center' | 'auto'.
 *   - `role`     (optionnel) : 'teacher' | 'student' pour limiter l'étape à un rôle.
 *   - `expression` (optionnel) : expression du narrateur (`src/utils/mascotExpressions.js`,
 *     cf. `docs/MASCOT_NARRATEUR_OLU.md` §4.3). Absente ou inconnue => `neutre`.
 *
 * Une étape dont la cible est absente du DOM au démarrage est ignorée : le parcours
 * ne montre que ce qui figure réellement à l'écran.
 *
 * **Surcharge éditoriale.** La structure (cibles, placements, rôles) reste du code ;
 * seuls les trois champs de texte sont éditables depuis l'application, par clé plate
 * `<parcours>.<étape>.<champ>` (`content.tour.registry`, cf. `lib/tourContent.js`).
 * `applyTourOverrides()` applique ces textes à la volée, sans jamais toucher la
 * structure : une surcharge ne peut donc pas faire disparaître une étape.
 */

import { resolveMascotExpression } from '../utils/mascotExpressions.js';

// Sélecteurs génériques stables, présents quel que soit l'onglet.
const ACTIVE_NAV = '.nav-btn.active, .top-tab.active';
const HELP_BTN = '.fm-help-btn';

/**
 * Étape « relance » commune : rappelle où relancer la visite.
 *
 * ⚠️ Objet **partagé par référence** par les 13 parcours : son texte doit fonctionner
 * partout, quel que soit l'onglet. Ne pas le dupliquer pour l'adapter à un parcours.
 */
const RELAUNCH_STEP = {
  key: 'relaunch',
  target: HELP_BTN,
  title: 'Rejouer la visite',
  body: 'Si tu me perds en route, ce « ? » me rappelle. Autant de fois que tu veux — je ne compte pas.',
  bodyTeacher:
    'Ce « ? » rouvre l’aide de la page et relance la visite guidée. Pratique en début de séance, quand la moitié de la classe découvre l’écran.',
  placement: 'auto',
  expression: 'complice',
};

const DISCOVERY_TOURS = {
  map: {
    title: 'Découverte · Carte',
    steps: [
      {
        key: 'intro',
        target: ACTIVE_NAV,
        title: 'La carte de la forêt',
        body: 'Voilà la carte. Je l’ai arpentée dans tous les sens et je m’y perds encore une fois sur deux — mais avec beaucoup d’assurance.',
        bodyTeacher:
          'Voilà la carte. Les zones et les repères que tu poses ici, c’est le terrain de jeu des n3beurs — et le mien, accessoirement.',
        placement: 'auto',
        expression: 'parle',
      },
      {
        key: 'switch',
        target: '.map-switch-inline, .map-switch-select',
        title: 'Changer de carte',
        body: 'Il y a plusieurs cartes. Ce sélecteur choisit laquelle on explore aujourd’hui : je suis partant pour n’importe laquelle.',
        placement: 'auto',
        expression: 'montre',
      },
      {
        key: 'toolbar',
        target: '.map-view-toolbar',
        title: 'La barre d’outils',
        body: 'Zoom, étiquettes, gestes : je règle ma vue ici avant de partir. J’ai découvert un framboisier entier en zoomant, un jour où je cherchais tout autre chose.',
        bodyTeacher:
          'Les modes Zone et Repère servent à construire le terrain. Le verrou, lui, évite de déplacer un repère en voulant juste zoomer — ça n’arrive qu’aux autres, évidemment.',
        placement: 'bottom',
        expression: 'montre',
      },
      {
        key: 'sheet',
        target: null,
        title: 'Ouvre une fiche',
        body: 'Clique une zone ou un repère : sa fiche dit quoi observer, et quoi y faire. Ce que tu notes aujourd’hui, quelqu’un le lira quand tu auras quitté ce lycée. Ça me retourne à chaque fois — alors prends deux minutes de plus.',
        placement: 'center',
        expression: 'grave',
      },
      RELAUNCH_STEP,
    ],
  },
  tasks: {
    title: 'Découverte · Tâches',
    steps: [
      {
        key: 'intro',
        target: ACTIVE_NAV,
        title: 'Les tâches',
        body: 'Ici, tout ce qu’il y a à faire dehors. Je lis cette liste chaque matin : c’est comme ça que je choisis où je vais.',
        bodyTeacher:
          'Tout passe par ici : créer, suivre, valider. Je surveille qui s’est inscrit et quand — discrètement, promis.',
        placement: 'auto',
        expression: 'parle',
      },
      {
        key: 'filters',
        target: '.section-title',
        title: 'Filtrer et trier',
        body: 'Filtre par carte ou par groupe. Une liste entière, ça décourage ; une liste qui te concerne, ça se lit en dix secondes chrono.',
        bodyTeacher:
          'Carte, groupe, statut. Attaque par les retours en attente : il y a quelqu’un derrière, qui rafraîchit sa page depuis hier.',
        placement: 'bottom',
        expression: 'montre',
      },
      {
        key: 'take',
        target: null,
        title: 'Prendre une tâche',
        body: 'Lis la consigne, inscris-toi seulement si tu peux vraiment y aller, puis envoie un retour avec une photo. Une tâche prise et jamais faite, c’est un arbre qui attend son eau pendant que tout le monde croit la question réglée. Aucune honte à ne pas s’inscrire — la honte, c’est pour l’arbre.',
        bodyTeacher:
          'Duplique les missions répétitives plutôt que de tout retaper. Et valide vite : un retour validé trois semaines après, ça fait moins d’effet qu’on croit.',
        placement: 'center',
        expression: 'grave',
      },
      RELAUNCH_STEP,
    ],
  },
  plants: {
    title: 'Découverte · Biodiversité',
    steps: [
      {
        key: 'intro',
        target: ACTIVE_NAV,
        title: 'La base biodiversité',
        body: 'Toutes les espèces du site : plantes, animaux, champignons. J’en ai croisé un paquet, et il en reste que personne n’a notées — dont un champignon qui me fixe depuis deux semaines.',
        bodyTeacher:
          'C’est toi qui remplis la base : créer, corriger, compléter. Moi je m’en sers dehors, et je repère très vite les fiches qui manquent.',
        placement: 'auto',
        expression: 'parle',
      },
      {
        key: 'search',
        target: '.section-title',
        title: 'Chercher une espèce',
        body: 'Cherche par nom ou par groupe, puis ouvre la fiche. Un noyer met quarante ans à donner sa pleine récolte : celui que tu notes aujourd’hui nourrira quelqu’un que tu ne rencontreras jamais. Ça me fait quelque chose à chaque fois — alors soigne ta fiche, l’inconnu compte sur toi.',
        bodyTeacher:
          'Recherche par nom ou par groupe. Pour une fiche neuve, la pré-saisie et Pl@ntNet font le gros du travail — je vérifie quand même sur place : eux confondent l’ortie, moi je la sens passer.',
        placement: 'bottom',
        expression: 'grave',
      },
      RELAUNCH_STEP,
    ],
  },
  visit: {
    title: 'Découverte · Visite',
    steps: [
      {
        key: 'intro',
        target: ACTIVE_NAV,
        title: 'Le mode visite',
        body: 'Le mode visite, c’est la promenade guidée : une mascotte t’accompagne de lieu en lieu. Je connais le chemin par cœur et je le refais quand même — c’est dire s’il est bien.',
        bodyTeacher:
          'C’est le parcours que verront les visiteurs. Choisis les repères et les tutoriels vraiment utiles : au-delà, la promenade se transforme en randonnée.',
        placement: 'auto',
        expression: 'parle',
      },
      {
        key: 'progress',
        target: null,
        title: 'Avance dans la visite',
        body: 'Clique les zones et les repères, coche ce que tu as vu — je tiens le compte. Un jardin ne se visite jamais deux fois à l’identique : ce que tu regardes aujourd’hui aura changé au printemps.',
        bodyTeacher:
          '« Aperçu comme élève » montre exactement ce que verra un n3beur. À regarder avant la sortie : sur le terrain, il est un peu tard pour corriger une faute de frappe.',
        placement: 'center',
        expression: 'cherche',
      },
      RELAUNCH_STEP,
    ],
  },
  stats: {
    title: 'Découverte · Statistiques',
    steps: [
      {
        key: 'intro',
        target: ACTIVE_NAV,
        title: 'Tes statistiques',
        body: 'Le relevé de ce que tu as fait, semaine après semaine. Des chiffres, pas un jugement — et personne n’a jamais trouvé sa propre courbe ennuyeuse !',
        bodyTeacher:
          'L’avancement des n3beurs et la comparaison des groupes. Un chiffre bas dit rarement pourquoi il est bas : va voir la personne, c’est plus fiable qu’un graphique.',
        placement: 'auto',
        expression: 'content',
      },
      RELAUNCH_STEP,
    ],
  },
  quiz: {
    title: 'Découverte · Quiz',
    steps: [
      {
        key: 'intro',
        target: ACTIVE_NAV,
        title: 'Les quiz',
        body: 'Des questions sur la forêt comestible. Se tromper ici ne coûte rien — c’est le seul endroit du site où l’erreur n’a strictement aucune conséquence, profites-en.',
        bodyTeacher:
          'Les quiz servent à réviser, et leurs réponses montrent où ça coince. Une question ratée par toute la classe en dit plus long sur la question que sur la classe.',
        placement: 'auto',
        expression: 'parle',
      },
      RELAUNCH_STEP,
    ],
  },
  glossary: {
    title: 'Découverte · Glossaire',
    steps: [
      {
        key: 'intro',
        target: ACTIVE_NAV,
        title: 'Le glossaire',
        body: 'Les mots de la permaculture et de l’écologie, expliqués sans détour. Certains sonnent très savants et désignent des choses toutes simples — « mycorhize », par exemple.',
        placement: 'auto',
        expression: 'parle',
      },
      RELAUNCH_STEP,
    ],
  },
  foodweb: {
    title: 'Découverte · Réseau trophique',
    steps: [
      {
        key: 'intro',
        target: ACTIVE_NAV,
        title: 'Le réseau trophique',
        body: 'Qui mange qui : chaque trait est un lien réel entre deux espèces d’ici. La première fois que j’ai vu la toile entière, je suis resté un bon moment devant — retire un fil et tout le reste bouge. Regarde qui tient à quoi avant de décider ce qui est utile.',
        placement: 'auto',
        expression: 'grave',
      },
      RELAUNCH_STEP,
    ],
  },
  notebook: {
    title: 'Découverte · Carnet',
    steps: [
      {
        key: 'intro',
        target: ACTIVE_NAV,
        title: 'Ton carnet d’observations',
        body: 'Note et photographie ce que tu vois, même ce qui te paraît banal. Le banal d’aujourd’hui, c’est la donnée de dans dix ans, et personne ne sait à l’avance ce qui comptera. J’ai rempli trois carnets comme ça — dont un que j’ai fait tomber dans la mare.',
        placement: 'auto',
        expression: 'grave',
      },
      RELAUNCH_STEP,
    ],
  },
  forum: {
    title: 'Découverte · Forum',
    steps: [
      {
        key: 'intro',
        target: ACTIVE_NAV,
        title: 'Le forum',
        body: 'Questions, idées, coups de main. Poser une question qu’on croit bête fait gagner du temps à quatre personnes qui n’osaient pas — j’ai longtemps été les quatre personnes.',
        placement: 'auto',
        expression: 'parle',
      },
      RELAUNCH_STEP,
    ],
  },
  tuto: {
    title: 'Découverte · Tutoriels',
    steps: [
      {
        key: 'intro',
        target: ACTIVE_NAV,
        title: 'Les tutoriels',
        body: 'Des guides pratiques, en vidéo ou en fiche, pour les gestes qui s’apprennent mieux en regardant qu’en lisant. Regarde deux fois avant de couper : la branche, elle, ne repousse pas sur commande.',
        bodyTeacher:
          'Crée, importe et range les tutoriels, puis rattache-les aux tâches et aux repères. Un tuto rattaché arrive pile au bon moment ; un tuto orphelin ne sert qu’à celui qui l’a écrit.',
        placement: 'auto',
        expression: 'parle',
      },
      RELAUNCH_STEP,
    ],
  },
  profiles: {
    title: 'Découverte · Profils',
    steps: [
      {
        key: 'intro',
        target: ACTIVE_NAV,
        title: 'Profils et comptes',
        body: 'Les comptes, les rôles et les permissions se tiennent ici. C’est la page qui décide qui peut quoi — la seule où je ne fais pas le malin.',
        bodyTeacher:
          'Comptes, rôles, permissions, et le profil rattaché à chacun. Donner un droit prend trois secondes ; comprendre six mois plus tard pourquoi quelqu’un l’a, beaucoup plus longtemps. Note-le quelque part.',
        placement: 'auto',
        role: 'teacher',
        expression: 'vigilant',
      },
      RELAUNCH_STEP,
    ],
  },
  settings: {
    title: 'Découverte · Paramètres',
    steps: [
      {
        key: 'intro',
        target: ACTIVE_NAV,
        title: 'Les paramètres',
        body: 'Les modules s’allument et s’éteignent ici, et le reste se règle autour. Coupe ce qui ne sert pas à ta classe : je n’ai jamais vu personne se plaindre d’un menu trop court.',
        placement: 'auto',
        role: 'teacher',
        expression: 'vigilant',
      },
      RELAUNCH_STEP,
    ],
  },
};

/** Texte d'une étape selon le rôle (prof si dispo, sinon élève). */
export function resolveDiscoveryBody(step, isTeacher) {
  if (!step) return '';
  if (isTeacher && step.bodyTeacher) return step.bodyTeacher;
  return step.body || '';
}

/**
 * Expression du narrateur pour une étape. Une étape sans `expression` — ou portant
 * une valeur inconnue — retombe sur `neutre` : le portrait n'est jamais une
 * dépendance du parcours.
 * @returns {string} expression canonique
 */
export function resolveDiscoveryExpression(step) {
  return resolveMascotExpression(step?.expression);
}

/** Champs de parcours ouverts à l'édition depuis l'application. */
export const TOUR_EDITABLE_FIELDS = ['title', 'body', 'bodyTeacher'];

/**
 * Parcours fictif sous lequel se range l'étape de relance.
 *
 * `RELAUNCH_STEP` est un objet **partagé par les 13 parcours** : lui donner une clé
 * par parcours laisserait croire qu'on peut l'adapter à un onglet, alors que la
 * modification vaudrait partout. Une seule clé, un seul texte, aucune ambiguïté.
 */
export const SHARED_TOUR_KEY = 'commun';

/** Clé plate de surcharge d'un champ d'étape (`<parcours>.<étape>.<champ>`). */
export function tourOverrideKey(tabKey, step, field) {
  const scope = step?.key === RELAUNCH_STEP.key ? SHARED_TOUR_KEY : tabKey;
  return `${scope}.${step?.key || ''}.${field}`;
}

/**
 * Applique les surcharges éditoriales à une liste d'étapes.
 *
 * Ne recopie que les trois champs de texte : la structure (`target`, `placement`,
 * `role`, `expression`) reste celle du code, de sorte qu'une saisie malheureuse ne
 * puisse pas faire disparaître une étape ni déplacer une bulle. Une valeur vide ou
 * blanche est ignorée — vider un champ revient donc à **revenir au défaut**, ce qui
 * est la seule interprétation sûre pour un parcours (une bulle sans texte n'a pas
 * de sens, contrairement à une ligne d'aide qu'on peut vouloir masquer).
 *
 * Les étapes ne sont jamais mutées : `RELAUNCH_STEP` est partagé, l'écrire en place
 * contaminerait les 13 parcours pour la durée de la session.
 */
export function applyTourOverrides(steps, tabKey, overrides) {
  if (!overrides || typeof overrides !== 'object') return steps;
  return steps.map((step) => {
    let patched = null;
    for (const field of TOUR_EDITABLE_FIELDS) {
      const value = overrides[tourOverrideKey(tabKey, step, field)];
      if (typeof value !== 'string' || !value.trim()) continue;
      // `bodyTeacher` absent du défaut reste absent : le surcharger créerait un texte
      // prof là où le parcours n'en prévoit pas, sans que personne l'ait décidé.
      if (field === 'bodyTeacher' && step.bodyTeacher === undefined) continue;
      if (!patched) patched = { ...step };
      patched[field] = value.trim();
    }
    return patched || step;
  });
}

/**
 * Étapes du parcours d'un onglet, filtrées par rôle et surchargées si besoin.
 * @param {Object} [overrides] registre `content.tour.registry` (clés plates).
 * @returns {Array} étapes (le filtrage par présence DOM est fait au démarrage).
 */
export function getDiscoverySteps(tabKey, isTeacher = false, overrides = null) {
  const tour = DISCOVERY_TOURS[tabKey];
  if (!tour || !Array.isArray(tour.steps)) return [];
  const steps = tour.steps.filter((step) => {
    if (!step.role) return true;
    return step.role === (isTeacher ? 'teacher' : 'student');
  });
  return applyTourOverrides(steps, tabKey, overrides);
}

/** Indique s'il existe un parcours de découverte pour cet onglet/section. */
export function hasDiscoveryTour(tabKey, isTeacher = false) {
  return getDiscoverySteps(tabKey, isTeacher).length > 0;
}

export { DISCOVERY_TOURS, RELAUNCH_STEP };
