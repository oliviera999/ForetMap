# ForetMap — Présentation générale

> **Public de ce document : professeurs et administrateurs.**
> Il décrit ce que l'application fait aujourd'hui, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md)

## À quoi sert ForetMap ?

**ForetMap** est l'application de gestion de la **forêt comestible du Lycée Lyautey**
(jardin pédagogique). Elle permet de :

- **visualiser le jardin** sur une carte interactive, découpée en zones (potager,
  compostage, ruches, mare…) ;
- **documenter les plantes** dans un catalogue de fiches très complètes ;
- **organiser l'entretien** : des tâches que les élèves prennent en charge, réalisent
  avec preuve à l'appui, et que les professeurs valident ;
- **suivre la progression** des élèves (statistiques, paliers, classement) ;
- **accueillir le public** grâce à un mode Visite éditorial, animé par des mascottes ;
- **apprendre** via des modules pédagogiques : quiz, glossaire, réseau trophique,
  tutoriels, carnet d'observation.

## Qui utilise l'application ? Les rôles

Les droits de chacun découlent de son **rôle**, attribué à la connexion (les rôles et
leurs permissions sont configurables par les administrateurs) :

| Rôle                    | Qui c'est                                                             | Ce qu'il peut faire                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Visiteur**            | Toute personne qui vient de créer un compte, ou un curieux de passage | Essentiellement la Visite et la Biodiversité — pas d'accès à la carte de travail ni aux tâches                                                                       |
| **n3beur novice** 🪨    | Un élève débutant (0 tâche validée)                                   | Consulter la carte, prendre des tâches, les marquer faites, observer des espèces, tenir son carnet, participer au forum et aux quiz                                  |
| **n3beur avancé** 🌿    | Un élève avec 5 tâches validées                                       | Comme le novice (le palier récompense la progression)                                                                                                                |
| **n3beur chevronné** 🏆 | Un élève avec 10 tâches validées                                      | Comme l'avancé                                                                                                                                                       |
| **n3boss** (professeur) | Un enseignant                                                         | Tout gérer : zones, plantes, tâches et leur validation, contenus de visite, quiz, élèves et groupes, statistiques                                                    |
| **Administrateur**      | Un enseignant avec les pleins pouvoirs                                | Tout ce que fait un professeur, plus les réglages, les rôles, l'audit — et la possibilité de prévisualiser l'application telle que la voit un élève ou un professeur |

Les paliers « n3beur » montent **automatiquement** avec le nombre de tâches validées ;
une fenêtre de félicitations s'affiche à chaque promotion. Le vocabulaire
« n3beur / n3boss » est personnalisable dans les réglages.

**Connexion** : un seul écran pour tout le monde (identifiant — e-mail ou pseudo — et
mot de passe, ou compte Google). L'inscription des élèves se fait en autonomie
(prénom, nom, mot de passe) et peut être désactivée par un administrateur. Une
procédure « mot de passe oublié » par e-mail existe, et un administrateur peut
temporairement prendre la main sur un compte pour aider son propriétaire.

**Rejoindre sa classe** : à l'inscription, l'élève peut saisir le **code de classe**
fourni par son professeur — son compte rejoint alors directement le groupe et reçoit
le rôle d'élève (un code erroné est refusé, pour corriger la faute de frappe). Sans
code, le compte reste « visiteur » : un bandeau lui explique qu'un professeur doit le
rattacher, et le professeur voit la liste des **comptes en attente** dans la gestion
des groupes, avec un rattachement en un clic. Chaque groupe génère son code dans son
panneau de réglages (régénérable à tout moment, l'ancien code devenant invalide).

## Le tour des fonctionnalités

### La carte et les zones

Le cœur de l'application : un ou plusieurs **plans** du jardin (avec image de fond, et
géolocalisation optionnelle), découpés en **zones** de toutes formes. Chaque zone porte
sa plante en cours, son stade (en pousse, prête à récolter, vide…), sa description, ses
photos, son historique de récoltes et ses espèces associées. Des **repères** ponctuels
(avec emoji, note, photos) complètent les zones.

- **L'élève** consulte : il ouvre une zone ou un repère et découvre sa fiche, ses
  photos et les tâches qui s'y rattachent.
- **Le professeur** édite tout : dessin des zones, repères, photos, historique.

### La biodiversité (le catalogue de plantes)

Des fiches plantes très détaillées : noms (usuel, scientifique), famille, habitat,
cycle de vie, comestibilité, rôle dans l'écosystème, besoins (température, sol),
photos (plante, feuille, fleur, fruit…), conseils de plantation, sources.

- **L'élève** explore le catalogue avec des filtres et peut marquer des espèces comme
  **observées** dans le jardin.
- **Le professeur** crée et enrichit les fiches, avec deux aides précieuses : le
  **pré-remplissage automatique** (l'application va chercher les informations dans des
  bases naturalistes de référence) et l'**identification par photo** (on photographie
  la plante, l'application propose l'espèce). Un import en masse existe aussi.

### Les tâches et leur validation

Le moteur pédagogique de l'application :

1. Le professeur crée des **tâches** (souvent regroupées en **projets**) : arroser,
   désherber, pailler… Chaque tâche indique sa zone, son niveau de danger, de
   difficulté et d'importance, le nombre d'élèves requis, ses échéances, ses tutoriels
   et son professeur référent.
2. **L'élève se positionne lui-même** sur une tâche disponible (il peut aussi se
   retirer tant qu'il n'a pas commencé, et même **proposer** ses propres idées de
   tâches au professeur).
3. Une fois le travail fait, l'élève le **marque comme réalisé**, avec un commentaire
   et une photo en guise de preuve.
4. Le professeur **valide** (ou pas). Chaque validation fait progresser l'élève vers
   le palier suivant.

Le professeur peut aussi affecter un groupe entier à une tâche, importer des tâches en
masse, et programmer des **tâches récurrentes** (générées automatiquement chaque jour).

### Les modules pédagogiques

- **Quiz** : questions à choix multiples, administrées par le professeur.
- **Glossaire** : le vocabulaire du jardin, relié aux plantes et aux quiz.
- **Réseau trophique** : un graphe interactif « qui mange qui / qui aide qui » entre
  les espèces du jardin, édité par le professeur.
- **Tutoriels** : fiches pratiques (arrosage, compostage…) liées aux tâches et zones,
  avec accusé de lecture par l'élève.
- **Carnet d'observation** : le journal libre de l'élève (texte + photo), consultable
  par le professeur.

### La Visite (le mode grand public)

Un parcours de découverte du jardin, distinct de la carte de travail : zones et repères
de visite avec textes soignés, médias et tutoriels associés. L'application retient ce
que chaque visiteur a déjà vu. Des **mascottes animées** accompagnent la visite
(personnages qui se déplacent au clic sur la carte et dialoguent) ; les professeurs
les créent dans un studio dédié (« packs mascotte »). Le suivi de la position GPS
existe, lui, sur la carte de travail des élèves.

### La vie sociale et le suivi

- **Forum** : fils de discussion avec réactions, images, signalements et modération ;
  il peut être cloisonné par groupe. Des **commentaires contextuels** peuvent aussi
  être attachés à une tâche, un projet ou une zone.
- **Statistiques** (professeur) : tableau de bord par élève et par statut de tâche,
  classement, progression, export tableur. L'accès des élèves aux statistiques
  générales est réglable.
- **Notifications**, **visite guidée** de prise en main et **panneau d'aide** : l'écran
  se met à jour en temps réel (une validation apparaît chez l'élève sans recharger).

### L'administration

Réservée aux professeurs/administrateurs : gestion des **utilisateurs et des rôles**
(création et import d'élèves, permissions configurables), des **groupes** (classes,
équipes, clubs — avec sous-groupes, responsables et périmètre), des **réglages**
(activation/désactivation de modules : forum, tutoriels, observations, visite,
stats…), d'une **médiathèque** d'images réutilisables, et d'un **journal d'audit** des
actions sensibles.

## Comment l'écran s'organise

- **L'élève** navigue par une barre d'onglets en bas d'écran : Carte, Tâches,
  Biodiversité, Quiz, Glossaire, Réseau, Tuto, Carnet, Visite, Forum… (l'application
  fonctionne très bien sur téléphone et peut s'installer comme une appli).
- **Le professeur** navigue par une barre en haut, avec les mêmes rubriques plus ses
  outils : Stats, Packs mascotte, Médiathèque, Profils & utilisateurs, Paramètres,
  Audit.
- **Le visiteur** voit une version réduite, centrée sur la Visite et la Biodiversité.

> ℹ️ **Navigation** — Les onglets sont stables : Tâches et Tuto sont toujours séparés.
> Deux variations légitimes subsistent : sur grand écran, une vue « Cartes & tâches »
> affiche la carte et les tâches côte à côte ; et un onglet disparaît si son module
> est désactivé dans les réglages.

## ⚠️ Points d'attention sur l'existant

État des lieux honnête, relevé en examinant le fonctionnement actuel :

Points résolus le 2026-07-08 (détail dans le [registre](../INCOHERENCES.md)) :

- ✅ **Navigation stabilisée** : Tâches et Tuto sont désormais des onglets séparés en
  toutes circonstances (la fusion contextuelle est supprimée). Restent seulement
  l'adaptation grand écran — la vue « Cartes & tâches » qui affiche la carte et les
  tâches côte à côte — et le masquage d'un onglet quand son module est désactivé.

- ✅ **Parcours du nouvel inscrit clarifié** : un compte non rattaché voit maintenant un
  bandeau d'explication ; le professeur dispose d'une liste « comptes en attente » avec
  rattachement en un clic ; et chaque groupe peut porter un **code de classe** que
  l'élève saisit à l'inscription pour rejoindre directement sa classe (un code erroné
  est refusé clairement, sans créer de compte).

- ✅ **Sécurité des actions élèves** : toutes les actions (tâches, propositions, carnet
  d'observation) vérifient désormais l'identité côté serveur — agir au nom d'un autre
  élève est refusé. Des points voisins sur les images restent suivis dans l'audit
  technique interne.
- ✅ **Vestiges de l'ancien « mode prof par PIN »** purgés (écrans et documents).
- ✅ **Doublons internes** assainis : le mode Visite n'a plus qu'une génération de
  contenus, et le lien tâche ↔ zones/repères n'a plus qu'une seule source de vérité.

## Pour aller plus loin

Documents spécifiques (produits au fur et à mesure — voir le
[sommaire](../README.md)) : carte et zones · plantes et biodiversité · tâches,
tutoriels et validation · comptes, rôles et groupes · visite et mascottes · pédagogie
(quiz, glossaire, réseau trophique) · stats, forum et suivi.
