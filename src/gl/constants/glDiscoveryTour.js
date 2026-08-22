/**
 * Contenu des **visites guidées de Gnomes & Licornes**.
 *
 * Pendant GL de `src/constants/discoveryTour.js` : mêmes règles (filtrage par rôle,
 * surcharges éditoriales, étape partagée), même moteur (`useGuidedTour`), même overlay
 * (`GuidedTourOverlay`) — seul le contenu diffère. Voir `docs/MASCOT_NARRATEUR_OLU.md`
 * §8.4 pour la voix : OLU parle **du** jeu, jamais **dans** le jeu. Aucune étape ne
 * raconte le lore, ne prend parti entre les deux peuples, ni ne dévoile un contenu.
 *
 * ## Les clés sont des valeurs que `tab` peut réellement prendre
 *
 * ⚠️ La navigation GL **replie les identifiants de hub sur un sous-onglet** :
 * `resolveGlMainTabChange()` et `readStoredGlTab()` traduisent `nature` en
 * `ecosystemes`, `adventure` en sa première entrée active, etc. Un parcours rangé sous
 * `nature` ne se déclencherait donc **jamais**. Les clés d'ici sont les onglets où l'on
 * atterrit vraiment — `tests/gl-tour-corpus-olu.test.js` le vérifie contre
 * `GL_VALID_TABS`.
 *
 * ## Les cibles sont des ancres dédiées
 *
 * ⚠️ Les `target` visent des attributs **`data-gl-tour`**, posés sur des éléments
 * structurels des vues et sur rien d'autre. Une classe de style bougerait à la
 * prochaine retouche et ferait disparaître l'étape en silence (le moteur écarte les
 * cibles absentes du DOM) ; un attribut dont l'unique raison d'être est la visite se
 * remarque quand on y touche. Le test vérifie que chaque ancre citée ici existe dans
 * `src/gl/`.
 *
 * Une étape qui présente un écran entier n'a **pas** de cible (`target: null`) : sa
 * bulle s'affiche au centre, sans projecteur. Éclairer toute la zone de contenu ne
 * désigne rien.
 *
 * `role: 'teacher'` = MJ ou admin, par cohérence avec le moteur partagé.
 *
 * **Les quatre écrans d'administration** (utilisateurs, contenus, réglages, mascottes)
 * n'ont pas de parcours : le corpus d'aide y est déjà neutre, OLU n'y parle pas (§8.4).
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
 * **Étapes d'orientation des quatre regroupements.** Chaque sous-onglet d'un hub ouvre
 * son parcours par celle de son groupe : elle désigne la barre de sous-onglets et dit
 * ce qu'il y a à côté.
 *
 * Elles sont **partagées** (rangées sous `commun` dans le studio) : une seule
 * réécriture vaut pour tous les sous-onglets du groupe. La contrepartie assumée est
 * qu'on la revoit en ouvrant un deuxième sous-onglet du même groupe — une bulle courte
 * qui redit où l'on est vaut mieux qu'un groupe qu'on n'a jamais présenté.
 */
export const GL_HUB_STEPS = Object.freeze({
  nature: Object.freeze({
    key: 'hub-nature',
    title: 'Trois entrées, un même endroit',
    body: 'Tu es dans « La nature » : les écosystèmes, les espèces qui y vivent, et le glossaire qui explique les mots. Les voisines sont juste là.',
    bodyTeacher:
      'Écosystèmes, espèces et glossaire du chapitre. Le conditionnement par QCM, s’il est actif, s’applique aux fiches de ce groupe.',
    target: '[data-gl-tour="subnav-nature"]',
    placement: 'bottom',
    expression: 'cherche',
  }),
  adventure: Object.freeze({
    key: 'hub-adventure',
    title: 'Le fil du chapitre',
    body: 'Tu es dans « L’aventure » : l’histoire, le carnet et les sortilèges. C’est ici que je reviens quand j’ai perdu le fil.',
    bodyTeacher:
      'Récit, carnet et sortilèges du chapitre. Ce que les équipes consultent entre deux tours.',
    target: '[data-gl-tour="subnav-adventure"]',
    placement: 'bottom',
    expression: 'parle',
  }),
  monde: Object.freeze({
    key: 'hub-monde',
    title: 'Le monde, pas la partie',
    body: 'Tu es dans « Le monde G&L » : l’introduction, les règles, le lexique du récit et les tutoriels. C’est ce qu’on lit au calme, en dehors d’une séance.',
    bodyTeacher:
      'Les pages de référence, hors partie. Elles s’éditent depuis Contenus si vous en avez les droits.',
    target: '[data-gl-tour="subnav-monde"]',
    placement: 'bottom',
    expression: 'parle',
  }),
  joueurs: Object.freeze({
    key: 'hub-joueurs',
    title: 'Ce qui se passe entre vous',
    body: 'Tu es dans « Les joueurs » : le forum, le marché et les statistiques. Rien d’obligatoire ici — mais c’est là qu’une équipe s’organise.',
    bodyTeacher:
      'Forum, marché et statistiques. De quoi voir comment la classe s’organise pendant la séance.',
    target: '[data-gl-tour="subnav-joueurs"]',
    placement: 'bottom',
    expression: 'complice',
  }),
});

/**
 * Étapes rangées sous `commun` : une clé d'édition, un texte, tous les parcours qui
 * l'emploient. Toute étape réutilisée entre parcours doit figurer ici, sinon le studio
 * en proposerait une copie par parcours — et deux copies divergent.
 */
export const GL_SHARED_STEP_KEYS = Object.freeze([
  GL_RELAUNCH_STEP.key,
  ...Object.values(GL_HUB_STEPS).map((step) => step.key),
]);

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
        title: 'Où me retrouver',
        body: 'Ce « ? », en haut de chaque écran. Un clic et je réexplique — autant de fois qu’il faudra, je ne compte pas.',
        bodyTeacher:
          'Le « ? » de chaque écran rouvre l’aide, et cette visite. Les textes se réécrivent depuis Contenus.',
        target: null,
        placement: 'center',
        expression: 'complice',
      },
    ],
  },

  // — Plateau et cartes ————————————————————————————————————————————————

  discovery: {
    title: 'Découverte',
    steps: [
      {
        key: 'intro',
        title: 'Le plateau de démonstration',
        body: 'Tu peux tout ouvrir ici, rien n’est cassable. C’est fait pour tâtonner — je ne regarde même pas.',
        bodyTeacher:
          'Le plateau de démonstration, ouvert aux invités. Rien de ce qui s’y passe ne touche une partie.',
        target: null,
        placement: 'center',
        expression: 'complice',
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
        target: null,
        placement: 'center',
        expression: 'montre',
      },
      {
        key: 'reperes',
        title: 'Les repères',
        body: 'Chaque repère cache quelque chose : une question, un effet, parfois un feuillet. Clique, tu verras bien.',
        bodyTeacher:
          'Les repères portent questions et effets. Vérifiez-les avant la séance : c’est ce qui rythmera la partie.',
        target: null,
        placement: 'center',
        expression: 'cherche',
      },
      GL_RELAUNCH_STEP,
    ],
  },

  // — La nature ————————————————————————————————————————————————————————

  ecosystemes: {
    title: 'Écosystèmes',
    steps: [
      GL_HUB_STEPS.nature,
      {
        key: 'intro',
        title: 'Le décor et ceux qui l’habitent',
        body: 'Chaque territoire a son décor et tout ce qui y vit. Ouvre une fiche : les deux s’expliquent l’un par l’autre.',
        bodyTeacher:
          'Biotope et biocénose par territoire du chapitre. Les fiches s’éditent depuis Contenus.',
        target: null,
        placement: 'center',
        expression: 'montre',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  biodiversite: {
    title: 'Biodiversité',
    steps: [
      GL_HUB_STEPS.nature,
      {
        key: 'catalogue',
        title: 'Les fiches d’espèces',
        body: 'À quoi elles ressemblent, où elles vivent, de quoi elles dépendent. Prends-en une, pas les vingt.',
        bodyTeacher: 'Les espèces rattachées aux biomes du chapitre, filtrables par biome.',
        target: null,
        placement: 'center',
        expression: 'cherche',
      },
      {
        key: 'appris',
        title: 'Marquer comme appris',
        body: 'Quand une fiche est claire pour toi, dis-le : elle rejoint ta progression. Parfois un petit quiz vérifie au passage.',
        bodyTeacher:
          'Le marquage « appris » alimente la progression et peut déclencher l’attribution d’un feuillet.',
        target: null,
        placement: 'center',
        expression: 'content',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  glossary: {
    title: 'Glossaire scientifique',
    steps: [
      GL_HUB_STEPS.nature,
      {
        key: 'chercher',
        title: 'Quand un mot bloque',
        body: 'Tape-le ici. Les définitions employées dans les fiches et les questions sont presque toutes là.',
        bodyTeacher:
          'Recherche et filtres du glossaire. Un terme qui manque s’ajoute depuis Contenus → Glossaire.',
        target: '[data-gl-tour="glossary-filters"]',
        placement: 'bottom',
        expression: 'cherche',
      },
      GL_RELAUNCH_STEP,
    ],
  },

  // — L'aventure ————————————————————————————————————————————————————————

  history: {
    title: 'L’histoire',
    steps: [
      GL_HUB_STEPS.adventure,
      {
        key: 'recit',
        title: 'Le récit du chapitre',
        body: 'Tout est là, dans l’ordre. Reviens-y dès que tu as perdu le fil — c’est fait pour.',
        bodyTeacher: 'Le récit du chapitre en cours, tel que le lisent les équipes.',
        target: null,
        placement: 'center',
        expression: 'parle',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  'selene-carnet': {
    title: 'Le Carnet de Sélène',
    steps: [
      GL_HUB_STEPS.adventure,
      {
        key: 'intro',
        title: 'Le carnet',
        body: 'Les feuillets que ton équipe a retrouvés s’empilent ici. Tu peux les rouvrir tranquillement, une fois la séance passée.',
        bodyTeacher:
          'Les feuillets de l’équipe affichée. La distribution, elle, se règle dans Contenus.',
        target: null,
        placement: 'center',
        expression: 'content',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  spells: {
    title: 'Les sortilèges',
    steps: [
      GL_HUB_STEPS.adventure,
      {
        key: 'grimoire',
        title: 'Ce que chaque sort coûte',
        body: 'La liste, les coûts, les effets. Certains sont réservés à un peuple — je ne me prononce pas sur qui a raison.',
        bodyTeacher:
          'Le catalogue des sorts. Selon le profil de séance, c’est vous qui validez les lancements — le réglage est dans Réglages → Gameplay.',
        target: null,
        placement: 'center',
        expression: 'montre',
      },
      GL_RELAUNCH_STEP,
    ],
  },

  // — Le monde G&L ———————————————————————————————————————————————————————

  world: {
    title: 'Introduction',
    steps: [
      GL_HUB_STEPS.monde,
      {
        key: 'lire',
        title: 'Deux minutes bien placées',
        body: 'De quoi il retourne, qui est qui, ce qu’on y fait. Deux minutes ici t’évitent une séance de tâtonnement.',
        bodyTeacher: 'La page d’introduction, éditable depuis Contenus → Pages du monde.',
        target: null,
        placement: 'center',
        expression: 'parle',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  rules: {
    title: 'Les règles du jeu',
    steps: [
      GL_HUB_STEPS.monde,
      {
        key: 'lire',
        title: 'Les mécaniques au calme',
        body: 'Tours, déplacements, vitalité, échanges. Si une action t’a surpris pendant la séance, l’explication est ici.',
        bodyTeacher: 'La page des règles, éditable depuis Contenus → Pages du monde.',
        target: null,
        placement: 'center',
        expression: 'vigilant',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  'lore-glossary': {
    title: 'Le lexique du récit',
    steps: [
      GL_HUB_STEPS.monde,
      {
        key: 'chercher',
        title: 'Les mots du monde',
        body: 'Les noms, les lieux, les termes que le récit emploie sans les expliquer. Ouvre-le quand une page te parle d’une chose jamais croisée.',
        bodyTeacher:
          'Le vocabulaire narratif. Il alimente les infobulles du récit : l’enrichir profite à toutes les pages qui emploient ces mots.',
        target: '[data-gl-tour="lore-glossary-filters"]',
        placement: 'bottom',
        expression: 'cherche',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  tutorials: {
    title: 'Les tutoriels',
    steps: [
      GL_HUB_STEPS.monde,
      {
        key: 'liste',
        title: 'Dans l’ordre que tu veux',
        body: 'Des parcours courts, indépendants. Commence par celui qui correspond à ce que tu n’arrives pas à faire.',
        bodyTeacher:
          'Les parcours guidés proposés aux élèves. Modifiables depuis cette page avec les droits de contenu.',
        target: '[data-gl-tour="tutorials-list"]',
        placement: 'top',
        expression: 'montre',
      },
      GL_RELAUNCH_STEP,
    ],
  },

  // — Les joueurs ————————————————————————————————————————————————————————

  forum: {
    title: 'Le forum',
    steps: [
      GL_HUB_STEPS.joueurs,
      {
        key: 'fils',
        title: 'Poser, partager, s’organiser',
        body: 'Une question, une trouvaille, un plan d’équipe. Ce que tu écris est lu par la classe — et par le MJ.',
        bodyTeacher: 'Les échanges de la classe, lisibles par vous, et conservés après la séance.',
        target: '[data-gl-tour="forum-threads"]',
        placement: 'top',
        expression: 'parle',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  market: {
    title: 'Le marché',
    steps: [
      GL_HUB_STEPS.joueurs,
      {
        key: 'offres',
        title: 'Ce qui circule',
        body: 'On échange ici entre équipes. Regarde ce qui manque aux tiens avant de proposer quoi que ce soit.',
        bodyTeacher:
          'Ce qui circule dépend des réglages du Marché ; les cœurs sont bloqués par défaut.',
        target: '[data-gl-tour="market-trades"]',
        placement: 'top',
        expression: 'complice',
      },
      GL_RELAUNCH_STEP,
    ],
  },
  stats: {
    title: 'Les statistiques',
    steps: [
      GL_HUB_STEPS.joueurs,
      {
        key: 'intro',
        title: 'Où tu en es',
        body: 'Contenus appris, feuillets retrouvés, points. Un chiffre bas n’est pas un jugement — c’est ce qu’il te reste à explorer.',
        bodyTeacher:
          'La progression individuelle et de classe. Utile en fin de séance pour un bilan rapide.',
        target: null,
        placement: 'center',
        expression: 'vigilant',
      },
      GL_RELAUNCH_STEP,
    ],
  },

  // — Journaux et console ————————————————————————————————————————————————

  journal: {
    title: 'Le journal de partie',
    steps: [
      {
        key: 'fil',
        title: 'La trace de la séance',
        body: 'Ce qui s’est passé pendant la séance, dans l’ordre. Pratique pour retrouver qui a fait quoi, et quand.',
        bodyTeacher:
          'Le déroulé de la partie. C’est la trace à relire pour un bilan ou pour situer une action.',
        target: null,
        placement: 'center',
        expression: 'parle',
      },
      {
        key: 'filtrer',
        title: 'Retrouver une action',
        body: 'Filtre par équipe pour ne garder que ce qui te concerne. Le fil devient tout de suite plus court.',
        bodyTeacher:
          'Les filtres réduisent le fil à une équipe ou à un type d’évènement — utile pour un bilan de fin de séance.',
        target: '[data-gl-tour="journal-toolbar"]',
        placement: 'bottom',
        expression: 'cherche',
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
        target: null,
        placement: 'center',
        expression: 'content',
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
        target: null,
        placement: 'center',
        expression: 'vigilant',
      },
      GL_RELAUNCH_STEP,
    ],
  },
});
