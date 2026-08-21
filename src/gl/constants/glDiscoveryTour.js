/**
 * Contenu des **visites guidées de Gnomes & Licornes**.
 *
 * Pendant GL de `src/constants/discoveryTour.js` : mêmes règles (filtrage par rôle,
 * surcharges éditoriales, étape partagée), même moteur (`useGuidedTour`), même overlay
 * (`GuidedTourOverlay`) — seul le contenu diffère. Voir `docs/MASCOT_NARRATEUR_OLU.md`
 * §8.4 pour la voix : OLU parle **du** jeu, jamais **dans** le jeu. Aucune étape ne
 * raconte le lore, ne prend parti entre les deux peuples, ni ne dévoile un contenu.
 *
 * ⚠️ Les `target` sont des **ancres** : les renommer sans mettre à jour ce fichier fait
 * disparaître l'étape en silence (le moteur écarte les cibles absentes du DOM). Ne
 * viser que des sélecteurs structurels — bandeau, navigation, conteneur d'onglet —
 * jamais une classe de style susceptible de bouger à la prochaine retouche.
 *
 * `role: 'teacher'` = MJ ou admin, par cohérence avec le moteur partagé.
 */

/** Étape finale commune à tous les parcours : où retrouver OLU ensuite. */
export const GL_RELAUNCH_STEP = Object.freeze({
  key: 'relaunch',
  title: 'Je reste dans le coin',
  body: 'Ce « ? » me rappelle, sur n’importe quel onglet. Je ne suis jamais loin — c’est un peu ma spécialité.',
  target: '.gl-help-btn',
  placement: 'left',
  expression: 'complice',
});

/**
 * **Accueil — première connexion.** OLU se présente, dit ce qu'est le jeu, puis s'efface.
 *
 * Aucune étape ne vise d'élément : les bulles s'affichent au centre (le moteur conserve
 * les étapes sans `target`). C'est voulu — à la première seconde, désigner un bouton
 * qu'on n'a pas encore appris à lire ne veut rien dire.
 *
 * Trois bulles, pas davantage : ce qui suit, c'est le jeu qui l'apprend. Rangé sous la
 * clé `welcome`, il ne se déclenche donc jamais par la navigation entre onglets.
 */
export const GL_WELCOME_TOUR_KEY = 'welcome';

export const GL_DISCOVERY_TOURS = Object.freeze({
  [GL_WELCOME_TOUR_KEY]: {
    title: 'Accueil · Première connexion',
    steps: [
      {
        key: 'hello',
        title: 'Salut, moi c’est OLU',
        body: 'Renard, explorateur, et accessoirement guide. J’ai traversé le seuil sans y prendre de forme — je passe, je regarde, je note.',
        bodyTeacher:
          'Salut. Je suis OLU : j’accompagne les élèves dans le jeu, et je vous laisse la table.',
        target: null,
        placement: 'center',
        expression: 'content',
      },
      {
        key: 'what',
        title: 'Ce qui t’attend',
        body: 'Un royaume à parcourir en équipe, des feuillets à retrouver, un carnet à remplir. L’histoire, elle, je te laisse la découvrir — ce n’est pas la mienne à raconter.',
        bodyTeacher:
          'Les équipes parcourent le royaume, retrouvent des feuillets et réécrivent le carnet. Vous menez la partie depuis la console.',
        target: null,
        placement: 'center',
        expression: 'parle',
      },
      {
        key: 'where',
        title: 'Si tu me cherches',
        body: 'Le « ? » de chaque page me rappelle, et je te fais le tour de l’onglet où tu es. Rien à retenir maintenant.',
        bodyTeacher:
          'Le « ? » de chaque page rouvre l’aide et relance la visite de l’onglet affiché.',
        target: null,
        placement: 'center',
        expression: 'complice',
      },
    ],
  },

  discovery: {
    title: 'Découverte',
    steps: [
      {
        key: 'intro',
        title: 'Le plateau de démonstration',
        body: 'Tu peux tout ouvrir ici, rien n’est cassable. C’est fait pour tâtonner — je ne regarde même pas.',
        bodyTeacher:
          'Le plateau de démonstration, ouvert aux invités. Rien de ce qui s’y passe ne touche une partie.',
        target: '.gl-main-inner',
        placement: 'center',
        expression: 'complice',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  nature: {
    title: 'La nature',
    steps: [
      {
        key: 'intro',
        title: 'Trois entrées, un même endroit',
        body: 'Les écosystèmes du chapitre, les espèces qui y vivent, et le glossaire qui explique les mots. Commence par ce qui t’intrigue.',
        bodyTeacher:
          'Écosystèmes, espèces et glossaire du chapitre. Le conditionnement par QCM, s’il est actif, s’applique aux fiches d’ici.',
        target: '.gl-main-inner',
        placement: 'center',
        expression: 'cherche',
      },
      {
        key: 'appris',
        title: 'Marquer comme appris',
        body: 'Quand une fiche est claire pour toi, dis-le : elle rejoint ta progression. Parfois un petit quiz vérifie au passage.',
        bodyTeacher:
          'Le marquage « appris » alimente la progression et peut déclencher l’attribution d’un feuillet.',
        target: '.gl-main-inner',
        placement: 'bottom',
        expression: 'content',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  'monde-gl': {
    title: 'Le monde G&L',
    steps: [
      {
        key: 'intro',
        title: 'Le monde, pas la partie',
        body: 'L’introduction, les règles, le lexique du récit et les tutoriels. C’est ce qu’on lit au calme, en dehors d’une séance.',
        target: '.gl-main-inner',
        placement: 'center',
        expression: 'parle',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  'my-journal': {
    title: 'Mon journal',
    steps: [
      {
        key: 'intro',
        title: 'Ton carnet à toi',
        body: 'Ce que tu ajoutes ici t’appartient : tes notes, tes trouvailles, dans l’ordre que tu veux. Ça s’enregistre tout seul.',
        bodyTeacher:
          'Le carnet personnel de chaque élève. Consultable en lecture depuis les statistiques, et exportable.',
        target: '.gl-main-inner',
        placement: 'center',
        expression: 'content',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  forum: {
    title: 'Le forum',
    steps: [
      {
        key: 'intro',
        title: 'Poser, partager, s’organiser',
        body: 'Une question, une trouvaille, un plan d’équipe. Ce que tu écris est lu par la classe — et par le MJ.',
        bodyTeacher: 'Les échanges de la classe, lisibles par vous, et conservés après la séance.',
        target: '.gl-main-inner',
        placement: 'center',
        expression: 'parle',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  stats: {
    title: 'Les statistiques',
    steps: [
      {
        key: 'intro',
        title: 'Où tu en es',
        body: 'Contenus appris, feuillets retrouvés, points. Un chiffre bas n’est pas un jugement — c’est ce qu’il te reste à explorer.',
        bodyTeacher:
          'La progression individuelle et de classe. Utile en fin de séance pour un bilan rapide.',
        target: '.gl-main-inner',
        placement: 'center',
        expression: 'vigilant',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  maps: {
    title: 'Les cartes',
    steps: [
      {
        key: 'intro',
        title: 'Les cartes du royaume',
        body: 'Voilà le territoire du chapitre. Je l’ai parcouru en long et en large, et il me reste des coins entiers à explorer.',
        bodyTeacher: 'La carte du chapitre en cours, telle que la voient les équipes.',
        target: '.gl-main-inner',
        placement: 'center',
        expression: 'montre',
      },
      {
        key: 'reperes',
        title: 'Les repères',
        body: 'Chaque repère cache quelque chose : une question, un effet, parfois un feuillet. Clique, tu verras bien.',
        bodyTeacher:
          'Les repères portent questions et effets. Vérifiez-les avant la séance : c’est ce qui rythmera la partie.',
        target: '.gl-main-inner',
        placement: 'bottom',
        expression: 'cherche',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  adventure: {
    title: 'L’aventure',
    steps: [
      {
        key: 'intro',
        title: 'Le fil du chapitre',
        body: 'L’histoire, le carnet et les sortilèges au même endroit. C’est ici que je reviens quand j’ai perdu le fil.',
        target: '.gl-main-inner',
        placement: 'center',
        expression: 'parle',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  'selene-carnet': {
    title: 'Le Carnet de Sélène',
    steps: [
      {
        key: 'intro',
        title: 'Le carnet',
        body: 'Les feuillets que ton équipe a retrouvés s’empilent ici. Tu peux les rouvrir tranquillement, une fois la séance passée.',
        bodyTeacher:
          'Les feuillets de l’équipe affichée. La distribution, elle, se règle dans Contenus.',
        target: '.gl-main-inner',
        placement: 'center',
        expression: 'content',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  market: {
    title: 'Le marché',
    steps: [
      {
        key: 'intro',
        title: 'Le marché',
        body: 'On échange ici entre équipes. Regarde ce qui manque aux tiens avant de proposer quoi que ce soit.',
        bodyTeacher:
          'Ce qui circule dépend des réglages du Marché ; les cœurs sont bloqués par défaut.',
        target: '.gl-main-inner',
        placement: 'center',
        expression: 'complice',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  mj: {
    title: 'Console du MJ',
    steps: [
      {
        key: 'intro',
        title: 'La console',
        body: 'Le pilotage de la partie en direct : tours, déplacements, validations. Les actions prennent effet immédiatement pour tous les joueurs.',
        role: 'teacher',
        target: '.gl-main-inner',
        placement: 'center',
        expression: 'vigilant',
      },
      GL_RELAUNCH_STEP,
    ],
  },
});
