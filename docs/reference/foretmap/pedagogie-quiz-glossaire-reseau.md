# Quiz, glossaire, réseau trophique et carnet — ForetMap

> **Public de ce document : professeurs et administrateurs.**
> Il décrit ce que l'application fait aujourd'hui, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md)

## À quoi ça sert

Quatre modules pédagogiques complètent la carte et les tâches : le **Quiz** pour
vérifier les connaissances, le **Glossaire** pour le vocabulaire, le **Réseau
trophique** pour visualiser les relations entre espèces, et le **Carnet
d'observation** pour l'écriture naturaliste libre.

## Les notions des programmes

- **Chaque question de quiz et chaque terme de glossaire peut être relié aux notions des
  programmes officiels** : le cycle 3 et le cycle 4, la seconde, les spécialités SVT de
  première et de terminale, l'enseignement scientifique de première et de terminale. Seize
  notions sont livrées, de « Classer les organismes, exploiter les liens de parenté » à
  « Le carbone et les écosystèmes face au changement climatique ». Quatre notions de collège
  ont été ajoutées en septembre 2026 (matière organique et décomposition, développement et
  reproduction, production des aliments, ressources naturelles et comportements responsables) :
  auparavant, une soixantaine de questions de collège sur le potager, l'eau ou le compost ne
  portaient que des notions de lycée, et un quiz « cycle 3 » ou « cycle 4 » ne les tirait jamais.
  Les 47 questions de définition du glossaire, qui n'avaient aucune notion, reçoivent celles de
  la famille de leur terme.
- **Filtrer par notion.** Les onglets Quiz et Glossaire proposent deux menus
  supplémentaires : le niveau du programme, puis la notion. Choisir une notion restreint
  aussi la liste des catégories proposées, et le nombre entre parenthèses annonce combien
  de questions (ou de termes) la notion permet d'atteindre — une notion sans contenu ne se
  présente donc pas comme un choix utile.
- **Lancer un quiz sur une notion.** Dans l'écran Quiz du professeur, un panneau « Lancer un
  quiz par notion du programme » liste le référentiel par niveau ; un clic tire une question
  de cette notion et l'affiche dans la section de test. Le professeur qui prépare une séance
  part ainsi de ce qu'il doit traiter, sans deviner quelles catégories le traitent.
- **Le rattachement se fait par catégorie, pas question par question.** Une question hérite
  des notions de sa catégorie de quiz : les catégories sont rattachées une fois pour toutes,
  et une question ajoutée plus tard est rattachée du même coup. Quand une question s'écarte
  de sa catégorie — une question sur la photosynthèse rangée dans « Sol vivant & compostage » —
  on peut lui **ajouter** une notion ou lui **retirer** une notion héritée, sans toucher aux
  questions voisines.
- **Une question n'hérite que des notions de son niveau ou au-dessus.** Une question de
  lycée ne reçoit pas les notions de cycle 3 ou 4 de sa catégorie : un quiz « cycle 4 » ne
  tire donc plus de questions de lycée (elles en représentaient plus d'un tiers). Une
  question de collège, elle, garde les notions de lycée de sa catégorie et peut servir de
  révision en seconde. Un ajout fait à la main passe outre cette règle.
- **Le glossaire suit le même principe.** Chaque famille de vocabulaire (écologie, sol,
  flore…) est rattachée aux notions qui l'utilisent, et ses termes en héritent selon leur
  profondeur : un terme « de base » vaut dès le cycle 3, un terme « d'approfondissement » à
  partir du cycle 4, un terme « avancé » au lycée. Tous les termes du glossaire livré sauf
  un sont ainsi reliés à au moins une notion.
- **Des filtres « tout le collège » et « tout le lycée ».** Le menu « Niveau du programme »
  propose, en plus de chaque niveau, l'ensemble du collège (cycles 3 et 4) ou du lycée
  (seconde à terminale). Une séance lycée qui demande « Lycée » fonctionne désormais (elle
  était refusée).
- **Le quiz suit la classe de l'élève.** Pour un élève en affichage Collège, le quiz
  propose d'emblée les questions « Collège » (le filtre reste modifiable). Si sa classe a un
  niveau du programme (voir [Comptes, rôles et groupes](comptes-roles-et-groupes.md#les-groupes)),
  les menus ne montrent que les notions jusqu'à ce niveau, et une demande « tout le
  collège » faite par une séance est resserrée au cycle de la classe. Une séance qui vise
  explicitement un autre cycle est respectée.
- **Les notions sont visibles de tous.** La fiche d'un terme de glossaire affiche, sous
  l'intitulé « Au programme », le niveau et la notion auxquels il se rattache : un élève sait
  à quoi le mot qu'il lit va servir dans l'année.

> ⚠️ **Point d'attention** — Le mot « niveau » désigne plusieurs choses dans
> l'application : le niveau d'une question (collège / lycée), sa difficulté (★ à ★★★★★), la
> profondeur d'un terme de glossaire (base / approfondissement / avancé), le niveau scolaire
> d'une notion de programme et l'affichage biodiversité (collège / lycée / université). Les
> menus les nomment distinctement (« Niveau » / « Niveau du programme »), et leurs
> correspondances sont désormais fixées une fois pour toutes — voir [Les échelles de niveau et
> leurs correspondances](niveaux-pedagogiques-biodiversite.md#les-échelles-de-niveau-et-leurs-correspondances).

> ⚠️ **Point d'attention** — Le rattachement par catégorie est un point de départ : une
> famille de vocabulaire couvre plusieurs notions, et un terme peut en recevoir une qui ne
> le concerne pas vraiment. Comme pour une question, on peut lui **retirer** une notion
> héritée. Deux catégories de quiz citées par le référentiel (« milieux et terrain »,
> « démarche et mesure ») n'existent pas dans tous les jeux de données : leurs liaisons sont
> simplement absentes là où la catégorie manque.

> ⚠️ **Point d'attention** — Aucun écran ne permet encore d'éditer ces rattachements
> (catégories et exceptions) : ils se règlent par l'API (`/api/curriculum`, permission
> « gérer les plantes »). Le terme « calcarénite » (avancé, famille « paysage ») reste sans
> notion : sa famille n'est reliée qu'à des notions de collège.

## Le Quiz

- **L'élève** répond à des questions à choix multiples depuis son onglet Quiz ; il voit
  immédiatement si sa réponse est juste et progresse à son rythme. **Chaque question
  présentée n'autorise qu'un essai** : un second choix sur la même présentation est
  refusé, il faut en relancer une (les propositions sont alors remélangées).
- **Le professeur** administre le catalogue de questions : création, édition,
  activation. Les questions peuvent être reliées aux termes du glossaire, ce qui aide
  l'élève à réviser le vocabulaire au passage. Un import du catalogue par fichier
  tableur est **tout ou rien** : s'il est interrompu, les questions et les
  rattachements au glossaire déjà en place restent tels quels. Dans le fichier, la colonne
  « statut » vaut `actif` ou `inactif` ; **laissée vide, elle ne change rien** : une question
  désactivée le reste (jusqu'en septembre 2026, un fichier sans statut réactivait toutes les
  questions désactivées). Une autre valeur est signalée comme erreur sur sa ligne.
- **La fiche question** se remplit champ par champ, chacun nommé en clair : énoncé,
  choix A à E, bonne réponse, et une explication propre à **chaque** choix possible
  (« Explication si l'élève choisit B »), plus l'explication affichée après une bonne
  réponse.
- **L'aperçu « Présenter »** montre la question telle que l'élève la verra —
  **illustration comprise**, avec sa légende et son crédit — et permet de répondre pour
  vérifier le retour pédagogique.
- **Légende de la photo** : elle est visible **du professeur seulement** (fiche et
  aperçu). Dans le catalogue livré, cette légende nomme le plus souvent le sujet
  photographié : l'afficher à l'élève donnerait la réponse. Ce qui accompagne l'image
  côté élève, c'est le **crédit et la licence**, affichés partout où la photo apparaît.
- **Le glossaire n'est pas consultable pendant la question.** Les termes reconnus dans
  l'énoncé et dans les propositions de réponse étaient cliquables : sur une question du
  type « Comment appelle-t-on le processus par lequel… ? », ouvrir le terme lié **donnait
  la réponse**. Ce qui devait aider à comprendre servait à deviner. Le texte reste affiché
  tel quel — on ne masque aucun mot —, mais rien ne s'ouvre tant que l'élève n'a pas
  répondu. La liste « Glossaire utile » suit la même règle, pour la même raison : elle
  désignait le sujet de la question aussi sûrement qu'un lien. **Après la réponse**,
  l'auto-liaison et la liste reviennent : c'est le moment où aller lire la définition est
  utile. La règle vaut aussi pour Gnomes & Licornes et pour l'aperçu du professeur, qui
  doit montrer ce que l'élève verra.
- **Ouvrir la question en fenêtre** : un bouton « ⤢ Ouvrir en fenêtre » affiche la
  question courante dans un petit panneau par-dessus la page, sans rien changer à
  l'affichage habituel. Utile pour se concentrer sur l'énoncé, et surtout côté professeur,
  où la question de test est noyée sous le catalogue et l'éditeur. C'est la même surface
  d'affichage et le même état : répondre dans la fenêtre ou dans la page revient au même.
- Le catalogue comprend aussi des **questions de raisonnement** (réseaux alimentaires,
  cycle de l’azote, sol et compost, énergie, biodiversité, équilibres) et des
  **questions ancrées dans les fiches pratiques** (arrosage au pied, compost 1/3–2/3,
  semences F1, spirale d’herbes…). Chaque bonne réponse a une explication rédigée,
  distincte de l’énoncé. Les propositions sont mélangées à chaque présentation : le
  fait qu’une bonne réponse soit enregistrée en premier n’aide pas à deviner.
- Les questions du Quiz servent aussi de **contrôle de compréhension** avant de valider
  un tutoriel, une fiche espèce ou un terme de glossaire, si le dispositif est activé.
  Les rattachements livrés ont été relus : une question n’est plus accrochée à une
  fiche qui ne l’enseigne pas (par exemple la photosynthèse n’est plus collée au
  tutoriel « Sol vivant »). L'écran « Rattacher des questions aux contenus », sous
  l'éditeur, relie les deux — à la main ou par rapprochement automatique des contenus :
  voir [Tâches, tutoriels et validation](taches-tutoriels-et-validation.md).

## Le Glossaire

- Le vocabulaire du jardin et des sciences du vivant, consultable par tous : chaque
  terme a sa définition, et peut être relié à des plantes du catalogue et à des
  questions de quiz.
- Le professeur enrichit le glossaire au fil de l'année.
- **L'onglet Glossaire est accessible aux professeurs comme aux élèves.** Il figurait
  jusqu'ici dans la seule barre élève : un professeur ne pouvait ouvrir le glossaire
  qu'en cliquant un terme dans un contenu, puis « Voir la fiche complète ». Sans terme
  sous la main, l'onglet restait hors d'atteinte.
- **« J'ai appris ce terme ».** La fiche d'un terme porte un bouton de validation, comme
  un tutoriel ou une fiche espèce. Le glossaire était jusqu'ici purement consultatif :
  rien ne distinguait un terme travaillé d'un terme jamais ouvert, et surtout, le contrôle
  de compréhension n'avait aucun geste auquel se rattacher — une question rattachée à un
  terme ne conditionnait rien du tout. Si le contrôle est actif et qu'une question
  bloquante est rattachée au terme, il faut la réussir avant de pouvoir valider. Dans la
  liste des termes, une **pastille d'état** dit où en est l'élève (✓ acquis, ? en attente,
  🔒 bloqué).
- **Fiche rapide en surimpression.** Partout où un terme du glossaire est cité et
  cliquable — dans un tutoriel ouvert en lecture, sur une fiche plante, dans le réseau
  trophique ou **dans les textes de la visite** — le clic ouvre une **petite fiche par-dessus
  l'écran en cours**. Une
  exception : pendant une question de quiz non encore répondue, les termes ne sont pas
  cliquables (voir plus haut). L'élève lit la définition, puis referme : il retrouve exactement sa page et sa
  position de lecture. Il ne quitte plus son tutoriel pour consulter un mot.
- La fiche rapide affiche la définition courte, la définition détaillée, l'exemple et
  l'étymologie, ainsi que les espèces et tutoriels rattachés au terme. Les **termes
  voisins** y sont proposés en pastilles : les enchaîner fait défiler les définitions
  dans la fiche, sans jamais la fermer.
- Un bouton **« Voir la fiche complète »** reste disponible pour basculer, cette fois
  volontairement, sur l'onglet Glossaire et y explorer le terme en grand. En **visite
  invitée**, où il n'y a pas d'onglet Glossaire, la fiche rapide s'ouvre quand même : elle
  se lit seule, sans ce bouton.
- La fiche se ferme par la croix, par le bouton Fermer, par la touche Échap ou par un
  clic à côté.
- **La fiche rapide passe toujours devant ce qui l'a ouverte.** Ouverte depuis un quiz
  affiché en fenêtre, elle apparaissait derrière lui : la définition était demandée mais
  invisible, et il fallait refermer le quiz pour la lire. Symétriquement, la question de
  contrôle demandée depuis la fiche d'un terme (« j'ai appris ce terme ») s'affiche
  par-dessus cette fiche, qui reste ouverte derrière.
- Dans les tutoriels, les termes du glossaire sont désormais **repérables à l'œil** :
  ils apparaissent en vert, soulignés d'un pointillé. Ce marquage reste discret pour ne
  pas dénaturer la mise en page des fiches ; une fiche qui impose sa propre charte de
  liens garde la sienne.

## Le Réseau trophique

- Un **graphe interactif** des interactions entre les espèces du jardin : qui mange
  qui, qui aide qui (pollinisation, abri…). L'élève explore le graphe et découvre les
  chaînes alimentaires réelles de la forêt comestible.
- Le professeur (gestionnaire des plantes) crée et modifie les liens entre espèces —
  le graphe s'appuie sur le catalogue de biodiversité.
- **Trois vues du graphe.** Par défaut, **Réseau alimentaire** ne montre que ce qui
  transporte de la matière d’un être vivant vers celui qui le consomme : herbivorie,
  prédation, décomposition, détritivorie, frugivorie, granivorie, mycophagie,
  parasitisme. C’est la vue à présenter en classe pour une chaîne alimentaire.
  **Autres relations** isole pollinisation, plante hôte, symbiose, mutualisme,
  commensalisme, compétition, allélopathie, facilitation, et le cycle de l’azote
  (nitrification, excrétion, assimilation). **Tout** superpose les deux pour
  l’exploration complète. Les filtres par type et le mode « isoler une espèce » restent
  disponibles dans chaque vue.

> 🔧 **À implémenter :** adapter la densité du réseau (types avancés, niveau de preuve
> des liens) au **niveau pédagogique** Collège / Lycée / Université — voir
> [Niveaux pédagogiques biodiversité](niveaux-pedagogiques-biodiversite.md).

- **Dix-neuf types d’interaction.** Onze ont été ajoutés pour cesser de ranger sous un
  mot des relations différentes. Quelques cas concrets :
  - Un merle qui picore une figue tombée était noté « décomposition ». Il fait de la
    **frugivorie** : il mange le fruit, il ne le minéralise pas. De même, un cloporte ou
    un ver de compost fait de la **détritivorie** — il fragmente la matière morte, ce
    sont les bactéries et les champignons qui décomposent vraiment. La distinction est
    au programme.
  - « Nitrification » désignait trois choses à la fois : les déjections de poisson qui
    fournissent l’ammonium (**excrétion**), l’oxydation par les bactéries
    (**nitrification** au sens strict) et la reprise des nitrates par les plantes
    aquatiques (**assimilation**). Les trois étapes du cycle de l’azote sont maintenant
    lisibles séparément sur le graphe.
  - « Symbiose » servait aussi aux entraides sans vie commune : les fourmis qui gardent
    un troupeau de pucerons pour leur miellat font du **mutualisme**. Quand un seul des
    deux y gagne et que l’autre est indifférent — un oiseau qui niche dans une haie —
    c’est du **commensalisme**. Et brouter un mycélium vivant, ce n’est pas fragmenter de
    la matière morte : c’est de la **mycophagie**.
  - « Compétition » était devenue le mot du voisinage en général, qu’il soit hostile ou
    favorable. Le noyer qui empêche chimiquement ses voisines de pousser fait de
    l’**allélopathie** ; une plante nourrice qui abrite un jeune semis fait de la
    **facilitation**. C’est exactement le raisonnement des associations de cultures.
  - S’y ajoutent **granivorie** et **parasitisme**, disponibles à la saisie même si
    aucune interaction ne les utilise encore.
- **Chaque lien dit maintenant d’où il vient.** Le professeur choisit son **niveau de
  preuve** — « Documenté » (travail de référence), « Observé sur le site » (constaté au
  jardin) ou « Hypothèse » (plausible, non vérifié) — et peut citer une **source**
  (ouvrage, page web). Le graphe le montre : une hypothèse se dessine en pointillé
  atténué, une observation de terrain d’un trait plus appuyé. Un réseau pédagogique mêle
  forcément les trois, et tout afficher avec la même autorité apprenait aux élèves à ne
  pas faire la différence. Cliquer une relation affiche le niveau de preuve et la source.
- **Pour la pollinisation, l’efficacité du visiteur peut être précisée** :
  « Pollinisateur efficace », « Pollinisateur accessoire », « Simple visiteur » ou
  « Voleur de nectar » — tous les insectes qui viennent sur une fleur ne la pollinisent
  pas, et certains prennent le nectar sans rien rendre. Ce choix n’apparaît que sur une
  relation de pollinisation, et disparaît si le type est changé.
- **Les détritivores ont des nourritures nommées.** Vers, cloportes, collemboles,
  escargots d’eau, fourmis ou blattes pointent vers des fiches-ressources du
  catalogue — litière de feuilles, compost et épluchures, bois mort, biofilm, fruits
  tombés, carton de lombricompost, crottes et fientes. Ce ne sont pas des espèces :
  ce sont des exemples de matière morte, pour qu’une chaîne détritique ait un vrai
  point de départ. La gambusie est reliée au moustique (ses larves), les coccinelles
  et syrphes aux pucerons, le Rhizobium aux légumineuses (haricot, fève, pois, pois
  chiche, fenugrec). Le réseau relie aussi le jardin méditerranéen : cochenille du
  nopal sur figuier de Barbarie, cigale sur olivier, hérisson d’Algérie sur
  escargots, tarente sur moustiques, chrysope sur pucerons. S’y ajoutent merle
  (vers, baies), hirondelle et pipistrelle (moustiques), libellule et gerris
  (mare), et les mycorhizes à Glomus en symbiose avec les légumes.
- **Une flèche sans cible reste possible.** Si le professeur laisse la cible vide,
  le graphe affiche une bulle « 🌍 Environnement » plutôt qu’un trait vers le vide.
  Cette bulle n’apparaît que si au moins une relation visible n’a pas de cible. Le
  catalogue livré n’en a plus besoin pour les décomposeurs ni pour la gambusie.
- **Cliquer une flèche répond sous le graphe** : le type de relation, sa phrase dans le
  bon sens écologique (« Lapin → est mangée par → Renard »), la description saisie par le
  professeur, puis les mots de glossaire rattachés. Avant, la réponse s'affichait dans la
  colonne de gauche, souvent hors de vue, et se limitait aux mots de glossaire.
- **Arriver depuis une fiche plante isole l'espèce.** Le bouton « Voir le réseau
  trophique » d'une fiche ouvre l'onglet **sur le sous-réseau de cette espèce** (elle et
  ses voisines directes), **filtré sur la carte active** (celle choisie sur le plan de
  travail) ; le bouton « Tout afficher » revient au réseau de cette carte. On peut encore
  élargir à « Toutes les cartes » dans le filtre. Si l'espèce n'a encore aucune
  interaction dans la carte ou la zone choisie, un message le dit au lieu de laisser
  croire à un bug.
- **Ouvrir l'onglet Réseau trophique** (menu ou lien) part aussi sur la **carte active**,
  pas sur le réseau global de toutes les cartes. Le filtre carte compte les espèces des
  zones, des repères **et** celles rattachées directement à la carte (sans lieu précis).
- **Le graphe se parcourt aussi au clavier** : la tabulation passe d'une espèce et d'une
  relation à l'autre, `Entrée` isole le réseau d'une espèce (ou sélectionne une relation),
  `Maj+Entrée` ouvre la fiche de l'espèce. Utile en vidéoprojection sans souris, et
  nécessaire aux lecteurs d'écran, pour qui le graphe était jusqu'ici entièrement muet.
- **Changer de carte ou de zone ne laisse plus de filtre fantôme** : un type d'interaction
  qui n'existe pas dans la nouvelle sélection revient à « Tous », au lieu d'afficher un
  menu vide et un réseau annoncé comme vide à tort.
- La molette zoome sans faire défiler la page ; les boutons « − / ⟳ / + » restent
  disponibles. Changer de disposition (« Cercle » / « Niveaux ») recompose bien toute la
  scène, y compris les nœuds déplacés à la main.
- **Sur tablette, le zoom au pincement fonctionne** : le geste habituel à deux doigts
  agrandit le graphe, et lever les doigts ne déclenche plus par erreur l'isolement d'une
  espèce.
- **Chercher une espèce dans le graphe.** Un champ de recherche est proposé dans la barre
  d'outils : taper un nom puis « Isoler » recentre l'exploration sur cette espèce, sans
  passer par sa fiche.
- **Voir la chaîne, pas seulement les voisins.** Quand une espèce est isolée, deux boutons
  apparaissent : « Voisins » (les espèces directement reliées) et « Chaîne », qui va un cran
  plus loin — qui mange qui mange qui. C'est là que se lit une chaîne alimentaire.
- **Isoler une espèce recompose la scène autour d'elle.** Le reste du réseau n'est plus
  seulement estompé : il est retiré, et les espèces retenues se réorganisent pour occuper
  toute la place. Le bouton « Reste en fond » ramène le contexte estompé quand on veut
  montrer où l'on se situe dans l'ensemble.
- **Isoler plusieurs espèces à la fois.** ⌘/Ctrl + clic (ou le bouton « Ajouter à la
  sélection », pensé pour la tablette) ajoute une espèce à celles déjà isolées ; les espèces
  retenues s'affichent en puces sous le graphe, où l'on peut les retirer une à une. Avec deux
  espèces ou plus, un troisième bouton d'étendue apparaît : « Sélection » ne garde que les
  espèces choisies et leurs relations mutuelles — de quoi composer au tableau la chaîne
  exacte d'une séance, puis l'exporter en PNG.
- **La disposition « Fiche »** (proposée dès qu'une seule espèce est isolée) présente la
  lecture attendue : ce qu'elle mange à gauche, l'espèce au centre, ce qui la mange à droite.
  Sous le graphe, la même chose est écrite en toutes lettres — utile pour la trace écrite et
  pour les lecteurs d'écran.
- **Deux relations entre les deux mêmes espèces ne se cachent plus l'une l'autre** : elles
  sont légèrement écartées, chacune cliquable.
- **Herbivorie, prédation et décomposition** se distinguent à la fois par la
  **couleur** (ambre, orange-rouge, pourpre) et par le **trait** (tirets ou plein) :
  on ne s’appuie plus sur deux rouges proches. **Plante hôte** (vert) et
  **symbiose** (cyan) sont aussi écartées. Une relation sélectionnée garde sa
  couleur et s’entoure d’un halo vert, sans devenir toute verte.
- **Le cadrage** (Réseau alimentaire / Autres relations / Tout) s’applique au
  graphe **et** à la liste. Le filtre fin par type n’apparaît que dans « Tout ».
- **Disposition Niveaux : la pyramide se lit de bas en haut**, avec les niveaux de
  consommateurs nommés. Les producteurs forment la bande du bas, puis les **consommateurs
  primaires**, **secondaires** et **tertiaires**. Trois points à connaître :
  - le niveau est **calculé sur le réseau affiché** (un niveau = un cran au-dessus de la
    moyenne de ses proies), pas saisi espèce par espèce : changer de carte, de zone ou de
    cadrage peut donc le changer, et l'infobulle le dit (« niveau 2,4 dans ce réseau ») ;
  - un **omnivore** garde une valeur intermédiaire — le merle qui mange des vers _et_ des
    baies est annoncé « régime mixte, entre deux niveaux » — au lieu d'être rangé de force ;
  - les **décomposeurs ne sont pas un étage de plus** : ils occupent une voie à part, sur le
    côté, avec les espèces dont le niveau n'est pas déterminable (aucune relation « mange »
    enregistrée). C'est un point scientifique, pas un détail d'affichage.
  - les **détritivores** (vers de terre, cloportes, collemboles…) mangent de la matière
    morte, comme un herbivore mange une plante : ils comptent au **niveau 2**, même quand
    leur nourriture n'est pas affichée. Un oiseau qui mange des vers de terre apparaît donc
    bien **consommateur secondaire** — il était annoncé primaire tant que les vers étaient
    rangés parmi les décomposeurs. Les détritivores restent affichés **dans la voie à part**,
    sous leur propre intitulé « Détritivores », juste avant les décomposeurs : on y lit
    côte à côte qui fragmente la matière morte et qui la transforme en sels minéraux.
    Quand un niveau compte plus d'espèces que la largeur n'en porte, la bande se poursuit sur
    plusieurs rangées et la scène s'allonge, au lieu d'empiler les pastilles.
- **Le cercle affiche les noms en rayon**, autour de l'anneau : ils tiennent alors même sur
  un réseau de plusieurs dizaines d'espèces, là où les noms posés sous les pastilles se
  chevauchaient à partir d'une quinzaine.
- **La disposition choisie est mémorisée** : un professeur qui projette en « Niveaux » la
  retrouve à la séance suivante. Sur un réseau alimentaire, c'est « Niveaux » par défaut ;
  sur « Autres relations », où aucun niveau n'a de sens, on revient aux colonnes de rôles
  (une colonne « Détritivores » s'y ajoute quand le réseau affiché en compte).
- Une fois une espèce isolée, le bouton **« Voir la fiche »** ouvre sa fiche —
  utile sur tablette, où le double-clic est peu naturel.
- **Filtrer par zone ne coupe plus les liens qui en sortent.** Une espèce de la zone mangée
  par un prédateur de la zone voisine faisait disparaître la relation entière ; elle est
  désormais affichée, l'espèce extérieure étant signalée par un contour orangé pointillé.
  Une zone montre ainsi ce à quoi elle est reliée, ce qui est tout l'intérêt de la notion.
- **Corriger une relation sans la supprimer.** Le professeur qui sélectionne une flèche
  dispose d'un bouton « Modifier cette relation » : type, espèce cible et description se
  changent sur place. Auparavant, la moindre faute de frappe imposait de supprimer puis
  recréer — ce qui faisait perdre les mots de glossaire rattachés.

## Le Carnet d'observation

- **Qui peut tenir un carnet** : **tout compte ForetMap connecté** (élève, visiteur,
  personnel, prof de classe, n3boss, administrateur) — chacun le sien. La visite anonyme
  sans compte n’a pas de carnet.
- **Lecture d’abord** : le carnet se **feuillette** comme un livre. Chaque article s’affiche
  en page lisible (texte mis en forme, photos). On passe en **écriture** seulement pour
  l’article qu’on veut modifier (ou un nouvel article). L’enregistrement reste automatique
  pendant la saisie. On peut épingler, rechercher, filtrer (articles / éléments appris) et
  trier le fil. Une zone de la forêt peut être associée à un article.
- **Éléments appris** : depuis une fiche espèce, un terme du glossaire ou un tutoriel, après
  l’avoir marqué comme appris / découvert / lu, on peut l’**ajouter au carnet**. Il apparaît
  dans le même fil, avec un lien pour le rouvrir.
- **Encarts** : dans un article, on peut coller un rappel vers une espèce, un terme, un
  tutoriel ou un module — choisi **par son nom** (recherche), pas par un numéro technique.
  À la lecture, l’encart s’affiche comme une **planche** (titre, courte présentation, image
  si disponible).
- **Impression / livre** : le propriétaire peut ouvrir une vue « livre » (couverture,
  sommaire, pages, annexes des découvertes) puis imprimer ou enregistrer en PDF depuis le
  navigateur. Options de fin d’année : période, épinglés seulement, préface courte.
- **Aide contextuelle** : le bouton « ? » dans l’en-tête du carnet ouvre une courte aide.
  Ses textes se modifient dans l’administration de l’aide (« Mon carnet »).
- **Le professeur** consulte les carnets (panneau dans les statistiques, chargement
  automatique) : aperçu regroupé par élève, ouverture du carnet complet en fil chronologique
  (articles et éléments appris), impression / PDF, et export texte (Markdown). La lecture
  d’un carnet est réservée à son propriétaire et aux professeurs selon leur périmètre
  (groupe ou global).
- Chaque action est faite au nom du compte connecté : on ne peut pas modifier le carnet d’un
  camarade. Les **photos** d’un article ne sont visibles que par son auteur et par les
  professeurs autorisés à lire ce carnet — pas par un lien public.
- L’affichage côté propriétaire charge l’ensemble du carnet ; la vue groupe des professeurs
  montre les **100 articles les plus récents** du périmètre (borne de lecture, pas une
  suppression).

> ⚠️ **Point d'attention** — Ces modules sont **activables/désactivables** dans les
> réglages (quiz, tutoriels, carnet, forum…). Si un onglet manque, vérifier d’abord les
> réglages des modules.

## Les Tutoriels

Les fiches pratiques (arrosage, compostage…) sont décrites avec les tâches, car elles
y sont liées : voir [Tâches, tutoriels et validation](taches-tutoriels-et-validation.md).

## ⚠️ Points d'attention

> ⚠️ **Point d'attention** — La qualité du Réseau trophique dépend entièrement des
> liens saisis par le professeur : un graphe vide ou clairsemé n'est pas une panne,
> c'est un contenu à construire (idéalement avec les élèves).

> ⚠️ **Point d'attention — le quiz était devinable à la longueur des réponses ; le corpus
> livré a été repris, les questions ajoutées depuis restent à reprendre.**
>
> La bonne réponse était rédigée avec soin, les propositions fausses expédiées en deux ou
> trois mots. Un élève qui choisissait systématiquement la proposition la plus longue, sans
> rien connaître, réussissait **66 %** des questions — pour 25 % au hasard. La position,
> elle, n'a jamais été un problème : les propositions sont mélangées à chaque affichage,
> donc le fait que la bonne réponse soit stockée en « A » une fois sur deux est invisible
> pour l'élève.
>
> **426 propositions fausses ont été réécrites sur 142 questions du corpus livré**, en
> gardant l'erreur que chacune représente (les explications par proposition restent donc
> justes) et en lui donnant le même niveau de détail que la bonne réponse. Sur le corpus
> livré, la stratégie « choisir la plus longue » tombe de **78 % à 39 %** ; à un écart
> réellement visible — plus de 20 caractères — elle ne marche plus du tout (52 % avant,
> **0 % après**).
>
> **Ce qui reste à faire : les questions saisies depuis le panneau prof.** Elles n'ont pas
> été touchées, et environ **143** d'entre elles restent concernées. Le rapport d'audit du
> contenu pédagogique les liste sous l'intitulé `length_bias_answer`, avec le taux de
> réussite de la stratégie « choisir la plus longue ».
>
> **La règle en écrivant une question :** une proposition fausse doit être aussi développée
> que la bonne, et il faut accepter que la plus longue des quatre soit parfois la bonne
> réponse — sinon la règle « choisir la plus longue » devient simplement « éviter la plus
> longue », et le quiz reste devinable.

## Pour aller plus loin

[Présentation générale](presentation.md) · [Plantes et biodiversité](plantes-et-biodiversite.md) · [Niveaux pédagogiques biodiversité](niveaux-pedagogiques-biodiversite.md) · [Stats, forum et suivi](stats-forum-et-suivi.md) · [Sommaire](../README.md)
