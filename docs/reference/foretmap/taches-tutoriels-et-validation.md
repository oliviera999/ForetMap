# ForetMap — Tâches, tutoriels et validation

> **Public de ce document : professeurs et administrateurs.**
> Il décrit ce que l'application fait aujourd'hui, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md) · Vue d'ensemble : [presentation.md](presentation.md)

## À quoi ça sert

Les tâches sont le **moteur pédagogique** de ForetMap : elles transforment l'entretien de
la forêt comestible en activités que les élèves choisissent, réalisent et documentent, et
que les professeurs valident. Chaque validation fait progresser l'élève vers le palier
suivant (novice 🪨 → avancé 🌿 → chevronné 🏆). Les **tutoriels** complètent le dispositif :
des fiches pratiques (arrosage, compostage, taille…) reliées aux tâches et aux lieux du
jardin, que l'élève lit avant d'agir.

## Qui l'utilise

- **L'élève** consulte les tâches, se positionne dessus, les réalise, les marque faites
  avec un commentaire et une photo, lit les tutoriels — et, à partir du palier « avancé »,
  propose ses propres idées de tâches.
- **Le professeur** crée les projets et les tâches, affecte des groupes, importe en masse,
  programme les récurrences, valide (ou remet au travail) et rédige les tutoriels.
- **Le visiteur** n'a pas accès aux tâches (ni pour s'inscrire, ni pour proposer).

## Les projets de tâches

Un **projet** regroupe des tâches d'une même carte sous un intitulé commun (« Semis de
printemps », « Chantier compost »…). Il porte un titre, une description, sa carte, et
peut être relié à des zones, des repères et des tutoriels. Le professeur peut réordonner
les tâches à l'intérieur du projet, le dupliquer (les copies repartent « disponibles »)
et le mettre **en attente** (les inscriptions des élèves sont alors fermées sur toutes
ses tâches).

Le statut « **terminé** » d'un projet est **automatique** : dès que toutes ses tâches sont
faites ou validées, le projet passe terminé — et il redevient actif si une nouvelle tâche
s'y ajoute. La **validation** d'un projet, elle, est une décision manuelle du professeur.

## La fiche d'une tâche

Chaque tâche décrit précisément le travail attendu :

| Élément              | Détail                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Titre et description | Le titre est obligatoire ; la description accepte la mise en forme.                                                              |
| Image                | Une photo de couverture illustrative (facultative).                                                                              |
| Lieux                | Une ou **plusieurs** zones et repères de la même carte — la tâche apparaît sur ces lieux.                                        |
| Niveau de danger     | Sans danger · Danger potentiel · Dangereux · Très dangereux.                                                                     |
| Niveau de difficulté | Facile · Moyen · Compliqué · Super compliqué.                                                                                    |
| Degré d'importance   | Pas important · Peu important · Modéré · Important · Urgent ! (l'importance sert au tri de la liste).                            |
| Élèves requis        | Le nombre de places : quand elles sont prises, plus personne ne peut s'inscrire.                                                 |
| Mode de validation   | **Individuel** (un élève termine la tâche pour tous) ou **collectif** (chaque inscrit doit marquer sa part faite).               |
| Dates                | Une **date de départ** (avant elle, impossible de s'inscrire) et une **date limite** (affichée en « Dans N jours / En retard »). |
| Référents            | Des professeurs (ou élèves expérimentés) « à qui s'adresser » ; recommandés si la tâche est difficile ou dangereuse.             |
| Tutoriels liés       | Les fiches pratiques à lire avant de commencer.                                                                                  |
| Espèces liées        | Les êtres vivants du catalogue concernés par la tâche.                                                                           |
| Récurrence           | Aucune (tâche unique), hebdomadaire, toutes les 2 semaines, ou mensuelle.                                                        |

Si une tâche compliquée ou dangereuse n'a pas de référent, un avertissement invite
l'élève à demander l'accord de l'équipe pédagogique avant de commencer.

## Le cycle de vie d'une tâche

Une tâche passe par des états visibles de tous : **Disponible** → **En cours** →
**Terminée** → **Validée** (plus deux états particuliers : **Proposée** et **En attente**).

### Du point de vue de l'élève

1. **Se positionner** : sur une tâche disponible, l'élève clique « ✋ Je m'en occupe ».
   La tâche passe « En cours ». L'inscription est refusée si la tâche est validée, en
   attente, complète, si son projet est en attente/terminé/validé, si la date de départ
   n'est pas atteinte — ou si l'élève a atteint son **plafond de tâches actives**
   (réglable par profil ; un message clair lui demande de se retirer d'une tâche ou
   d'attendre une validation).
2. **Se retirer** : « ↩️ Me retirer » reste possible tant que la tâche n'est ni terminée
   ni validée — donc même une fois le travail commencé.
3. **Marquer faite** : « ✅ Marquer terminée », avec un **commentaire et/ou une photo**
   en guise de preuve (les deux sont facultatifs, mais recommandés). En mode collectif,
   chaque inscrit marque **sa** part ; la tâche n'est « Terminée » que quand tout le
   monde a fini.
4. **Attendre la validation** : la tâche apparaît chez le professeur dans « En attente
   de validation ».

### Du point de vue du professeur

- **Valider** : la validation est définitive et déclenche la progression des élèves
  inscrits. Détail à connaître : une tâche validée est **détachée de ses zones et
  repères** (elle n'encombre plus la carte) ; pour les tâches récurrentes, les lieux
  sont mémorisés afin que la prochaine occurrence les retrouve.
- **Remettre au travail** : il n'y a pas de bouton « refuser » — le professeur repasse
  simplement la tâche « À faire » ou « En cours ». Les comptes rendus (commentaires,
  photos) restent consultables dans le journal de la tâche.
- **Mettre en attente** : une tâche « En attente » gèle les inscriptions sans la supprimer.

### La progression des paliers

Chaque validation compte pour **tous les élèves inscrits** sur la tâche. Les seuils par
défaut : **5** tâches validées pour devenir « n3beur avancé » 🌿, **10** pour « n3beur
chevronné » 🏆 — seuils, noms et emojis **modifiables** dans les profils. La promotion
est **automatique** et célébrée par une fenêtre « Bravo ! Nouveau palier » qui rappelle à
l'élève ce que son nouveau profil lui permet. La progression automatique peut être
désactivée globalement dans les réglages des profils.

## Les propositions de tâches par les élèves

À partir du palier **avancé**, un élève peut proposer une idée de tâche : titre,
description, lieux, dates, niveaux, places, image. Sa proposition apparaît avec le statut
« **Proposée** » et porte son nom.

- Tant qu'elle est « Proposée », **l'élève peut la modifier** (« ✏️ Modifier ma
  proposition ») — sauf les champs réservés au professeur (statut, projet, tutoriels,
  référents, récurrence, mode de validation).
- **Le professeur l'examine** : pour l'accepter, il la passe « Disponible » (en la
  complétant au besoin : projet, tutoriels, référents, récurrence) — elle devient alors
  une tâche ordinaire. Pour la refuser, il la supprime.

## Les outils collectifs du professeur

- **Affecter un groupe** : « 👥 Affecter groupe » inscrit d'un coup les élèves d'un
  groupe, dans la limite des places restantes de la tâche. Une **affectation rapide**
  par cases à cocher et une **attribution dès la création** existent aussi (celle-ci
  relève automatiquement le nombre de places si la sélection dépasse).
- **Importer en masse** : un fichier tableur (modèle téléchargeable) crée projets et
  tâches en série — avec prévisualisation et rapport d'erreurs avant l'écriture réelle,
  et sans jamais créer de doublon (les lignes déjà connues sont ignorées).
- **Tâches récurrentes** : une tâche marquée hebdomadaire / toutes les 2 semaines /
  mensuelle **renaît automatiquement** une fois validée et son échéance passée :
  l'application vérifie **chaque jour** et recrée une copie « Disponible » avec la
  nouvelle échéance, les mêmes lieux, tutoriels, référents et réglages. Cette
  automatisation peut être suspendue globalement dans les réglages.

## Les tutoriels

Les tutoriels sont des **fiches pratiques** rédigées par les professeurs : un titre, un
résumé, une image de couverture, et un contenu libre (page rédigée dans l'application,
document existant ou lien externe). Les mots du glossaire y sont automatiquement
transformés en liens vers leur définition, et chaque fiche peut être téléchargée (page
ou PDF).

- Un tutoriel se **relie** aux tâches et aux zones/repères concernés : l'élève le trouve
  directement depuis la tâche ou le lieu.
- **Accusé de lecture** : l'élève confirme « j'ai lu et compris » ; l'application retient
  ses lectures. En option, un **verrou pédagogique** peut exiger la réussite de questions
  de quiz avant de pouvoir confirmer la lecture (désactivé par défaut).
- Le professeur crée, modifie, réordonne et retire les fiches (un retrait les masque sans
  rien détruire). Le module Tutoriels entier peut être désactivé dans les réglages —
  l'onglet disparaît alors.

## ⚠️ Points d'attention sur l'existant

État des lieux honnête, relevé en examinant le fonctionnement actuel :

> ⚠️ **Point d'attention** — Le **novice ne peut pas proposer** de tâche : la
> proposition s'ouvre au palier « avancé » (5 tâches validées). C'est un choix de
> configuration des profils, modifiable, mais il surprend si on annonce aux élèves
> « vous pouvez proposer vos idées » dès la rentrée.

> ⚠️ **Point d'attention** — Il n'existe **pas de refus formel** : remettre une tâche
> « À faire » après un travail jugé insuffisant ne prévient pas l'élève et ne laisse
> aucune trace explicative. Un mot oral (ou un commentaire contextuel) reste nécessaire.

> ⚠️ **Point d'attention** — L'élève peut **modifier** sa proposition mais pas la
> **supprimer** : seule l'équipe pédagogique peut retirer une proposition abandonnée.

> ⚠️ **Point d'attention** — Le **retrait reste possible en cours de travail** : un
> élève peut quitter une tâche « En cours » tant qu'elle n'est pas terminée, ce qui peut
> laisser un chantier orphelin sans notification.

> ⚠️ **Point d'attention** — Le nombre d'élèves requis n'a pas la même limite partout :
> le formulaire propose jusqu'à 10, l'import accepte jusqu'à 50, et une modification
> directe n'a pas de plafond. Sans gravité au quotidien, mais incohérent.

> ⚠️ **Point d'attention** — Pour les tutoriels, le professeur voit **combien** de
> fiches chaque élève a lues (statistiques), mais pas **lesquelles** : pas de liste
> nominative « qui a lu tel tutoriel ».

> ⚠️ **Point d'attention** — La progression des paliers reconnaît aussi les élèves par
> **prénom + nom** (héritage des anciennes inscriptions sans compte) : deux homonymes
> parfaits pourraient voir leurs validations confondues.

## Pour aller plus loin

- Vue d'ensemble de l'application : [presentation.md](presentation.md)
- Comptes, rôles et paliers en détail : [comptes-roles-et-groupes.md](comptes-roles-et-groupes.md)
- La carte, les zones et les repères où vivent les tâches : _carte-et-zones.md_ (à rédiger)
- Les statistiques et le suivi de la progression : _stats-forum-et-suivi.md_ (à rédiger)
