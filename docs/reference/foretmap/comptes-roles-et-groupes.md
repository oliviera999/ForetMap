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
  professeurs.
- **Longueur minimale du mot de passe** : le réglage « Sécurité » fixe le minimum pour
  les **élèves** (4 caractères par défaut — un choix assumé pour des sixièmes qui
  saisissent leur mot de passe en classe). Les comptes **professeur et administrateur**
  ont un minimum propre de **12 caractères**, qui ne descend jamais en dessous quel que
  soit le réglage : ce sont eux qui peuvent voir l'application « comme » n'importe quel
  utilisateur, donc leur mot de passe protège bien plus que leur seul compte. Les mots
  de passe déjà en place continuent de fonctionner : la règle ne s'applique qu'à une
  création de compte ou à un changement de mot de passe.

## Les rôles et les paliers

| Rôle                    | Qui                                     | Ce qu'il peut faire                                             |
| ----------------------- | --------------------------------------- | --------------------------------------------------------------- |
| **Visiteur**            | Compte non rattaché, curieux de passage | Visite et Biodiversité seulement                                |
| **n3beur novice** 🪨    | Élève rattaché, 0 tâche validée         | Carte, tâches, quiz, carnet, forum                              |
| **n3beur avancé** 🌿    | 5 tâches validées                       | Idem — le palier marque la progression                          |
| **n3beur chevronné** 🏆 | 10 tâches validées                      | Idem                                                            |
| **n3boss**              | Professeur                              | Toute la gestion pédagogique                                    |
| **Administrateur**      | Professeur aux pleins pouvoirs          | Gestion + réglages + rôles + audit + aperçu des vues élève/prof |

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

## La gestion des utilisateurs

- **Créer / importer** : le professeur peut créer des comptes un par un ou importer une
  liste (rentrée de classe).
- **Supprimer** : la suppression d'un élève retire aussi ses affectations et son
  historique de tâches, et recalcule les statuts des tâches concernées.
- **Prendre la main** : un administrateur peut temporairement se connecter « en tant
  que » un utilisateur pour l'aider — l'action est tracée dans le journal d'audit.
- **Compte supprimé** : si un compte est supprimé pendant qu'il est connecté,
  l'application le déconnecte proprement avec un message.

## ⚠️ Points d'attention

> ⚠️ **Point d'attention** — Le rattachement par code de classe suppose que le
> professeur ait généré le code **avant** la campagne d'inscription. Sans code
> distribué, les élèves atterrissent tous dans la liste d'attente — ce qui fonctionne,
> mais fait perdre le bénéfice de l'autonomie.

> ⚠️ **Point d'attention** — Un groupe « neutre » (sans rôle par défaut ni statut
> n3beur) ne promeut pas ses membres : un visiteur rattaché à un tel groupe reste
> visiteur. Vérifier le réglage « accorde le statut n3beur » du groupe si un élève
> rattaché ne voit toujours pas la carte.

## Pour aller plus loin

[Présentation générale](presentation.md) · [Tâches, tutoriels et validation](taches-tutoriels-et-validation.md) · [Stats, forum et suivi](stats-forum-et-suivi.md) · [Sommaire](../README.md)
