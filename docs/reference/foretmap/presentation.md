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

| Rôle                    | Qui c'est                                       | Ce qu'il peut faire                                                                                                                                                               |
| ----------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Visiteur**            | Compte non promu (classe sans tâches, passage…) | Essentiellement la Visite et la Biodiversité — pas d'accès à la carte de travail ni aux tâches                                                                                    |
| **Personnel**           | Staff non enseignant (AED, vie scolaire…)       | Même parcours que le visiteur — Visite et Biodiversité seulement                                                                                                                  |
| **n3beur novice** 🪨    | Un élève débutant (0 tâche validée)             | Consulter la carte, prendre des tâches, les marquer faites, observer des espèces, tenir son carnet, participer au forum et aux quiz                                               |
| **n3beur avancé** 🌿    | Un élève avec 5 tâches validées                 | Comme le novice (le palier récompense la progression)                                                                                                                             |
| **n3beur chevronné** 🏆 | Un élève avec 10 tâches validées                | Comme l'avancé                                                                                                                                                                    |
| **Prof de classe**      | Enseignant tuteur d'une ou plusieurs classes    | Gérer les élèves **de ses groupes** seulement — pas les tâches ni le jardin                                                                                                       |
| **n3boss**              | Animateur / responsable pédagogique forêt       | Gestion pédagogique large : zones, plantes, tâches et validation, visite, quiz, élèves, stats, **carnet personnel** — **ce n'est pas** l'administrateur                           |
| **Administrateur**      | Compte aux pleins pouvoirs établissement        | Tout le n3boss (y compris carnet personnel), plus les réglages, les rôles, l'audit — et la possibilité de prévisualiser l'application telle que la voit un élève ou un professeur |

Les paliers « n3beur » montent **automatiquement** avec le nombre de tâches validées ;
une fenêtre de félicitations s'affiche à chaque promotion. Le vocabulaire
« n3beur / n3boss » est celui de l'établissement ; les **noms affichés des profils**
(y compris ces libellés) se règlent dans **Paramètres → Profils & utilisateurs**.

Deux métiers d'enseignant coexistent : le **n3boss** pilote la forêt et les tâches
(vue globale des élèves) ; le **prof de classe** suit sa classe avec la **même
interface** qu’un visiteur connecté (Visite, Biodiversité, apprentissages), plus
la liste et les statistiques de **ses** élèves. Détail :
[Comptes, rôles et groupes](comptes-roles-et-groupes.md).

**Connexion** : un seul écran pour tout le monde (identifiant — e-mail ou pseudo — et
mot de passe, ou compte Google). L'inscription des élèves se fait en autonomie
(prénom, nom, mot de passe) et peut être désactivée par un administrateur. La
**connexion Google** ne crée un compte que si un administrateur l'a explicitement
autorisé dans les réglages (désactivé par défaut) : sinon Google ne connecte que
les comptes déjà présents. Un compte **enseignant** (prof de classe, n3boss…)
doit toujours être créé avant ; Google ne le crée jamais, et un message explique
les causes en cas d'échec. Une procédure « mot de passe oublié » par e-mail existe,
et un administrateur peut temporairement prendre la main sur un compte pour aider
son propriétaire.

**Rejoindre sa classe** : à l'inscription, l'élève peut saisir le **code de classe**
fourni par son professeur — son compte rejoint alors directement le groupe et reçoit
le rôle d'élève (un code erroné est refusé, pour corriger la faute de frappe). Sans
code, le compte reste « visiteur » : un bandeau lui explique qu'un professeur doit le
rattacher, et le professeur voit la liste des **comptes en attente** dans la gestion
des groupes, avec un rattachement en un clic. Chaque groupe génère son code dans son
panneau de réglages (régénérable à tout moment, l'ancien code devenant invalide).

À la **rentrée**, l'administrateur peut aussi peupler les groupes-classes (et les classes
de jeu pour les sixièmes) depuis les **cohortes Moodle**, sans ressaisir les élèves — voir
[La rentrée avec Moodle](rentree-moodle.md).

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
masse, et programmer des **tâches récurrentes** (générées automatiquement les jours ouvrés scolaires).

### Les modules pédagogiques

- **Quiz** : questions à choix multiples, administrées par le professeur.
- **Glossaire** : le vocabulaire du jardin, relié aux plantes et aux quiz.
- **Réseau trophique** : un graphe interactif « qui mange qui / qui aide qui » entre
  les espèces du jardin, édité par le professeur.
- **Tutoriels** : fiches pratiques (arrosage, compostage…) liées aux tâches et zones,
  avec accusé de lecture par l'élève.
- **Carnet d'observation** : journal personnel (articles texte/photos, imports d’espèces,
  glossaire et tutoriels appris) pour **tout compte connecté** ; consultable par les
  professeurs selon leur périmètre.

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
  se met à jour en temps réel (une validation, une observation, un message forum
  apparaissent sans recharger). Si la connexion live est coupée, les listes se
  rattrapent d'elles-mêmes en une à deux minutes.
- Dans la **visite guidée**, le texte de chaque étape s'affiche **progressivement**, à la
  manière d'un dialogue de jeu, dans une bulle encadrée. Un **clic sur la bulle** — ou une
  première pression sur `Entrée` / `→` — affiche tout le texte immédiatement ; la pression
  suivante passe à l'étape suivante. Les boutons « Suivant », « Précédent » et « Passer »,
  ainsi que la touche `Échap`, restent utilisables à tout moment sans attendre la fin du
  texte. Pour les personnes ayant activé la **réduction des animations** dans leur système,
  le texte s'affiche d'emblée en entier.
- Ces bulles peuvent porter le **nom d'un narrateur** (par défaut « OLU »), affiché au-dessus du
  texte. Un réglage d'administration permet de changer ce nom, de le retirer, ou d'**éteindre
  complètement le narrateur** sans intervention technique. Ce même réglage gère les
  **portraits du personnage par expression** (import/choix d'une image par expression, voir
  [visite-et-mascottes.md](visite-et-mascottes.md)) ; tant qu'aucun n'est fourni, l'application
  se rabat sur une silhouette dessinée — il n'y a jamais d'emplacement vide.

### L'administration

Réservée aux professeurs/administrateurs : gestion des **utilisateurs et des rôles**
(création et import d'élèves, permissions configurables), des **groupes** (classes,
équipes, clubs — avec sous-groupes, responsables et périmètre), des **réglages**
(activation/désactivation de modules : forum, tutoriels, observations, visite,
stats…), d'une **médiathèque** d'images réutilisables, et d'un **journal d'audit** des
actions sensibles.

## Comment l'écran s'organise

- **L'élève** navigue par une barre d'onglets en bas d'écran. Sur téléphone, les
  raccourcis principaux (Carte, Tâches, Biodiversité, Visite — ou Quiz si la Visite
  est désactivée) restent visibles ; le bouton **Plus** ouvre le reste des onglets
  (Glossaire, Réseau, Tuto, Carnet, Forum, À propos…). Sur grand écran, toute la
  barre reste déployée. L'application fonctionne très bien sur téléphone et peut
  s'installer comme une appli.
- **Le professeur** navigue par une barre en haut, organisée en **trois pôles** qui
  déploient chacun leur rangée d'onglets :
  - **Contenus** — Carte & Zones, Biodiversité, Quiz, Glossaire, Réseau trophique,
    Tuto, Visite, Packs mascotte, Médiathèque ;
  - **Suivi** — Tâches, Stats, Carnet, Forum, Audit (le nombre de tâches « à valider »
    s'affiche en pastille sur le pôle et sur l'onglet) ;
  - **Administration** — Profils & utilisateurs, Paramètres, À propos.

  Dans **Paramètres**, la console est découpée en sous-onglets : Accueil & modules,
  Pédagogie, Cartographie (cartes, zones & repères, catégories, parcours), Plan Lyautey,
  Identité visuelle, Visite, Intégrations (Moodle), Aide & découverte, Usage &
  exploitation. Un professeur avec seulement la gestion des zones y voit la
  Cartographie ; un délégué « visites guidées » n'y voit que l'aide dédiée.

  Cliquer un pôle ouvre son premier onglet ; les onglets et les pôles portent des
  icônes uniformes (fini les emojis d'interface, réservés désormais au contenu :
  zones, plantes, repères…). Sur petit écran, les onglets du pôle s'ouvrent dans
  un menu bas (feuille) pour laisser de la place à la carte.

- **Le visiteur** voit une version réduite : Visite, Biodiversité et Quiz en
  raccourcis, le reste via **Plus**.

> ℹ️ **Navigation** — Les onglets sont stables : Tâches et Tuto sont toujours séparés.
> Deux variations légitimes subsistent : sur grand écran, une vue « Cartes & tâches »
> (pôle Contenus) affiche la carte et les tâches côte à côte ; et un onglet disparaît
> si son module est désactivé dans les réglages. Sur téléphone, l'élève passe par
> **Plus** pour les onglets secondaires ; le professeur ouvre les onglets d'un pôle
> dans un menu bas.
>
> Les demandes de confirmation et de saisie (« Supprimer… ? », titre d'un élément…)
> s'affichent désormais dans des fenêtres au thème de l'application, non bloquantes —
> plus de boîtes grises du navigateur ; les messages d'erreur passent par des
> notifications furtives en bas d'écran.
>
> Les grands écrans d'administration (Paramètres, fiche plante détaillée) se replient
> en **sections dépliables** : chacun retrouve l'écran tel qu'il l'a laissé (l'état
> ouvert/fermé est mémorisé sur l'appareil), et une recherche active déplie
> automatiquement les sections contenant des résultats.

### Les champs et les onglets se ressemblent partout

Jusqu'ici, la même liste déroulante pouvait prendre **six apparences différentes** selon
l'écran, et certains champs de l'administration — réglages de validation des lectures,
rattachement des questions, catalogue de QCM, glossaire, réseau trophique, studio
mascotte — sortaient carrément avec le menu déroulant **du système d'exploitation**. Le
même écran ne se présentait donc pas pareil sur un iPhone, sur une tablette Android et
sur un ordinateur de la salle informatique.

Désormais :

- **Une seule apparence de champ** — bordure vert menthe, coins arrondis, fond crème,
  anneau vert au moment de la saisie. Les listes déroulantes portent toutes le même
  **chevron dessiné par l'application** : le champ fermé est identique sur tous les
  appareils. Le menu qui s'ouvre au clic, lui, reste celui du système — c'est voulu, il
  est plus simple à manipuler au doigt et mieux servi par les lecteurs d'écran.
- **Tous les champs font au moins 44 pixels de haut**, la taille d'une cible tactile
  confortable. Les champs laissés au rendu du système tombaient à une vingtaine de pixels.
- **Une seule barre de sous-onglets.** La barre du haut reste celle de la navigation
  principale ; à l'intérieur d'un écran, les sous-sections (Paramètres, Profils &
  utilisateurs, Audit, studio mascotte, rattachement des questions, connexion /
  inscription) emploient toutes la même barre, un cran plus fine. On voit ainsi d'un coup
  d'œil ce qui est un onglet principal et ce qui est une sous-section.
- **Les messages d'erreur des formulaires sont en rouge** — notamment celui de
  l'enregistrement automatique de la fiche espèce et de l'éditeur de tutoriel, qui
  s'affichait dans la même encre que le reste du texte et passait inaperçu.
- **Les libellés de champ ne sont plus en CAPITALES.** Ils s'écrivent en minuscules, en
  demi-gras : c'est plus facile à lire, en particulier pour un élève dyslexique. Les textes
  eux-mêmes n'ont pas changé.
- **Les encadrés blancs existent.** Plusieurs écrans — catalogue de QCM, réseau trophique,
  rattachement des questions, réglages de validation des lectures, stats, carnet — croyaient
  poser un encadré et affichaient en réalité un bloc transparent. Ils ont maintenant tous la
  même carte : fond blanc, coins arrondis, ombre légère.
- **Les tableaux se ressemblent.** Celui des stats et la fiche d'un pack de mascotte
  s'affichaient sans marges ni traits de séparation, au rendu brut du navigateur. Tous les
  tableaux partagent désormais la même présentation, et un tableau trop large défile sur
  lui-même au lieu d'élargir la page — utile sur téléphone.
- **Les quatre applications partagent la même base.** ForetMap, Gnomes & Licornes, le Plan
  Lyautey et le plan des personnels emploient les mêmes règles de champs et d'encadrés,
  chacune avec ses couleurs (forêt, médiévale, marine). Un écran nouveau part donc de la
  bonne apparence au lieu d'être à réhabiller après coup.
- **Tous les encadrés se ressemblent**, y compris les plus anciens : la fiche « À propos »,
  les tuiles de statistiques, le panneau de notifications et celui du forum. Chacun garde ce
  qui lui est propre — le liseré vert de la fiche, l'ombre plus marquée du panneau qui flotte
  au-dessus de l'écran — mais plus rien ne diffère par accident.
- **Les longs tableaux sont plus faciles à suivre** : une ligne sur deux est légèrement
  teintée, et la ligne survolée ressort. C'était le cas dans Gnomes & Licornes seulement ;
  c'est désormais disponible partout.
- **Une seule couleur par type de message.** Quatre rouges différents servaient à dire
  « erreur » selon l'écran, trois verts à dire « enregistré ». Il n'en reste qu'un de chaque.
  Les pastilles et les aplats colorés gardent leurs teintes vives, qui doivent rester
  franches.

### La pastille d'état en bas d'écran

Une petite **pastille discrète**, fixe en bas d'écran (dans ForetMap comme dans
Gnomes & Licornes), tient l'utilisateur informé en permanence, **sans avoir à
scroller** :

- **« Enregistrement… »** pendant qu'un formulaire à sauvegarde automatique écrit,
  puis **« Enregistré ✓ »** quelques secondes (vert) ; en cas d'échec, le message
  d'erreur reste affiché (rouge) tant que le problème persiste.
- **« Serveur momentanément indisponible — reconnexion en cours… (tentative n/8) »**
  quand le serveur redémarre ou ne répond plus : l'application réessaie toute seule
  pendant environ 25 secondes (de quoi traverser un redémarrage complet), puis affiche
  **« Connexion au serveur rétablie ✓ »**. L'erreur « Service momentanément
  indisponible » ne s'affiche plus que si le serveur reste réellement injoignable
  au-delà de cette fenêtre.

La pastille ne bloque rien (on peut cliquer au travers) et se place juste au-dessus
de l'emplacement des messages éphémères pour ne jamais les masquer.

### Ce qui se passe quand le serveur ne répond plus

Au-delà de la pastille, l'application protège ce qui est déjà affiché :

- **Rien ne disparaît de l'écran.** Si le serveur ne répond pas pendant un
  rafraîchissement automatique, la carte, les zones, les tâches et les plantes gardent
  les données du dernier chargement réussi. Auparavant, une coupure de quelques secondes
  pouvait vider ces listes à l'écran, ce qui se lisait à tort comme une perte de données.
- **Au bout de trois cycles infructueux**, le bandeau **« Serveur indisponible. Nouvel
  essai automatique toutes les 2 minutes »** apparaît, accompagné d'un bouton
  **« Réessayer maintenant »**, et le rafraîchissement s'espace pour laisser le serveur
  se remettre. Dès qu'une réponse arrive, le bandeau disparaît et la cadence normale
  reprend. La notification **« Serveur indisponible — Synchronisation ralentie »** du
  centre de notifications passe alors en **lue** d'elle-même : elle reste consultable
  dans l'historique mais n'est plus mise en avant. Il en va de même pour « Temps réel
  hors ligne » et « Session non vérifiée » quand leur cause disparaît.
- **Une erreur d'accès n'est pas une panne.** Seules les absences de réponse et les
  erreurs internes du serveur comptent pour ces trois cycles. Un refus (droit manquant,
  page introuvable, trop de requêtes) prouve au contraire que le serveur répond : il
  ne déclenche pas le bandeau.
- **Les données affichées peuvent donc dater** de quelques minutes le temps d'un
  incident : c'est volontaire, et le bandeau le signale.
- **Une classe entière ne se bloque plus elle-même.** Quand tout un groupe utilise le site
  depuis le même établissement, les appareils sortent sur Internet avec **une seule adresse
  visible** par le serveur, qui limite le nombre de requêtes par adresse. Les tentatives de
  reconnexion de trente postes suffisaient à atteindre cette limite et à produire un « Trop
  de requêtes » au pire moment. L'application coordonne désormais ces tentatives : le
  premier appareil qui constate l'absence du serveur fait patienter les autres, et la
  première réponse correcte les relance tous.
- **Session expirée** : la connexion temps réel s'arrête proprement au lieu de réessayer
  sans fin. Les données continuent d'arriver par le rafraîchissement périodique, et le
  temps réel revient de lui-même à la reconnexion.

### Quand une nouvelle version est publiée

L'application est mise à jour plusieurs fois par jour. Ce qu'un utilisateur en voit :

- **Un bandeau « Une nouvelle version est disponible »**, avec un bouton **« Recharger »**.
  Rien ne bouge tant qu'on ne clique pas : une saisie en cours (formulaire de plante,
  description de tâche, message du forum) n'est plus interrompue. On recharge quand cela
  arrange.
- **Après le rechargement**, le message « Nouvelle version installée. » confirme le
  passage à la nouvelle version.
- **Auparavant**, la page se rechargeait d'elle-même dès la publication — parfois une
  vingtaine de fois par jour — et le message apparaissait aussi à la toute première visite
  dans un navigateur neuf, alors qu'aucune version n'avait été remplacée. Les deux
  comportements ont disparu.
- **Une seule exception** : si un onglet resté ouvert très longtemps ne parvient plus à
  charger un morceau de l'application (supprimé du serveur par la mise à jour), la page se
  recharge d'elle-même — à ce stade elle ne fonctionnerait plus de toute façon.

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

## Identité visuelle de l'établissement

Depuis le lot 7 du plan de convergence, ForetMap peut porter les **couleurs et le logo** de
l'établissement, comme le font déjà Gnomes & Licornes et le Plan Lyautey. Le réglage tient en
huit couleurs, deux polices et deux images ; sans réglage, l'apparence forêt d'origine est
conservée à l'identique.

Par sécurité, un logo ou un favicon ne peut désigner qu'un fichier **déjà déposé dans
l'application** : une adresse extérieure est refusée, pour qu'un réglage d'apparence ne
serve pas à appeler un site tiers depuis toutes les pages.
