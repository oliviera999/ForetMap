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
 *   - `target`   : sélecteur CSS de l'élément à mettre en lumière (`null` => carte centrée).
 *   - `title`    : titre court de l'étape.
 *   - `body`     : texte affiché (élève par défaut).
 *   - `bodyTeacher` (optionnel) : texte alternatif pour le mode prof (n3boss).
 *   - `placement` (optionnel) : 'top' | 'bottom' | 'left' | 'right' | 'center' | 'auto'.
 *   - `role`     (optionnel) : 'teacher' | 'student' pour limiter l'étape à un rôle.
 *
 * Une étape dont la cible est absente du DOM au démarrage est ignorée : le parcours
 * ne montre que ce qui figure réellement à l'écran.
 */

// Sélecteurs génériques stables, présents quel que soit l'onglet.
const ACTIVE_NAV = '.nav-btn.active, .top-tab.active';
const HELP_BTN = '.fm-help-btn';

/** Étape « relance » commune : rappelle où relancer la visite. */
const RELAUNCH_STEP = {
  target: HELP_BTN,
  title: 'Rejouer la visite',
  body: 'Besoin d’un rappel ? Ce bouton « ? » rouvre l’aide et permet de relancer cette visite quand tu veux.',
  bodyTeacher:
    'Ce bouton « ? » rouvre l’aide de la page et permet de relancer cette visite guidée à tout moment.',
  placement: 'auto',
};

const DISCOVERY_TOURS = {
  map: {
    title: 'Découverte · Carte',
    steps: [
      {
        target: ACTIVE_NAV,
        title: 'La carte de la forêt',
        body: 'Bienvenue sur la carte ! C’est ici que tu explores les zones et les repères du verger-forêt.',
        bodyTeacher:
          'Voici la carte. Tu y crées et organises les zones et repères que les n3beurs vont explorer.',
        placement: 'auto',
      },
      {
        target: '.map-switch-inline, .map-switch-select',
        title: 'Changer de carte',
        body: 'Plusieurs cartes existent : utilise ce sélecteur pour passer de l’une à l’autre.',
        placement: 'auto',
      },
      {
        target: '.map-view-toolbar',
        title: 'La barre d’outils',
        body: 'Zoom, étiquettes et gestes tactiles se règlent ici pour adapter la carte à ton écran.',
        bodyTeacher:
          'Barre d’outils : modes Zone et Repère pour construire le terrain, zoom, étiquettes et verrou des repères.',
        placement: 'bottom',
      },
      {
        target: null,
        title: 'Ouvre une fiche',
        body: 'Clique une zone ou un repère sur la carte : sa fiche t’explique quoi observer et quoi y faire.',
        placement: 'center',
      },
      RELAUNCH_STEP,
    ],
  },
  tasks: {
    title: 'Découverte · Tâches',
    steps: [
      {
        target: ACTIVE_NAV,
        title: 'Les tâches',
        body: 'Cet onglet liste les missions à réaliser sur le terrain.',
        bodyTeacher: 'Cet onglet centralise les missions : création, suivi et validation.',
        placement: 'auto',
      },
      {
        target: '.section-title',
        title: 'Filtrer et trier',
        body: 'Filtre les tâches par carte ou par groupe pour ne voir que ce qui te concerne.',
        bodyTeacher:
          'Filtre par carte, groupe ou statut pour traiter en priorité les retours en attente de validation.',
        placement: 'bottom',
      },
      {
        target: null,
        title: 'Prendre une tâche',
        body: 'Lis la consigne, inscris-toi quand tu peux la faire, puis envoie un retour (texte + photo) une fois terminé.',
        bodyTeacher:
          'Côté n3boss : duplique les missions répétitives et valide les retours dès qu’ils arrivent.',
        placement: 'center',
      },
      RELAUNCH_STEP,
    ],
  },
  plants: {
    title: 'Découverte · Biodiversité',
    steps: [
      {
        target: ACTIVE_NAV,
        title: 'La base biodiversité',
        body: 'Retrouve ici toutes les espèces (plantes, animaux, champignons…) du site.',
        bodyTeacher:
          'Base biodiversité : c’est ici que tu enrichis et tiens à jour les fiches espèces.',
        placement: 'auto',
      },
      {
        target: '.section-title',
        title: 'Chercher une espèce',
        body: 'Cherche un être vivant par nom ou par groupe, puis ouvre sa fiche pour les infos de terrain.',
        bodyTeacher:
          'Recherche par nom ou groupe. La pré-saisie et Pl@ntNet aident à compléter une nouvelle fiche.',
        placement: 'bottom',
      },
      RELAUNCH_STEP,
    ],
  },
  visit: {
    title: 'Découverte · Visite',
    steps: [
      {
        target: ACTIVE_NAV,
        title: 'Le mode visite',
        body: 'Le mode visite te guide pas à pas sur le terrain, accompagné d’une mascotte.',
        bodyTeacher:
          'Le mode visite propose un parcours guidé. Sélectionne les tutoriels et repères utiles à la sortie.',
        placement: 'auto',
      },
      {
        target: null,
        title: 'Avance dans la visite',
        body: 'Clique les zones et repères pour ouvrir leurs fiches, et coche ce que tu as déjà vu : ta progression se met à jour.',
        bodyTeacher:
          'Utilise « Aperçu comme élève » pour vérifier exactement ce que les n3beurs verront sur le terrain.',
        placement: 'center',
      },
      RELAUNCH_STEP,
    ],
  },
  stats: {
    title: 'Découverte · Statistiques',
    steps: [
      {
        target: ACTIVE_NAV,
        title: 'Tes statistiques',
        body: 'Suis ta progression et tes contributions au fil du temps.',
        bodyTeacher:
          'Tableau de bord collectif : suis l’avancement des n3beurs et compare les groupes.',
        placement: 'auto',
      },
      RELAUNCH_STEP,
    ],
  },
  quiz: {
    title: 'Découverte · Quiz',
    steps: [
      {
        target: ACTIVE_NAV,
        title: 'Les quiz',
        body: 'Teste tes connaissances sur la forêt comestible avec des questions ludiques.',
        bodyTeacher: 'Les quiz permettent de réviser. Tu peux suivre les réponses des n3beurs.',
        placement: 'auto',
      },
      RELAUNCH_STEP,
    ],
  },
  glossary: {
    title: 'Découverte · Glossaire',
    steps: [
      {
        target: ACTIVE_NAV,
        title: 'Le glossaire',
        body: 'Tous les mots clés de la permaculture et de l’écologie, expliqués simplement.',
        placement: 'auto',
      },
      RELAUNCH_STEP,
    ],
  },
  foodweb: {
    title: 'Découverte · Réseau trophique',
    steps: [
      {
        target: ACTIVE_NAV,
        title: 'Le réseau trophique',
        body: 'Visualise qui mange qui : les liens entre les espèces du site forment une grande toile.',
        placement: 'auto',
      },
      RELAUNCH_STEP,
    ],
  },
  notebook: {
    title: 'Découverte · Carnet',
    steps: [
      {
        target: ACTIVE_NAV,
        title: 'Ton carnet d’observations',
        body: 'Note et photographie ce que tu observes sur le terrain : ton carnet garde une trace de tes découvertes.',
        placement: 'auto',
      },
      RELAUNCH_STEP,
    ],
  },
  forum: {
    title: 'Découverte · Forum',
    steps: [
      {
        target: ACTIVE_NAV,
        title: 'Le forum',
        body: 'Échange avec les autres : questions, idées et entraide autour du projet.',
        placement: 'auto',
      },
      RELAUNCH_STEP,
    ],
  },
  tuto: {
    title: 'Découverte · Tutoriels',
    steps: [
      {
        target: ACTIVE_NAV,
        title: 'Les tutoriels',
        body: 'Des guides pratiques (vidéos, fiches) pour apprendre les bons gestes.',
        bodyTeacher:
          'Crée, importe et range les tutoriels, puis associe-les aux tâches et aux repères.',
        placement: 'auto',
      },
      RELAUNCH_STEP,
    ],
  },
  profiles: {
    title: 'Découverte · Profils',
    steps: [
      {
        target: ACTIVE_NAV,
        title: 'Profils et comptes',
        body: 'Gère les comptes, les rôles (RBAC) et les permissions des utilisateurs.',
        bodyTeacher:
          'Gère les comptes, rôles et permissions, et rattache un profil à chaque utilisateur.',
        placement: 'auto',
        role: 'teacher',
      },
      RELAUNCH_STEP,
    ],
  },
  settings: {
    title: 'Découverte · Paramètres',
    steps: [
      {
        target: ACTIVE_NAV,
        title: 'Les paramètres',
        body: 'Active ou désactive les modules et personnalise le comportement de l’application.',
        placement: 'auto',
        role: 'teacher',
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
 * Étapes du parcours d'un onglet, filtrées par rôle.
 * @returns {Array} étapes (le filtrage par présence DOM est fait au démarrage).
 */
export function getDiscoverySteps(tabKey, isTeacher = false) {
  const tour = DISCOVERY_TOURS[tabKey];
  if (!tour || !Array.isArray(tour.steps)) return [];
  return tour.steps.filter((step) => {
    if (!step.role) return true;
    return step.role === (isTeacher ? 'teacher' : 'student');
  });
}

/** Indique s'il existe un parcours de découverte pour cet onglet/section. */
export function hasDiscoveryTour(tabKey, isTeacher = false) {
  return getDiscoverySteps(tabKey, isTeacher).length > 0;
}

/** Titre lisible du parcours d'un onglet. */
export function getDiscoveryTourTitle(tabKey) {
  return DISCOVERY_TOURS[tabKey]?.title || 'Visite guidée';
}

export { DISCOVERY_TOURS };
