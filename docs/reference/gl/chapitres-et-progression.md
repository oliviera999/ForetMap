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
  (le canal principal), par le **récit** (prologue), ou à l'occasion de l'**étude
  d'une espèce**. Une découverte peut **coûter des gemmes** et **rapporter des
  cœurs** (réglable), et le texte peut être partiellement « mangé par le Souffle »
  (effacement progressif, réglable). L'équipe passe ensuite du feuillet « découvert »
  à « lu », voire « tenu ». Le MJ, lui, voit tous les feuillets en texte intégral.

Deux notions de « feuillet acquis » coexistent dans le carnet, désormais **distinguées
visuellement** :

- l'**état de jeu de l'équipe**, gagné en jouant, s'affiche sous forme de pastille
  lisible : 🔒 Non trouvé · 🗺️ Trouvé · 📖 Lu · ✋ Tenu · 🌫️ Effacé (les anciens libellés
  techniques en anglais ne sont plus montrés) ;
- le **marquage pédagogique personnel** s'appelle maintenant « **Marquer comme étudié** »
  (« ✓ Étudié »), et n'est **proposé que sur un feuillet effectivement accessible** :
  tant qu'un feuillet est verrouillé en partie, on ne peut pas le marquer étudié (on ne
  peut pas étudier ce qu'on ne peut pas lire).

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
