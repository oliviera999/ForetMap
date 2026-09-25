# Niveaux pédagogiques biodiversité et séances types

> **Public de ce document : professeurs et administrateurs.**
> Il décrit le **fonctionnement souhaité** pour adapter la biodiversité au niveau des
> élèves, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md)

> **Lot A livré :** les trois niveaux d’affichage, les réglages (compte, carte, groupe,
> défaut établissement), la visite invitée en Collège, l’aperçu professeur (menu
> **Aperçu** de l’en-tête), et les masquages catalogue / réseau / groupes / individus / quiz-glossaire
> sont **en place**. Deux **séances guidées** collège sont disponibles dans l’onglet
> **Séances**, avec un suivi simple « démarrée / terminée » (section dédiée plus bas).

## À quoi ça sert

Les outils biodiversité de ForetMap vont du **catalogue pour le collège** jusqu’à des
fonctions utiles en **formation universitaire** (qualité des preuves, estimations de
biomasse, arbre de classification). Sans cadrage, un collégien se retrouve face à un
« cockpit » trop dense.

Ce document fixe :

1. **trois niveaux d’affichage** — Collège, Lycée, Université — pour rester **simple
   au secondaire** ;
2. **où régler** le niveau (préférence de l’utilisateur, carte, groupe) ;
3. le comportement de la **visite invitée** ;
4. des **séances types** (papier / projet de parcours) pour guider une classe sans tout
   ouvrir d’un coup.

## Les trois niveaux

Le principe : **le secondaire reste léger** ; l’université dévoile le reste. Un
professeur ou un admin voit toujours l’intégralité des outils de gestion (édition,
validation des dangers, administration des clés et des groupes), quel que soit le
niveau choisi pour les élèves.

### Collège

Public typique : cycles 3 et 4, découverte et sortie de terrain.

- Fiches : nom usuel, danger et risque sanitaire bien visibles, détermination simple.
- Réseau trophique : types « scolaires » (prédation, herbivorie, pollinisation,
  parasitisme, décomposition, détritivorie…). Pas de jargon sur la solidité du lien
  (hypothèse / observé) ni d’efficacité du pollinisateur. La **détritivorie** — le ver de
  terre qui mange la litière — y figure depuis le 25 septembre 2026 : ces animaux portent
  la pastille « Détritivore » à tous les niveaux, et leur réseau montre ce qu’ils mangent.
- Clés d’identification : **lecture** guidée (mode Questions, une fourche à la fois) ;
  le mode **Schéma** (arbre de la clé) reste disponible pour visualiser la structure.
- Quiz et glossaire : notions de **cycle 3 et cycle 4** mises en avant — et seulement du
  cycle 3 pour une classe dont le niveau du programme est « Cycle 3 » (voir
  [plus bas](#les-échelles-de-niveau-et-leurs-correspondances)). Le quiz propose d'emblée
  les questions « Collège ».
- Groupes emboîtés, suivi d’arbres avec formules, détails GBIF / classification latine :
  **masqués** ou uniquement proposés dans une séance préparée par le professeur.

### Lycée

Public typique : seconde, spécialité SVT, enseignement scientifique.

- Tout le collège, plus :
  - nom accepté et classification latine **repliables** ;
  - notes « Sur ce site » ;
  - fil de groupes emboîtés sur la fiche ;
  - activité « Groupes emboîtés » ;
  - réseau avec types enrichis et **niveau de preuve** des liens (documenté / observé /
    hypothèse), légende claire ;
  - suivi d’un arbre : mesures et courbe de croissance ;
  - estimations (biomasse, carbone, CO₂) : **repliées** sous un titre du type « Pour
    aller plus loin — ordre de grandeur », avec le rappel que la formule vient d’arbres
    tropicaux ;
  - clés d’identification : le mode **Schéma** aide à voir la structure de la clé
    (au-delà du fil Questions).
- Quiz / glossaire : toutes les notions du référentiel livré (seconde à terminale
  incluses).

### Université

Public typique : licence, formation d’enseignants, projets de recherche pédagogique.

- Tout le lycée, plus l’affichage **déplié** des outils experts :
  - estimations biomasse / carbone / CO₂ visibles sans les cacher derrière un repli ;
  - détails de qualité des liens et d’efficacité de pollinisation pleinement exposés ;
  - classification latine et référentiel scientifique (lien GBIF) au premier plan ;
  - liberté d’explorer l’arbre des groupes et les clés sans parcours imposé (mode
    Schéma particulièrement utile pour parcourir la structure).

> **Rappel** — « Université » ne crée pas un nouveau rôle dans l’établissement : c’est
> un **niveau d’affichage**. Les comptes élèves du lycée peuvent être placés en
> « Université » pour un projet ponctuel (TIPE, club science, journée d’étude).

## Qui règle le niveau, et où

Trois endroits complémentaires :

| Où                              | Qui le règle                                            | À quoi ça sert                                                                            |
| ------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Préférence de l’utilisateur** | L’élève (ou le personnel) pour **son** compte           | « Je préfère la vue collège » même si la classe est en lycée — confort et accessibilité.  |
| **Carte**                       | Professeur / admin sur une carte (forêt, daya, sortie…) | Une sortie terrain « collège » sur la daya, une carte « lycée » pour la forêt comestible. |
| **Groupe**                      | Professeur / admin sur un groupe (classe, club…)        | Toute la 4ᵉ B en collège ; le club SVT Terminale en lycée ou université.                  |

### Ordre quand plusieurs réglages coexistent

Du plus fort au plus faible :

1. **Visite invitée** → toujours **Collège** — non contournable.
2. **Aperçu professeur** « Affichage biodiversité — Collège / Lycée / Université » (session
   uniquement) : pour vérifier ce que voit un élève, sans changer les réglages du site.
   Voir [Le menu Aperçu](#le-menu-aperçu) ci-dessous.
3. **Socle** :
   - si la **carte** active ou un **groupe** de l’élève a un niveau explicite, on
     retient le **plus simple** parmi ces niveaux (plusieurs groupes : le plus simple
     l’emporte ; un groupe ou une carte laissés sur « hériter » ne comptent pas) ;
   - si **aucun** niveau n’est fixé sur la carte ni sur les groupes, on utilise le
     **défaut de l’établissement** (réglage admin ; **Collège** par défaut).
4. **Préférence personnelle** : par défaut elle ne peut que **simplifier** par rapport
   au socle. Un administrateur peut cocher l’option qui autorise à **relever** le niveau
   (projets ponctuels, club science…).

Pour un public **lycée** ou un **club / TIPE**, on relève le niveau sur la **carte** ou
le **groupe** concerné, plutôt que de changer le défaut de tout le site.

Sans aperçu, un **professeur** voit toujours la vue gestion **complète** (édition,
validation, administration), quel que soit le niveau fixé pour les élèves.

### Le menu Aperçu

Dans l’en-tête, le bouton **Aperçu** (icône en forme d’œil) réunit en un seul endroit
tout ce qui permet à un professeur de voir l’application « avec les yeux d’un autre » :

- **Interface** : _Ma vue habituelle_, _Vue élève_ (navigation en bas, écrans élève) et,
  pour un administrateur, _Vue professeur_ (interface sans les boutons d’administration) ;
- **Affichage biodiversité** : _Complet (vue gestion)_, _Collège_, _Lycée_ ou
  _Université_. En vue élève, l’option automatique s’appelle _Automatique (carte et
  groupe)_ : le niveau suit alors les mêmes règles que pour un vrai élève.

Les deux se combinent : « Vue élève · Affichage Collège » montre exactement ce que voit
un collégien. Dès qu’un aperçu est actif, le bouton se colore et **un seul bandeau**
rappelle ce qui est simulé, avec un bouton **Quitter l’aperçu** qui remet tout à zéro.
Les droits réels du professeur ne changent jamais ; le choix de niveau est oublié à la
fermeture du navigateur.

## Les échelles de niveau et leurs correspondances

Plusieurs « niveaux » coexistent dans l'application, chacun né d'un besoin différent. Ils
sont désormais **reliés entre eux** par une seule table de correspondance, dont la
référence commune est le **niveau du programme** (du cycle 3 à la terminale) :

| Échelle                               | Où on la trouve               | Valeurs                                                           | Correspondance                                                                      |
| ------------------------------------- | ----------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Affichage biodiversité**            | compte, carte, groupe, séance | Collège, Lycée, Université                                        | Collège = cycles 3 et 4 ; Lycée = seconde → terminale ; Université = au-delà (tout) |
| **Niveau de la classe** (nouveau)     | groupe                        | Cycle 3, Cycle 4, Seconde, Première, Terminale (SVT ou ens. sci.) | c'est la référence elle-même                                                        |
| **Niveau d'une question** / d'une clé | quiz, clés d'identification   | Collège, Lycée                                                    | une question « Collège » vaut dès le cycle 3, une question « Lycée » dès la seconde |
| **Profondeur d'un terme**             | glossaire                     | Base, Approfondissement, Avancé                                   | Base dès le cycle 3, Approfondissement dès le cycle 4, Avancé dès la seconde        |
| **Difficulté d'une question**         | quiz                          | ★ à ★★★★★                                                         | indépendante : elle classe les questions **à l'intérieur** de leur niveau           |
| **Niveau d'une notion**               | notions des programmes        | Cycle 3 → Terminale                                               | c'est la référence elle-même                                                        |

Ce que ça change concrètement :

- **Un quiz « cycle 4 » ne tire plus de questions de lycée.** Une question n'hérite des
  notions de sa catégorie que si elles sont de son niveau ou au-dessus. Avant, un tirage
  « cycle 4 » — celui des séances collège — sortait une question de lycée sur trois.
- **Le glossaire est relié aux notions.** Le filtre par notion de l'onglet Glossaire
  fonctionne (il ne renvoyait rien), et la fiche d'un terme affiche « Au programme ».
- **On peut distinguer une 6ᵉ d'une 3ᵉ.** Le groupe porte un **niveau du programme de la
  classe**. Réglé une fois sur l'unité « Niveau 6ᵉ », il vaut pour toutes ses classes
  (un groupe laissé vide hérite de son parent). Il resserre les notions proposées à ses
  élèves (une classe de cycle 3 ne voit plus le cycle 4) et, si l'affichage biodiversité
  du groupe est laissé en automatique, il le fixe : cycles 3 et 4 → Collège, seconde et
  au-delà → Lycée.
- **Les séances suivent la classe.** Une séance qui demande « tout le collège » tire, pour
  une 6ᵉ, dans le cycle 3 seulement. Une séance qui vise explicitement un cycle (« cycle 4 »)
  est respectée telle quelle : c'est le choix du professeur. Les séances lycée, qui
  demandaient « tout le lycée », fonctionnent (elles étaient refusées).

> ⚠️ **Point d'attention** — Tant qu'aucun groupe n'a de niveau du programme, rien ne
> distingue le cycle 3 du cycle 4 : tout le monde est traité en « Collège » (cycles 3 et 4).
> Pour une classe de 6ᵉ, régler **Cycle 3** sur l'unité ou la classe (Profils &
> utilisateurs → Groupes → Réglages).

## Visite invitée

> Décision validée : en **visite sans compte** (invité), le niveau est **toujours
> Collège**.

Objectifs : langage adapté aux familles et au grand public, pas d’estimations
scientifiques avancées, pas d’outils de conception pédagogique. Les fiches et la
biodiversité des lieux restent consultables ; le « cockpit » lycée / université non.

Voir aussi [Visite et mascottes](visite-et-mascottes.md).

## Tableau récapitulatif — ce que voit un élève

Légende : **O** = visible · **R** = replié / discret · **—** = masqué · **S** = seulement
dans une séance lancée par le professeur (quand les séances guidées existeront).

| Élément                                       | Collège            | Lycée    | Université |
| --------------------------------------------- | ------------------ | -------- | ---------- |
| Fiche : nom, danger, risque sanitaire         | O                  | O        | O          |
| Nom accepté, lien GBIF, classification latine | — ou R             | R        | O          |
| Notes « Sur ce site »                         | O                  | O        | O          |
| Fil long de groupes emboîtés                  | — / S              | O        | O          |
| Activité groupes emboîtés (libre)             | — / S              | O        | O          |
| Réseau : types scolaires                      | O                  | O        | O          |
| Réseau : types avancés + preuve du lien       | —                  | O        | O          |
| Clé : lecteur                                 | O                  | O        | O          |
| Clé : éditeur                                 | — (prof seulement) | — (prof) | — (prof)   |
| Quiz / glossaire : cycles 3–4                 | O                  | O        | O          |
| Quiz / glossaire : lycée / ES                 | — ou en bas        | O        | O          |
| Individu : label + mesures                    | — / S              | O        | O          |
| Individu : biomasse / CO₂                     | —                  | R        | O          |
| Validation des dangers, admin clés / clades   | — (prof)           | — (prof) | — (prof)   |

## Séances types (guide + lanceur app)

L’onglet **Séances** propose des enchaînements guidés, une étape à la fois, qui ouvrent
les outils déjà présents : clé, fiche, réseau, quiz, arbre suivi, boîtes emboîtées et
parcours sur la carte.

- Deux séances collège (A et B) sont prêtes et publiées.
- Deux séances lycée (C et D) existent **en brouillon** : le professeur choisit l’arbre
  suivi (C) ou les six espèces (D), puis publie.
- Pour les séances types, la suite des étapes est fixe : le professeur règle seulement
  carte, clé, plantes, arbre suivi et quiz.
- Le professeur peut aussi créer une **séance libre** et composer lui-même ses étapes :
  ajouter, monter, descendre, supprimer, et choisir pour chacune l’outil ouvert et sa
  cible (une espèce, un arbre, un parcours…). Au moment de publier, l’application vérifie
  que chaque cible existe toujours ; sinon elle refuse en disant laquelle manque.
- Toute nouvelle séance est créée en brouillon depuis la liste « Nouvelle séance ».

Les **parcours** sur la carte (Visite / Carte) restent un outil à part — des lieux à
visiter —, mais une étape de séance peut en lancer un directement sur la carte.

Les séances, les clés d'identification, les individus suivis et les badges sont des
**modules activables** : un administrateur peut éteindre chacun d'eux dans **Paramètres →
Accueil & modules** (détail dans [presentation.md](presentation.md), section
« L'administration »). Si les clés ou les individus sont éteints alors que les séances restent
allumées, une étape qui devait ouvrir une clé ou un arbre suivi reste sur l'onglet
**Séances** : l'élève lit la consigne dans le bandeau et passe à l'étape suivante.

### Partager une séance (lien direct et QR code)

- Sur chaque séance, le bouton **Partager** donne un lien direct et un **QR code** à
  imprimer ou à afficher sur le terrain.
- En scannant le code, l’élève arrive dans l’application et la séance démarre. S’il doit
  d’abord se connecter, elle démarre juste après la connexion.
- Une séance encore en brouillon peut être partagée, mais le lien ne fonctionnera pour
  les élèves qu’une fois la séance publiée.

### Enchaîner les séances (prérequis) et badges

- Le professeur peut indiquer qu’une séance ne s’ouvre qu’**après une autre** : elle
  apparaît alors avec un cadenas « Termine d’abord … » tant que l’élève n’a pas terminé
  la première.
- Les professeurs ne sont jamais bloqués par un prérequis, pour pouvoir préparer et
  montrer la séance.
- En terminant des séances, l’élève gagne des **badges** : première séance, trois séances
  différentes, séance refaite, séance de niveau lycée. Les nouveaux badges s’affichent
  dans la fenêtre de fin de séance. Le catalogue affiche « Mes badges », avec ceux qui
  restent à gagner.

### Lancer une séance depuis une tâche

- Dans le formulaire d’une tâche, le professeur peut choisir une **séance liée**.
- La carte de la tâche affiche alors un bouton **« Lancer la séance »**.
- Terminer la séance **ne valide pas** la tâche : la validation reste une décision du
  professeur, comme avant.

### Fin de séance, suivi et carnet

- Quand l’élève clique sur **Terminer** à la dernière étape, une fenêtre « Séance
  terminée » s’affiche.
- Si le carnet est activé, elle propose **« Ajouter une note à mon carnet »** : une note
  est créée avec le titre de la séance, la liste des étapes suivies, les plantes vues
  (sous forme de vignettes) et deux questions à compléter, « Ce que j’ai observé » et
  « Ce que j’ai appris ». Rien n’est ajouté sans ce clic ; l’élève peut ensuite ouvrir
  son carnet et compléter la note quand il veut.
- Dans le catalogue, une séance déjà terminée porte l’étiquette **« Terminée »** (avec
  « ×2 », « ×3 »… si elle a été refaite).
- Le professeur voit sur chaque séance : **« Démarrée par N · terminée par M »**. Ce sont
  des nombres de personnes, sans aucun nom.
- Le bouton **Suivi** donne le détail **par élève** : pas commencée, en cours, ou
  terminée (combien de fois, et la date de la dernière fin).
  - Si le professeur choisit un **groupe**, il voit tous les élèves du groupe, y compris
    ceux qui n’ont pas encore ouvert la séance.
  - Sans groupe choisi, il voit les élèves qui ont ouvert la séance.
  - Un professeur ne voit que les groupes de son périmètre.

> ⚠️ **Point d'attention** — Le suivi ne concerne que les personnes **connectées** : une
> visite invitée peut suivre une séance, mais ne laisse aucune trace et ne voit pas
> l’étiquette « Terminée ».

> ⚠️ **Point d'attention** — « Terminée » veut seulement dire que l’élève est allé
> jusqu’au bout du bandeau. Ce n’est **pas une preuve de compréhension** : le mini-quiz
> et la note du carnet restent les vrais supports d’évaluation.

> ⚠️ **Point d'attention** — Les badges récompensent la **régularité**, pas la réussite :
> ils se gagnent en terminant des séances, pas en répondant juste au quiz.

> ⚠️ **Point d'attention** — Le prérequis d’une séance et le déblocage des chapitres de
> Gnomes & Licornes sont deux mécanismes distincts : régler l’un ne change rien à l’autre.

### Séance A — Collège · 45 min · « Reconnaître sans toucher »

1. Rappeler la règle de visite : on décrit ce qu’on **voit**, sans cueillir ni manipuler.
2. Lancer une **clé d’identification** adaptée au lieu.
3. Ouvrir la **fiche** de l’espèce atteinte ; lire danger / risque sanitaire.
4. Faire un **mini-quiz** sur une notion de classification ou d’identification (cycle 3
   ou 4 : « tout le collège », resserré au cycle de la classe si elle en a un).

### Séance B — Collège · 45 min · « Qui mange qui sur le site »

1. Choisir **trois fiches** présentes sur la carte de la sortie (notes de site si
   renseignées).
2. Ouvrir le **réseau** filtré sur cette carte, en ne commentant que prédation,
   herbivorie, pollinisation.
3. Mini-quiz sur une notion d’écologie / réseaux (cycle 4). Pour une classe de 6ᵉ, le
   professeur peut passer le quiz de la séance en « Cycle 3 » ou « Tout le collège ».

### Séance C — Lycée · 90 min · « Un arbre qui grandit »

Disponible en brouillon : le professeur choisit l’arbre suivi puis publie.

1. Ouvrir un **individu suivi** (arbre identifié) sur la carte.
2. Saisir la **circonférence** (et la hauteur si possible).
3. Lire le **graphique** de croissance.
4. Ouvrir le volet « ordre de grandeur » (biomasse / carbone / CO₂) et discuter des
   limites (formule pour arbres tropicaux).
5. Relier à une notion climat / carbone ou agrosystèmes du référentiel.

### Séance D — Lycée · 45 min · « Classer pour de vrai »

Disponible en brouillon : le professeur choisit les six espèces puis publie.

1. Le professeur choisit **six espèces** d’une carte.
2. Les élèves placent les espèces dans les **boîtes emboîtées** (activité groupes).
3. Correction et discussion sur le **caractère partagé** de chaque groupe.
4. Mini-quiz classification / biodiversité.

## Points d’attention

> ⚠️ **Point d'attention** — Tant que les niveaux ne sont pas dans le code, **éviter de
> laisser une classe de collège seule** face au réseau complet, à l’activité groupes
> emboîtés libre, ou aux estimations d’arbres. Préférer les séances A et B, et le
> commentaire oral du professeur.

> ⚠️ **Point d'attention** — Le mot « niveau » existe déjà pour autre chose (niveau
> d’une question de quiz collège/lycée, profondeur d’un terme de glossaire, niveau du
> programme d'une classe). Ici il s’agit du **niveau pédagogique d’affichage** de la
> biodiversité : l’interface le nomme toujours « Affichage biodiversité » ou « Affichage
> Collège » pour rester distinct. Les correspondances entre toutes ces échelles sont
> dans [le tableau ci-dessus](#les-échelles-de-niveau-et-leurs-correspondances).

> ⚠️ **Point d'attention** — L’éditeur de visite garde sa propre bascule « Aperçu comme
> élève », qui ne concerne que le rendu de la visite et n’apparaît pas dans le menu
> Aperçu de l’en-tête.

## Renvois

- [Plantes et biodiversité](plantes-et-biodiversite.md) — fiches, dangers, groupes,
  individus, clés ;
- [Quiz, glossaire, réseau](pedagogie-quiz-glossaire-reseau.md) — notions des programmes,
  réseau trophique ;
- [Carte et zones](carte-et-zones.md) — cartes (futur réglage par carte) ;
- [Comptes, rôles et groupes](comptes-roles-et-groupes.md) — groupes (futur réglage par
  groupe) ;
- [Visite et mascottes](visite-et-mascottes.md) — visite invitée.
