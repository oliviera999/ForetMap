# Comptes, rôles et groupes — ForetMap

> **Public de ce document : professeurs et administrateurs.**
> Il décrit ce que l'application fait aujourd'hui, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md)

## À quoi ça sert

Tout ce qui touche aux personnes : comment on crée un compte et on se connecte, ce que
chaque rôle a le droit de faire, comment les élèves sont organisés en groupes (classes,
équipes, clubs) et comment un professeur gère tout cela.

## Se connecter et s'inscrire

- **Un seul écran de connexion** pour tout le monde : identifiant (e-mail ou pseudo) +
  mot de passe, ou compte Google. Le système reconnaît automatiquement s'il s'agit d'un
  élève, d'un professeur ou d'un administrateur.
- **L'inscription des élèves est autonome** : prénom, nom, mot de passe (pseudo,
  e-mail, description et affiliation optionnels). Un administrateur peut désactiver
  l'inscription libre dans les réglages.
- **Le code de classe** : à l'inscription, l'élève peut saisir le code fourni par son
  professeur. Bon code → son compte rejoint directement le groupe et reçoit le rôle
  d'élève. Code erroné → l'inscription est refusée avec un message clair (aucun compte
  n'est créé, l'élève corrige et réessaie). Sans code → le compte est créé en
  « visiteur ».
- **Le compte en attente** : un visiteur n'est averti par aucun bandeau (celui-ci a été
  retiré à la demande de l'établissement). Il voit simplement une version réduite de
  l'application, centrée sur la Visite et la Biodiversité ; c'est au professeur de le
  rattacher à son groupe (liste « comptes en attente de rattachement ») ou de lui
  fournir un code de classe.
- **Mot de passe oublié** : procédure par e-mail, pour les élèves comme pour les
  professeurs. Un mot de passe changé (par e-mail, par l'utilisateur ou par un
  administrateur) **déconnecte toutes les sessions ouvertes** de ce compte, sur ForetMap
  comme dans Gnomes & Licornes.
- **Trop d'essais** : cinq mots de passe faux sur le même identifiant bloquent ce compte
  30 secondes, puis de plus en plus longtemps (jusqu'à 15 minutes) — sans gêner les autres
  élèves de la classe qui partagent la même connexion.
- **Longueur minimale du mot de passe** : le réglage « Sécurité » fixe le minimum pour
  les **élèves** (4 caractères par défaut — un choix assumé pour des sixièmes qui
  saisissent leur mot de passe en classe). Les comptes **professeur et administrateur**
  ont un minimum propre de **12 caractères**, qui ne descend jamais en dessous quel que
  soit le réglage : ce sont eux qui peuvent voir l'application « comme » n'importe quel
  utilisateur, donc leur mot de passe protège bien plus que leur seul compte. Les mots
  de passe déjà en place continuent de fonctionner : la règle ne s'applique qu'à une
  création de compte ou à un changement de mot de passe.

## Les rôles et les paliers

| Rôle                    | Qui                                             | Ce qu'il peut faire                                                                                   |
| ----------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Visiteur**            | Compte non promu (classe sans tâches, passage…) | Visite et Biodiversité seulement — **pas** de carte de travail ni de tâches                           |
| **n3beur novice** 🪨    | Élève rattaché, 0 tâche validée                 | Carte, tâches, quiz, carnet, forum                                                                    |
| **n3beur avancé** 🌿    | 5 tâches validées                               | Idem — le palier marque la progression                                                                |
| **n3beur chevronné** 🏆 | 10 tâches validées                              | Idem                                                                                                  |
| **Prof de classe**      | Enseignant tuteur d'une ou plusieurs classes    | Gérer les élèves **de ses groupes** (voir ci-dessous) — **pas** la gestion des tâches ni du jardin    |
| **n3boss**              | Animateur / responsable pédagogique forêt       | Gestion pédagogique large (zones, plantes, tâches, visite, élèves, stats…) — **ce n'est pas** l'admin |
| **Administrateur**      | Compte aux pleins pouvoirs établissement        | Tout le n3boss, plus réglages, rôles, secrets, prise de contrôle, audit technique                     |

- La montée de palier est **automatique** (nombre de tâches validées) et saluée par une
  fenêtre de félicitations. Le vocabulaire « n3beur / n3boss » se personnalise dans les
  réglages.
- Les rôles et leurs **permissions sont configurables** : un administrateur peut créer
  des profils sur mesure et ajuster finement qui a le droit de faire quoi (valider des
  tâches, gérer les plantes, lire les statistiques, exporter, modérer le forum…).
- Chaque action d'élève est faite **au nom du compte connecté**, vérifié par le
  serveur : impossible d'agir au nom d'un camarade.
- L'onglet **À propos** propose à tout le monde la documentation publique du projet
  (présentation, journal des versions, guide d'installation). Les **rapports d'audit
  interne** du site, eux, ne s'affichent que pour les comptes ayant le droit de lecture
  des réglages — administrateurs en pratique — et s'ouvrent directement dans la page.
  Ils recensent des faiblesses techniques connues : ce n'est pas une lecture destinée
  aux élèves.

### n3boss n'est pas administrateur

Le **n3boss** est le rôle enseignant « fort » de la forêt (pilotage pédagogique).
L'**administrateur** est au-dessus : réglages d'établissement, création et réglage des
profils de droits, secrets, prise de contrôle temporaire sur un compte. Un n3boss ne
peut pas se promouvoir administrateur, ni créer ou modifier un compte administrateur.

Aujourd'hui, le n3boss par défaut dispose déjà de pouvoirs sensibles qu'il faut avoir
en tête avant de distribuer le rôle : créer des comptes professeurs, supprimer des
comptes élèves, lire le journal d'audit. Ce n'est pas « toute la gestion pédagogique »
au sens anodin du terme.

### Deux métiers d'enseignant : n3boss et prof de classe

L'établissement a besoin de **deux postures distinctes**, pas d'un seul professeur
« tout faire ».

|                         | **n3boss**                                        | **Prof de classe**                                                     |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| Public élève typique    | n3beurs (carte, tâches, progression)              | Élèves restés **visiteurs** (souvent une classe entière, ex. sixièmes) |
| Tâches                  | Crée, affecte, valide                             | **Aucune** charge de tâches : ni création, ni validation               |
| Contenu jardin / visite | Zones, plantes, visite, quiz…                     | **Hors périmètre**                                                     |
| Élèves                  | Vue **globale** de l'établissement (choix assumé) | Uniquement les élèves **de ses groupes**                               |
| Création de comptes     | Oui (matrice actuelle)                            | **Paramétrable** — absente par défaut ; un admin peut l'ouvrir         |

Le profil système **« Prof de classe »** est distinct du n3boss. En pratique :

1. **Association aux groupes** : le compte enseignant est rattaché à une ou plusieurs
   classes / groupes ; il ne voit et n'agit que sur les élèves de ce périmètre.
2. **Élèves en visiteurs** : les membres de ces classes restent (ou sont placés) en
   rôle **visiteur** — ils voient Visite et Biodiversité, **pas** les tâches ni la
   carte de travail. Le rattachement au groupe **ne les promeut pas** automatiquement
   en n3beur (contrairement à une classe n3beur classique) : laisser le rôle par
   défaut du groupe sur « Visiteur » et ne pas cocher « accorde le statut n3beur ».
3. **Gestion des personnes** dans le périmètre : consulter la liste, rattacher /
   détacher, générer le code de classe — **sans** accès à la gestion des tâches, des
   zones, des plantes ni des contenus de visite. Les onglets correspondants sont
   masqués.
4. **Création de comptes paramétrable** : les droits de **créer** et d'**importer**
   des comptes élèves ne font **pas** partie du socle. Un administrateur peut les
   cocher sur ce profil (ou un profil dérivé). Hors vue globale, la création unitaire
   exige de rattacher l'élève à un groupe du périmètre du professeur.
5. **Pas d'escalade** : ce profil ne donne pas les pouvoirs administrateur, ni la
   totalité des pouvoirs n3boss.

### Portée de groupe

L'application limite un enseignant à **ses** groupes (stats, observations, forum,
tâches, gestion des groupes filtrés ; refus hors périmètre), sauf s'il dispose de la
vue globale.

**Règle d'établissement** : le **n3boss** (et l'administrateur) a la vue globale —
tous les élèves. Le **prof de classe** n'a **pas** cette vue : hors de ses groupes,
aucune gestion d'élèves ni de classes.

## Les groupes

Les groupes structurent la vie pédagogique :

- **Types** : classe, équipe, unité, club — avec sous-groupes possibles.
- **Membres et responsables** : le professeur compose les groupes et peut désigner des
  responsables.
- **Rôle par défaut** : un groupe peut conférer automatiquement un rôle à ses membres
  (par exemple « n3beur novice » pour une classe) — c'est ce qui promeut un visiteur en
  élève dès son rattachement. Un bouton « Appliquer à tous les membres » force le
  recalcul.
- **Périmètre** : un groupe peut être limité à certaines cartes et certains projets.
- **Code de classe** : chaque groupe peut générer son code d'inscription dans son
  panneau de réglages — affichable/imprimable pour la classe, **régénérable** (l'ancien
  code devient alors invalide) ou supprimable.
- **Comptes en attente** : la gestion des groupes affiche la liste des visiteurs
  inscrits en autonomie, avec un rattachement en un clic vers le groupe choisi (le rôle
  suit automatiquement).
- **Groupes venus de Moodle** : à la rentrée, l'administrateur peut créer et tenir à jour
  les groupes-classes depuis les cohortes Moodle. Ces groupes se comportent comme les
  autres (rôle par défaut, périmètre, sous-groupes). Moodle est maître des cohortes ; un
  élève ajouté à la main n'est pas retiré automatiquement — la divergence est signalée à
  l'administrateur pour trancher. Une activité du cours peut aussi ouvrir ForetMap déjà
  connecté (voir [La rentrée avec Moodle](rentree-moodle.md)).

## Un seul compte pour ForetMap et Gnomes & Licornes

Depuis septembre 2026, un élève qui joue à Gnomes & Licornes n'a **qu'un seul compte** :
son joueur est rattaché à un compte ForetMap, qui porte le mot de passe, l'adresse e-mail
et l'état du compte.

- Un joueur créé ou importé depuis le jeu reçoit automatiquement un compte ForetMap
  (« compte miroir »), membre du groupe correspondant à sa classe de jeu. Si un élève de
  même e-mail — ou de même pseudo, prénom et nom — existe déjà dans ForetMap, c'est **ce
  compte** qui est rattaché : pas de doublon, l'élève garde son mot de passe.
- Le mot de passe est **le même** dans les deux applications, quel que soit l'endroit où
  on le change. L'élève peut se connecter à ForetMap avec son pseudo de jeu.
- **Désactiver** un élève le coupe aussi du jeu ; le **supprimer** supprime son joueur
  (refusé si une partie en cours le retient). Supprimer le joueur côté jeu ne supprime que
  le compte miroir, jamais un compte élève inscrit dans ForetMap.
- Un élève peut, depuis son profil de jeu, **rattacher** son vrai compte élève à son
  joueur (le compte miroir est alors supprimé) ou le **détacher**.

## La gestion des utilisateurs

- **Créer / importer** : un **n3boss** (selon ses droits) peut créer des comptes un par
  un ou importer une liste (rentrée). Le fichier d'import (CSV ou tableur) permet de
  choisir **chaque profil** : visiteur, n3beur novice / avancé / chevronné, prof de
  classe, n3boss, administrateur. Une colonne **Groupes** permet de rattacher chaque
  personne à **une ou plusieurs** classes (noms ou identifiants séparés par `|` ou
  `;`) ; un chemin du type « classe > sous-groupe » crée le sous-groupe sous son
  parent. Si un groupe nommé dans le fichier **n'existe pas encore**, il est **créé
  automatiquement** (et le professeur qui importe en devient responsable s'il n'a
  pas la vue globale). Si la **même personne** apparaît sur plusieurs lignes, elles
  sont **fusionnées** : les groupes s'ajoutent, et pour le reste (pseudo, e-mail…)
  c'est la **dernière ligne** qui compte — un message d'information le signale dans
  le rapport. Le modèle téléchargeable contient **une ligne d'exemple par
  profil**, avec des cas multi-groupes. Les adresses e-mail du fichier **ne sont
  pas** limitées aux domaines autorisés pour Google ou Moodle.
- **Importer des groupes** : un panneau dédié (même onglet Profils) permet
  d'importer une liste de groupes et sous-groupes via un fichier modèle (type
  classe / équipe / unité / club, parent optionnel, option « accorde le statut
  n3beur »). Les groupes déjà présents (même nom ou même identifiant) sont
  **mis à jour** avec les infos du fichier ; une ligne répétée dans le fichier est
  fusionnée (dernière ligne pour le reste, message d'info). Les nouveaux sont
  créés. Pour un **prof de classe**, la
  création / l'import de comptes ne sont disponibles **que si** un administrateur
  a ouvert ces droits sur son profil. Seul un administrateur peut importer un
  compte administrateur ; seuls n3boss et administrateur peuvent importer un
  compte enseignant.
- **Supprimer** : la suppression d'un élève retire aussi ses affectations et son
  historique de tâches, et recalcule les statuts des tâches concernées. C'est un
  pouvoir sensible ; il ne fait pas partie du socle minimal du prof de classe.
- **Prendre la main** : un administrateur peut temporairement se connecter « en tant
  que » un utilisateur pour l'aider — l'action est tracée dans le journal d'audit.
- **Compte supprimé** : si un compte est supprimé pendant qu'il est connecté,
  l'application le déconnecte proprement avec un message.

## Fiabilité des droits (n3boss et profils)

- Une permission **retirée** d'un profil système par un administrateur **reste
  retirée** après redémarrage ou déploiement (le profil n'est plus « remis d'usine »
  tant qu'il a déjà été configuré).
- Quand les droits d'un professeur changent, l'**interface déjà ouverte** se met à
  jour (jeton rafraîchi et permissions relues) sans exiger une déconnexion manuelle.
- L'accès à l'interface professeur ne suffit **pas** à vider la médiathèque ni à
  verrouiller le forum : ces actions exigent des droits dédiés (`media.manage`,
  modération forum), avec périmètre de groupe quand il s'applique.
- Les **suppressions** de zones, plantes, tutoriels, groupes, repères et contenus de
  visite sont **journalisées** dans l'onglet Audit.
- Un profil chargé de gérer les rôles **ne peut pas** s'attribuer des pouvoirs qu'il
  ne détient pas, ni modifier le profil administrateur s'il n'est pas lui-même
  administrateur.

## ⚠️ Points d'attention

> ⚠️ **Point d'attention** — Le rattachement par code de classe suppose que le
> professeur ait généré le code **avant** la campagne d'inscription. Sans code
> distribué, les élèves atterrissent tous dans la liste d'attente — ce qui fonctionne,
> mais fait perdre le bénéfice de l'autonomie.

> ⚠️ **Point d'attention** — Un groupe « neutre » (sans rôle par défaut ni statut
> n3beur) ne promeut pas ses membres : un visiteur rattaché à un tel groupe reste
> visiteur. Vérifier le réglage « accorde le statut n3beur » du groupe si un élève
> rattaché ne voit toujours pas la carte. Pour une **classe de visiteurs** gérée par
> un prof de classe, ce comportement « rester visiteur » est **voulu** — ne pas
> activer par erreur la promotion n3beur sur ce groupe.

## Pour aller plus loin

[Présentation générale](presentation.md) · [La rentrée avec Moodle](rentree-moodle.md) ·
[Tâches, tutoriels et validation](taches-tutoriels-et-validation.md) ·
[Stats, forum et suivi](stats-forum-et-suivi.md) · [Sommaire](../README.md)
