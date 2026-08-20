# Gnomes & Licornes — Chapitres, déroulement d'une partie et progression

> **Public de ce document : professeurs, maîtres du jeu (MJ) et administrateurs.**
> Il décrit ce que le jeu fait aujourd'hui, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md) · Vue d'ensemble : [presentation.md](presentation.md)

## À quoi ça sert ?

Ce document explique la **colonne vertébrale du jeu** : ce qu'est un chapitre, comment
se déroule une partie (équipes, mascottes, tours, narration, actions, scores), comment
les élèves progressent pédagogiquement, et comment on passe d'un chapitre au suivant.

## Qui l'utilise ?

Le **MJ** crée et anime les parties ; l'**Admin** règle en plus le gameplay (profils de
séance) ; les **joueurs** vivent la partie et font avancer leur progression personnelle.

## Comment ça se passe

### Un chapitre = un milieu naturel

Le jeu se découpe en **chapitres**, chacun adossé à un milieu naturel et à l'un des
**cinq plateaux** du voyage de Sélène, « de la chaleur de l'équateur jusqu'à la glace
du pôle » : tropiques africains (désert chaud, jungle, mangrove) → savane et forêt
méditerranéenne → landes atlantiques → forêts et prairies tempérées → taïga, toundra
arctique et désert froid. Un chapitre rassemble : un **récit**, les fiches du milieu
(**biotope** et **biocénose**), la liste des **sortilèges** du chapitre, un ou
plusieurs **biomes** rattachés, et surtout **sa carte** (le plateau de jeu) avec ses
zones et ses repères — décrite dans [carte-du-royaume.md](carte-du-royaume.md).

Les chapitres se créent et s'éditent dans les écrans d'administration des contenus
(MJ et Admin). Il n'y a pas de « chapitre courant » global : **chaque partie choisit
son chapitre** à sa création.

> **Les biomes d'un chapitre décident de son contenu.** Espèces, termes de glossaire,
> questions de QCM et feuillets ne sont **jamais rangés « dans » un chapitre** : ils
> appartiennent à un **biome**, et un chapitre affiche le contenu des biomes qui lui
> sont rattachés. Conséquence pratique : cocher un biome de trop sur un chapitre y
> fait remonter tout le corpus de ce biome (et le fait compter deux fois dans la vue
> d'ensemble des feuillets) ; en oublier un laisse le chapitre **vide** de ressources,
> QCM compris. Un chapitre de test ou de démonstration ne devrait donc porter **aucun
> biome** du voyage. Corriger la liste des biomes du chapitre suffit à tout remettre en
> place : aucun contenu n'est déplacé ni perdu au passage.

### Le déroulement d'une partie

1. **Créer la partie** : dans la console du MJ, onglet Parties, le MJ donne un nom,
   choisit une **classe** et un **chapitre**. La partie naît en **brouillon**.
2. **Composer les équipes** : le MJ ajoute des équipes, chacune avec un nom, une
   couleur, et surtout un **peuple** — **Gnome ou Licorne** — puis choisit sa
   **mascotte** dans le catalogue (filtré par peuple). Les joueurs de la classe sont
   ensuite répartis : à la main, par répartition automatique, ou en laissant chaque
   joueur rejoindre lui-même une équipe.
3. **Démarrer** : la partie passe **en cours**. Si la carte du chapitre est en
   « parcours numéroté », toutes les mascottes sont posées sur la case départ. Le MJ
   peut mettre en **pause** puis reprendre, et **terminer** la partie quand il veut.
4. **Animer** : selon les réglages activés (voir profils ci-dessous), la séance
   combine :
   - **Tours de jeu** (optionnels) : le MJ clique « Tour suivant » ; le compteur de
     tours réarme ce que chaque équipe peut faire une fois par tour (déplacement,
     lancer de dé).
   - **Narration** (optionnelle) : le MJ écrit des messages narratifs (avec image
     possible) qui alimentent le **journal de partie**, où s'inscrivent aussi tous
     les événements (déplacements, scores, questions, sorts, découvertes…).
   - **Actions des joueurs** (optionnelles) : un joueur propose une action (explorer,
     répondre à un quiz, observer la biodiversité, avancer dans l'histoire…) ; la
     demande arrive dans la file du MJ, qui **accepte ou refuse**, avec un éventuel
     gain de points.
   - **Scores d'équipe** (optionnels) : le score monte par les actions acceptées, les
     **bonnes réponses aux QCM** (+1 point), et les ajustements directs du MJ. Il est
     propre à la partie : une nouvelle partie repart de zéro.

Les **cœurs et gemmes** des joueurs (la vitalité) sont une autre monnaie : ils sont
attachés au joueur et **traversent les parties et les chapitres** sans se
réinitialiser (voir [presentation.md](presentation.md)).

> ⚠️ **Point d'attention** — Le vocabulaire des « tours » promet une **rotation des
> équipes** (badge « Tour » sur l'équipe courante), mais en réalité chaque « tour
> suivant » ouvre un nouveau round où **toutes les équipes rejouent en même temps** ;
> aucune équipe n'est désignée « au trait » par le moteur. L'alternance stricte reste
> donc une convention d'animation tenue par le MJ, pas une règle appliquée par le jeu.

### La progression pédagogique

- **Marquer comme appris** : les élèves (et le MJ pour lui-même) peuvent marquer une
  **espèce** comme étudiée, un **terme du Glossaire scientifique** comme appris, un
  **tutoriel** comme lu, et de même pour les feuillets, pages, écosystèmes et termes
  du **Lexique lore**. Chaque marquage demande une confirmation explicite.
- **Conditionnement par QCM** : l'admin peut exiger la **réussite d'un QCM** avant
  d'autoriser le marquage « appris » d'un contenu. Le jeu propose alors la ou les
  questions à réussir (les liens contenu ↔ question et les réglages globaux se gèrent
  dans les écrans d'administration dédiés au conditionnement par QCM).
- **Statistiques** : chaque joueur consulte sa progression personnelle ; le MJ et
  l'admin disposent d'une vue collective par classe.
- **Découverte des feuillets du Carnet de Sélène** : les feuillets, verrouillés par
  défaut, se découvrent en jouant — en **traversant une zone-feuillet** sur la carte
  (le canal principal), par le **récit** (prologue), à l'occasion de l'**étude d'une
  espèce**, ou en marquant appris **n'importe quel autre contenu conditionné** (terme
  de glossaire, écosystème, tutoriel, page) : chaque première consultation réussie
  ouvre un feuillet du chapitre, tant qu'il en reste. L'étude d'une espèce sert
  d'abord le feuillet dédié à cette espèce, puis ceux de son pays, puis **bascule sur
  le pool du chapitre** — étudier la biodiversité rapporte donc autant dans le premier
  chapitre que dans le dernier. Une découverte peut **coûter des gemmes** et **rapporter des
  cœurs** (réglable), et le texte peut être partiellement « mangé par le Souffle »
  (effacement progressif, réglable). L'équipe passe ensuite du feuillet « découvert »
  à « lu », voire « tenu » — cela ne restaure pas le texte déjà mangé : l'effacement
  reste celui de la découverte. Le MJ, lui, voit tous les feuillets en texte intégral.

Deux notions de « feuillet acquis » coexistent dans le carnet, désormais **distinguées
visuellement** :

- l'**état de jeu de l'équipe**, gagné en jouant, s'affiche sous forme de pastille
  lisible : 🔒 Non trouvé · 🗺️ Trouvé · 📖 Lu · ✋ Tenu · 🌫️ Effacé (les anciens libellés
  techniques en anglais ne sont plus montrés) ;
- le **marquage pédagogique personnel** s'appelle maintenant « **Marquer comme étudié** »
  (« ✓ Étudié »), et n'est **proposé que sur un feuillet effectivement accessible** :
  tant qu'un feuillet est verrouillé en partie, on ne peut pas le marquer étudié (on ne
  peut pas étudier ce qu'on ne peut pas lire).

### Les feuillets d'ouverture

Quelques feuillets ne se méritent pas : ils **posent la situation** (la boîte confiée à
la classe, le pacte du seuil, ce que voit un gnome, ce que garde une licorne, les formes
de Sélène). Ils sont **donnés à chaque équipe au démarrage de la partie**, quel que soit
le chapitre, sans QCM, sans coût en gemmes et sans effacement — une équipe créée après
le démarrage reçoit le même lot. La classe commence donc avec le cadre du récit en main
plutôt qu'avec un carnet vide.

Le lot est **piloté par la donnée** : dans **Contenus → Carnet de Sélène**, le champ
« offert à l'ouverture » d'un feuillet le fait entrer ou sortir du lot (modifiable aussi
en masse sur une sélection). Aucun développement n'est nécessaire pour l'ajuster.

### La liasse du copiste, en fin de voyage

Le copiste ponctue déjà le voyage (un feuillet par milieu, un à l'entrée de chaque pays),
mais sa **liasse personnelle** — sa préface, ses marginalia, ses trois actes, sa confession,
et les deux pages qui expliquent que le carnet de Sélène s'arrête sur un mot suspendu — est
d'un autre ordre : une réflexion _sur_ l'histoire, à lire quand elle a été vécue.

Elle est donc **remise en bloc à la clôture** d'une partie du **dernier plateau** (chapitre
adossé au plateau 5) : la partie passe en « terminée », chaque équipe reçoit la liasse
entière, sans QCM et sans coût. Deux raisons à ce déclenchement tardif : livrée plus tôt,
elle dévoilerait la fin ; jamais livrée, elle laisserait croire qu'il manque un feuillet.

Pour une classe qui s'arrête avant le chapitre 5, ou pour une dernière séance dédiée, le MJ
peut **remettre une liasse à la demande** (ouverture ou clôture) depuis la console : la
remise est sans effet sur les feuillets déjà trouvés, elle ne fait que compléter.

La liasse se lit dans l'**ordre du récit** : les trois « actes » du copiste y sont placés là
où son texte les appelle — le premier au début du voyage, le deuxième juste après la scène de
la tourbière qu'il commente, le troisième en tout dernier, après les feuillets vierges.

> ⚠️ **Point d'attention** — La découverte par zone-feuillet exige que le chapitre
> soit **rattaché à un plateau (1 à 5)** compatible. Un chapitre sans plateau rend
> ses feuillets de carte inatteignables — l'éditeur de chapitre affiche désormais un
> **avertissement** dans ce cas.

### Passer d'un chapitre à l'autre : le seuil

Concrètement, deux façons de faire : **changer le chapitre d'une partie** (possible
seulement en brouillon ou en pause — équipes et joueurs restent en place), ou, plus
couramment, **créer une nouvelle partie** sur le chapitre suivant (les scores
repartent alors de zéro ; les cœurs et gemmes des joueurs, eux, suivent).

C'est le moment de mobiliser le récit « [Les deux peuples du
seuil](lore-deux-peuples.md) » : chaque frontière de biome est un **seuil** qui défait
la forme et en donne une autre. Le MJ peut donc **changer le peuple et la mascotte
d'une équipe entre deux chapitres** (c'est modifiable à tout moment dans la console)
et l'annoncer comme un passage de seuil : « le seuil donne la forme dont le prochain
territoire aura besoin ». Le changement de compagnon n'est pas un caprice du jeu —
c'est la traversée qui l'exige, comme pour Sélène, tantôt gnome, tantôt licorne.

### Les profils de séance en un clic

Dans Réglages → Gameplay, l'admin peut appliquer un **profil de séance** qui règle
d'un coup les tours, la narration, les actions joueurs, le score et les
restrictions « réservé au MJ » :

| Profil                    | Tours | Narration | Actions joueurs | Score | QCM réservés MJ | Sorts réservés MJ |
| ------------------------- | :---: | :-------: | :-------------: | :---: | :-------------: | :---------------: |
| **Minimal**               |  non  |    non    |       non       |  non  |       non       |        non        |
| **MJ + tours**            |  oui  |    oui    |       non       |  non  |     **oui**     |      **oui**      |
| **MJ + tours interactif** |  oui  |    oui    |       non       |  non  |       non       |        non        |
| **Complet avec tours**    |  oui  |    oui    |       oui       |  oui  |       non       |        non        |
| **Complet libre**         |  non  |    non    |       oui       |  oui  |       non       |        non        |

En résumé : **Minimal** pour découvrir la carte (le MJ déplace tout) ; **MJ + tours**
pour une séance racontée où les joueurs sont spectateurs ; **MJ + tours interactif**
pour que l'équipe posée sur un repère réponde elle-même aux QCM ; **Complet avec
tours** pour le jeu structuré avec propositions d'actions ; **Complet libre** pour le
jeu ouvert sans rotation.

> ⚠️ **Point d'attention** — Les profils ne touchent **ni** aux modules (sortilèges,
> vitalité, forum…), **ni** au réglage « qui déplace les mascottes ». Appliquer
> « Complet libre » n'ouvre donc pas le déplacement aux joueurs : ce réglage se
> change séparément (voir [carte-du-royaume.md](carte-du-royaume.md)).

## Pour aller plus loin

- Le plateau, ses zones et ses repères : [carte-du-royaume.md](carte-du-royaume.md)
- Le socle narratif des seuils : [lore-deux-peuples.md](lore-deux-peuples.md)
- Rôles et connexion : [roles-et-connexion.md](roles-et-connexion.md)
