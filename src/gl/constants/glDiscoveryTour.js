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

  maps: {
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
