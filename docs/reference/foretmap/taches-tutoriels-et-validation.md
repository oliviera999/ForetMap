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

| Élément              | Détail                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Titre et description | Le titre est obligatoire ; la description accepte la mise en forme.                                                                                                      |
| Image                | Une photo de couverture illustrative (facultative).                                                                                                                      |
| Lieux                | Une ou **plusieurs** zones et repères de la même carte — la tâche apparaît sur ces lieux.                                                                                |
| Niveau de danger     | Sans danger · Danger potentiel · Dangereux · Très dangereux.                                                                                                             |
| Niveau de difficulté | Facile · Moyen · Compliqué · Super compliqué.                                                                                                                            |
| Degré d'importance   | Pas important · Peu important · Modéré · Important · Urgent ! (l'importance sert au tri de la liste ; « Urgent ! » ouvre en plus l'encart du même nom, voir ci-dessous). |
| Élèves requis        | Le nombre de places : quand elles sont prises, plus personne ne peut s'inscrire.                                                                                         |
| Mode de validation   | **Individuel** (un élève termine la tâche pour tous) ou **collectif** (chaque inscrit doit marquer sa part faite).                                                       |
| Dates                | Une **date de départ** (avant elle, impossible de s'inscrire) et une **date limite** (affichée en « Dans N jours / En retard »).                                         |
| Référents            | Des professeurs (ou élèves expérimentés) « à qui s'adresser » ; recommandés si la tâche est difficile ou dangereuse.                                                     |
| Tutoriels liés       | Les fiches pratiques à lire avant de commencer.                                                                                                                          |
| Espèces liées        | Les êtres vivants du catalogue concernés par la tâche.                                                                                                                   |
| Récurrence           | Aucune (tâche unique), hebdomadaire, toutes les 2 semaines, ou mensuelle.                                                                                                |

Si une tâche compliquée ou dangereuse n'a pas de référent, un avertissement invite
l'élève à demander l'accord de l'équipe pédagogique avant de commencer.

## L'encart « 🚨 Urgent ! »

Les tâches marquées **« Urgent ! »** sont regroupées en haut de l'écran Tâches, dans un
encart à elles — elles n'apparaissent donc pas dans la section de leur statut tant qu'elles
y figurent. **Une tâche urgente quitte cet encart dès qu'elle est validée** (directement, ou
parce que son projet a été validé) : elle rejoint alors « ✅ Validées » côté professeur,
« ✅ Récemment validées » côté élève. Une tâche « Terminée » (en attente de validation) ou
« Proposée » reste, elle, dans l'encart : quelque chose est encore attendu de l'équipe
pédagogique.

## Retrouver une tâche : recherche, filtres et affichage

L'écran Tâches propose une **barre de recherche**, un **bouton « ⚙️ Filtres »** et un
**choix d'affichage** (tuiles 🧩, liste 📄, condensé 📋). Ces trois éléments tiennent sur
une seule ligne : les tâches restent visibles dès l'ouverture de l'écran, sans avoir à
faire défiler la page.

- **Les filtres** (carte, lieu, projet, groupe pour le professeur, catégorie « Urgent ! »,
  statut) s'ouvrent d'un appui sur « ⚙️ Filtres ». Sur ordinateur ils se déplient sous la
  barre ; sur téléphone et tablette ils s'affichent dans un panneau qui se referme sur
  « Voir les N tâches ». Aucun filtre n'a disparu : ils sont simplement rangés.
- **Le nombre de filtres posés** s'affiche sur le bouton, et chaque filtre actif apparaît
  en **étiquette** sous la barre (« Lieu : 🐝 Ruche », « Statut : Terminée »…). Un appui
  sur l'étiquette retire ce filtre ; « Tout effacer » les retire tous. C'est le garde-fou
  contre la liste qui semble vide alors qu'un filtre oublié la restreint.
- **L'affichage** est mémorisé d'une visite à l'autre. À la toute première visite, les
  écrans étroits (téléphone) démarrent en **condensé** — une ligne par tâche — pour en
  montrer davantage d'un coup ; les grands écrans démarrent en **tuiles**. Chacun peut en
  changer à tout moment.
- Sur ordinateur, le panneau de filtres reste **déplié par défaut** ; s'il est replié, ce
  choix est retenu.

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
  inscrits. Une inscription élève qui arrive **en même temps** qu'une validation ne
  peut plus « défaire » cette validation : l'inscription est refusée et le statut
  validé est conservé. Détail à connaître : une tâche validée est **détachée de ses zones et
  repères** (elle n'encombre plus la carte) ; pour les tâches récurrentes, les lieux
  sont mémorisés afin que la prochaine occurrence les retrouve.
- **Remettre au travail** : il n'y a pas de bouton « refuser » — le professeur repasse
  simplement la tâche « À faire » ou « En cours ». Les comptes rendus (commentaires,
  photos) restent consultables dans le journal de la tâche.
- **Mettre en attente** : une tâche « En attente » gèle les inscriptions sans la supprimer.
- **Archiver** : le bouton 📦 range une tâche « de côté ». Elle disparaît des listes
  actives (côté élève comme professeur) sans être supprimée : son statut, ses comptes
  rendus et ses liaisons sont conservés, et une tâche archivée ne compte plus dans
  l'avancement automatique de son projet. C'est le geste à privilégier plutôt que la
  suppression 🗑️ pour un travail terminé qu'on veut garder en mémoire sans encombrer
  l'écran. On retrouve les archives via le filtre de statut « 📦 Archivés » (réservé aux
  professeurs) — la liste se charge alors à la demande — d'où l'on peut **désarchiver** (♻️) pour les remettre en circulation.
  Tant qu'elle est archivée, la tâche est **hors jeu** : ni inscription, ni marquage
  « terminée » ne sont acceptés, même depuis un écran resté ouvert avant l'archivage.

## Les éléments validés sont masqués par défaut

Une tâche **validée** et un **projet validé** n'attendent plus rien de personne. Ils ne
sont donc **plus affichés** dans l'écran Tâches à l'ouverture — ni la section « Validées »
(professeur) / « Récemment validées » (élève), ni le bloc « Projets validés ». Les tâches
rattachées à un projet validé disparaissent avec lui.

Rien n'est archivé ni supprimé pour autant : c'est un simple masquage d'affichage, sur le
même principe que les archives. Une ligne discrète en bas de la liste annonce ce qui est
masqué (« 2 tâches validées masquées et 1 projet validé masqué ») avec un bouton
**« Afficher les validés »** ; le filtre de statut « Validée » ou « Projet validé » produit
le même effet. Les compteurs de résultats et l'état vide tiennent compte de ce masquage.

Le filtre « 📦 Archivés » (professeur) continue, lui, d'afficher tout son contenu : les
éléments qui s'y trouvent sont validés pour la plupart, c'est bien leur raison d'être.

## Archiver un projet

Comme les tâches, un **projet** peut être **archivé** (📦) : il quitte la liste des projets
actifs et, par défaut, ses tâches sont archivées **avec lui**. Le **désarchivage** (♻️)
restaure le projet et **seulement** les tâches qui avaient été archivées par ce même geste
(une tâche archivée à la main auparavant reste archivée). Les projets archivés se
consultent, eux aussi, via le filtre « 📦 Archivés ». Rien n'est perdu : l'archivage est
toujours réversible, à la différence de la suppression.

## Archivage automatique

Pour éviter que les listes ne s'encombrent avec le temps, les éléments **terminés** sont
**archivés automatiquement** au bout d'un certain délai : les **tâches validées** et les
**projets validés** dont la validation remonte à plus de **4 mois** (par défaut) sont rangés
dans les archives lors du passage quotidien. Seuls les éléments **validés** sont concernés —
une tâche à faire, en cours ou en attente n'est **jamais** archivée automatiquement, même
ancienne. Comme tout archivage, c'est réversible (désarchivage manuel).

L'archivage automatique d'un **projet** n'entraîne **pas** ses tâches (contrairement à
l'archivage manuel) : chacune suit son propre critère. Les tâches encore actives d'un projet
ainsi rangé ne disparaissent pas pour autant — elles réapparaissent simplement dans la
section de leur statut, hors bloc projet.

Deux réglages (côté administration, portée professeur) pilotent ce comportement :

- **activation** de l'archivage automatique (activé par défaut) ;
- **délai** avant archivage, en jours (**120** par défaut, soit environ 4 mois ; bornes 7 à 3650).

Au moment de la mise en place, les éléments déjà validés ne sont pas archivés d'un coup : le
délai repart de cette date, pour éviter un archivage massif rétroactif.

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
- **Marquer la part d'un élève** (mode collectif) : en cliquant sur le nom d'un inscrit,
  le professeur marque sa part terminée à sa place. Ce raccourci n'est proposé que pour
  les inscriptions **rattachées à un compte élève** ; une inscription ancienne, saisie
  avant la généralisation des comptes et donc sans compte associé, affiche seulement le
  nom (il faut d'abord rattacher l'élève).
- **Importer en masse** : un fichier tableur (modèle téléchargeable) crée projets et
  tâches en série — avec prévisualisation et rapport d'erreurs avant l'écriture réelle,
  et sans jamais créer de doublon (les lignes déjà connues sont ignorées).
- **Tâches récurrentes** : une tâche marquée hebdomadaire / toutes les 2 semaines /
  mensuelle **renaît automatiquement** une fois validée et son échéance passée :
  l'application vérifie **chaque jour** et recrée une copie « Disponible » avec la
  nouvelle échéance, les mêmes lieux, tutoriels, référents et réglages. Cette
  automatisation peut être suspendue globalement dans les réglages.

### Et pendant les vacances ?

ForetMap **ne connaît aucun calendrier scolaire** : il n'existe ni période de vacances, ni
jours fériés, ni week-ends dans l'application. Aucune date n'est décalée automatiquement,
et le passage quotidien a lieu **tous les jours de l'année** — une échéance qui tombe
pendant les congés reste telle quelle et la tâche apparaît « en retard » à la rentrée.

La seule commande prévue pour les vacances est un **interrupteur manuel** dans les
réglages : _« Duplication automatique des tâches récurrentes »_. Coupé, il suspend la
création de nouvelles occurrences aussi longtemps qu'on le laisse coupé, sans toucher à la
récurrence des tâches elles-mêmes ; il faut donc penser à le **rallumer** à la rentrée. Les
occurrences non créées pendant la coupure peuvent être rattrapées ensuite par un
administrateur (commande de rattrapage côté serveur).

L'**archivage automatique** des éléments validés, lui, n'est pas concerné : il a ses
propres réglages et son délai se compte en mois.

À noter enfin : le jour de bascule des tâches récurrentes est calculé sur le fuseau
**Europe/Paris** par défaut (réglable côté serveur), et non sur le fuseau de la machine.

## Les tutoriels

Les tutoriels sont des **fiches pratiques** rédigées par les professeurs : un titre, un
résumé, une image de couverture, et un contenu libre (page rédigée dans l'application,
document existant ou lien externe). Les mots du glossaire y sont automatiquement
transformés en liens vers leur définition, et chaque fiche peut être téléchargée (page
ou PDF). Ces liens apparaissent sur **toutes les fiches affichées dans l'application** —
qu'elles aient été rédigées ici ou importées d'un fichier de page web. Deux exceptions,
par nature : un **lien externe** (le site d'un tiers, que ForetMap n'a pas à réécrire) et
un **document PDF joint**, affiché tel quel.

- Un tutoriel se **relie** aux tâches et aux zones/repères concernés : l'élève le trouve
  directement depuis la tâche ou le lieu.
- **Accusé de lecture** : l'élève confirme « j'ai lu et compris » ; l'application retient
  ses lectures.
- Le professeur crée, modifie, réordonne et retire les fiches (un retrait les masque sans
  rien détruire). Le module Tutoriels entier peut être désactivé dans les réglages —
  l'onglet disparaît alors.
- **Sécurité des fiches importées** : le contenu d'une fiche est **nettoyé par
  l'application avant affichage** — la mise en page, les styles, les images et les liens
  sont conservés, mais tout code exécutable (scripts, formulaires, pages embarquées)
  qu'un fichier importé pourrait contenir est retiré. Une fiche qui reposait sur un tel
  code pour son affichage doit être reprise en page simple ou proposée en **lien
  externe** (elle s'ouvre alors avec les protections normales du navigateur). Les liens
  « s'ouvrir dans un nouvel onglet » d'une fiche restent, comme avant, affichés dans la
  fenêtre d'aperçu.

### Le contrôle de compréhension (questions avant validation)

**Par défaut, non : un tutoriel se valide d'une simple case à cocher.** L'élève clique
« Marquer comme lu », coche « je confirme avoir lu et compris », et c'est terminé —
aucune question ne lui est posée.

Un **contrôle de compréhension** existe cependant, et peut être allumé. Une fois activé,
l'élève qui veut valider un tutoriel doit d'abord répondre juste à une ou plusieurs
questions du Quiz **avant** de pouvoir cocher la case de confirmation. Le même mécanisme
s'applique aux fiches espèces (« Espèce découverte »).

Ce qu'il faut réunir pour qu'un tutoriel soit réellement soumis à questions :

1. **L'interrupteur du site** est allumé — Réglages → « Validation des lectures
   (contrôle de compréhension) » → _Exiger des questions avant de valider une lecture_.
   Éteint (valeur par défaut), rien ne change nulle part : c'est l'interrupteur maître,
   aucun réglage plus fin ne peut le contourner.
2. **Des questions du Quiz sont rattachées au tutoriel**, **approuvées** ET cochées
   **bloquantes**, dans l'écran « Rattacher des questions aux contenus » (onglet Quiz, côté
   professeur). Ces trois conditions vont ensemble : une question rattachée mais laissée en
   « proposée », ou non cochée bloquante, ne conditionne rien. Sans question bloquante
   approuvée, le tutoriel se valide comme avant, même interrupteur allumé.

   > **À savoir** : les rattachements créés automatiquement (à l'import d'un lot de
   > questions, ou par le rapprochement de contenu) sont **volontairement non bloquants**.
   > Personne ne les a demandés un par un ; les rendre bloquants d'office conditionnerait
   > des dizaines de fiches d'un coup le jour où l'interrupteur s'allume. Un conditionnement
   > ne s'applique que là où un professeur a explicitement coché « bloquant ».

   L'écran affiche en permanence **où en est le dispositif** : interrupteur allumé ou éteint,
   nombre de questions bloquantes, nombre de contenus couverts, propositions en attente. S'il
   annonce « 0 question bloquante » alors que l'interrupteur est allumé, aucun élève ne verra
   jamais de question — c'est le cas le plus fréquent quand « rien ne se passe ».

Les réglages qui accompagnent l'interrupteur (panneau dédié **Validation des lectures** dans
**Paramètres administrateur**, plus préréglages par type tutoriel / fiche espèce / glossaire) :

| Réglage                                         | Effet                                                                                                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exigence par défaut                             | **une** question réussie suffit (défaut), **toutes** les questions rattachées, ou un **seuil** de N réussites.                                                                                                            |
| Nombre de bonnes réponses attendues             | Le N du mode « seuil » (visible dans **Réglages → Validation des lectures** uniquement lorsque le mode site est « seuil », et dans **Rattacher des questions** lorsque l'exigence d'une fiche est « un nombre minimum »). |
| Erreurs tolérées avant blocage                  | **0 par défaut** : la première mauvaise réponse bloque. Le porter à 1 ou 2 laisse à l'élève le droit de se tromper sans tout perdre.                                                                                      |
| Délai avant nouvelle tentative après une erreur | **3 jours par défaut.** Une fois la tolérance épuisée, la validation de ce tutoriel est verrouillée pour la durée indiquée. `0` supprime le verrou et autorise le réessai immédiat.                                       |
| Questions posées d'affilée au maximum           | **3 par défaut.** En mode « toutes », l'élève avance par paliers plutôt que d'enchaîner huit questions : ses bonnes réponses sont gardées d'une fois sur l'autre.                                                         |
| Annoncer le contrôle sur le bouton              | **Oui par défaut.** Le bouton « Marquer comme lu » porte alors une pastille (« 1 question », « 🔒 ») pour prévenir l'élève avant qu'il ne clique.                                                                         |
| Portée du blocage                               | **La fiche entière par défaut** (comportement historique), ou la **seule question ratée** — l'élève poursuit alors sur les autres questions de la fiche.                                                                  |
| Afficher les pastilles d'état                   | **Oui par défaut.** Une petite marque à côté du bouton : **✓** contrôle réussi, **?** questions restantes, **🔒** bloqué. Rien ne s'affiche là où rien n'est conditionné.                                                 |
| Tutoriels liés avant tâche « faite »            | **Non par défaut.** Si activé, l'élève doit avoir **lu** (validé) tous les tutoriels rattachés à la tâche avant de pouvoir la marquer comme faite.                                                                        |

**Où s'appliquent ces réglages (cascade)** — du plus général au plus précis :

| Niveau        | Où le configurer                               | Ce qu'il couvre                                                                                                                                       |
| ------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Site**      | Réglages → Validation des lectures             | Mode, seuil N, erreurs tolérées, questions par session, délai et portée du verrou (valeurs par défaut pour toute l'application).                      |
| **Par type**  | Même panneau, section « Préréglages par type » | Tutoriels, fiches espèces ou glossaire : surcharge optionnelle de chaque paramètre ci-dessus (`Hériter` = reprendre le site).                         |
| **Par fiche** | Quiz → Rattacher des questions → fiche choisie | Exception pour un tutoriel, une espèce ou un terme précis ; peut aussi dispenser la fiche. L'écran indique la règle **effective** et d'où elle vient. |

Ce que l'élève voit, dans l'ordre. **Avant même de cliquer**, le bouton indique ce qui
l'attend : « 1 question », ou un cadenas si la validation est encore bloquée. Au clic, un
**petit panneau surgit par-dessus la page** — il ne masque pas le tutoriel qu'on vient de
lire — et énonce les règles noir sur blanc : combien de questions vont être posées, combien
il en restera après, combien d'erreurs sont permises, ce que coûte une erreur de trop, et le
rappel qu'abandonner maintenant ne coûte rien. Vient ensuite la question — énoncé,
illustration éventuelle avec son crédit, choix mélangés —, puis le résultat. Bonne réponse : il passe à la
confirmation de lecture. Mauvaise réponse : le message de verrou, avec le nombre de jours
avant de pouvoir réessayer. **Abandonner ne coûte rien** tant qu'aucune réponse n'a été
envoyée. Les bonnes réponses déjà données ailleurs (dans l'onglet Quiz, par exemple)
comptent : une question déjà réussie n'est pas reposée.

### Les pastilles d'état

À côté de chaque bouton de validation, une petite marque dit où en est l'élève, sans qu'il
ait à cliquer :

| Marque | Signification                                                       |
| ------ | ------------------------------------------------------------------- |
| **✓**  | Le contrôle est réussi : la validation est ouverte.                 |
| **?**  | Il reste des questions à réussir (le nombre est indiqué au survol). |
| **🔒** | Une erreur a posé un verrou ; l'échéance est indiquée.              |

Rien ne s'affiche sur un contenu non conditionné, ni sur un contenu déjà validé : une marque
partout ne signalerait plus rien. La forme suffit à distinguer les trois cas — la couleur ne
fait que la renforcer, pour rester lisible en cas de daltonisme ou à l'impression. En tête de
la liste des tutoriels, un décompte récapitule l'ensemble (« ✓ 3 acquis · ? 2 en attente »).

Le réglage **« Afficher les pastilles d'état »** permet de les éteindre entièrement.

### Rattacher les questions aux contenus

L'écran se trouve dans l'onglet **Quiz** côté professeur, sous le catalogue et l'éditeur de
questions : **« Rattacher des questions aux contenus »**. Trois onglets — **Tutoriels**,
**Fiches espèces**, **Glossaire** — donnent accès aux trois types de contenus ; l'écran ne
servait auparavant que les tutoriels. La liste de gauche indique pour chacun combien de
questions bloquantes il porte, et combien de propositions attendent une validation.

**Le glossaire se valide lui aussi**, depuis que la fiche d'un terme porte un bouton
**« J'ai appris ce terme »** (voir plus bas). Un lien bloquant sur un terme a donc un sens :
l'élève devra réussir la question rattachée avant de pouvoir confirmer qu'il a appris le
terme. Ce n'était pas le cas avant : le glossaire était purement consultatif, et un lien
bloquant y restait sans effet pour toujours, sans que rien ne le signale.

Pour un contenu choisi, on peut :

- **Rattacher une question** : un champ de recherche filtre le catalogue par code ou par
  texte ; les questions déjà rattachées n'y sont plus proposées.
- **Rendre une question bloquante ou non** : une question non bloquante reste associée à la
  fiche (elle l'enrichit) sans conditionner la validation.
- **Changer le statut** : seules les questions **approuvées** comptent. Une question
  « proposée » n'a aucun effet tant qu'un professeur ne l'a pas approuvée ; « rejetée » la
  met de côté sans l'effacer.
- **Fixer l'exigence propre à ce contenu** : suivre le réglage du site, ou bien exiger une
  bonne réponse, toutes, un **nombre minimum** (avec un champ numérique lorsque vous choisissez
  ce mode) — ou **dispenser** cette fiche (« Aucune question exigée » : la validation reste
  une simple confirmation pour ce contenu, même si le contrôle est actif ailleurs).
- Une phrase récapitule la règle appliquée (ex. « L'élève devra répondre correctement à 2
  questions sur 5 bloquantes »). Un bandeau rappelle le réglage du site quand la fiche hérite
  du site.
- Le tableau des questions rattachées indique le **niveau scolaire** de chaque question
  (collège / lycée) et signale les questions lycée bloquantes qui pourraient surprendre un
  collégien.
- Un **suivi agrégé** (sans noms) indique combien d'élèves sont en attente, ont réussi le
  contrôle ou sont verrouillés après une erreur.
- **Approuver toutes les propositions d'un coup** : un bouton reprend l'ensemble des
  rattachements « proposés » du contenu courant. Approuver n'est pas conditionner — le
  caractère bloquant reste à cocher ligne par ligne.

### Le rattachement automatique

Le bouton **« Proposer des rattachements (par le contenu) »** compare le texte des questions
et celui des contenus, et propose les rapprochements qu'il trouve. Il s'applique désormais aux
trois types, chacun traité par la méthode qui lui convient : pour un **tutoriel**, le
rapprochement porte sur le **contenu réel de la fiche**, pas seulement sur son titre (une
question sur le compost est rapprochée de la fiche compostage même si le mot exact du titre n'y
figure pas) ; pour une **fiche espèce** ou un **terme de glossaire**, c'est la présence du
libellé dans l'énoncé qui compte — « Menthe », « photosynthèse » y apparaissent tels quels.

Chaque proposition est accompagnée d'un **pourcentage de confiance** et des **mots qui l'ont
motivée**, pour juger d'un coup d'œil. Deux précautions :

- Rien n'est enregistré tant que vous n'avez pas cliqué sur **« Enregistrer ces
  propositions »** : le premier clic ne fait que montrer ce qui serait créé.
- Une fois enregistrées, les propositions arrivent en statut **« proposé »** : elles restent
  sans effet sur les élèves jusqu'à ce que vous les approuviez — une par une, ou toutes
  ensemble avec le bouton d'approbation groupée. C'était le piège principal : sur quarante
  propositions, personne n'allait au bout des quarante changements, et le rattachement
  automatique ne débouchait sur rien.

L'outil récupère aussi les **« questions liées »** que vous auriez déjà saisies sur une fiche
question : elles ne remontaient pas d'elles-mêmes dans le contrôle de compréhension.

Le rapprochement automatique reste une aide, pas un verdict : il propose, vous décidez.
Relisez avant d'approuver — c'est ce qui déterminera si un élève peut valider sa lecture.

### Voir et débloquer les élèves bloqués

L'écran **« Élèves bloqués »** se trouve sous le rattachement, dans l'onglet Quiz. Il répond à la
question qu'on se pose forcément une fois le dispositif allumé : _qui n'arrive pas à valider, et
pourquoi ?_

Chaque ligne dit l'élève, la fiche concernée, la question sur laquelle il a buté, le nombre
d'erreurs et le temps restant. Un bouton **« Débloquer »** lève le verrou immédiatement — l'élève
peut retenter aussitôt. Une case permet d'afficher aussi les blocages déjà expirés, utile pour voir
si une fiche bloque tout le monde.

Sans cet écran, un élève bloqué qui ne dit rien restait bloqué, et personne ne le savait.

### Choisir ce que bloque une erreur

Le réglage **« Portée du blocage après erreur »** décide de ce qu'une erreur de trop condamne :

- **La fiche entière** (par défaut) — l'élève ne peut plus rien valider sur cette fiche.
- **La question seule** — il peut continuer sur les autres questions de la fiche, et ne rebutera
  que sur celle qu'il a ratée.

Le second choix est plus doux, et souvent plus juste quand une fiche porte plusieurs questions :
se tromper sur l'une ne dit rien de ce qu'on sait des autres.

### Repérer les questions mal formulées

Toujours dans l'onglet Quiz, les **taux de réussite par question** classent les questions de la
plus ratée à la mieux réussie. Une question que presque tout le monde rate est rarement
« difficile » : le plus souvent, son énoncé laisse deux lectures possibles, ou la bonne réponse
prête à discussion. Les questions signalées ont assez de tentatives pour que le chiffre veuille
dire quelque chose — sur deux essais, 0 % ne prouve rien.

C'est particulièrement à surveiller pour les questions **bloquantes** : une question défectueuse
qui conditionne une validation bloque toute une classe sans raison.

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

> ⚠️ **Point d'attention** — Le contrôle **ignore le niveau des questions**. Une question
> pensée pour le lycée peut bloquer un élève de collège si elle est rattachée à sa fiche.
> L'application ne sait pas en quelle classe est un élève : cette information n'existe nulle
> part. En attendant, c'est au moment du rattachement qu'il faut y veiller.

> ⚠️ **Point d'attention** — La progression des paliers reconnaît aussi les élèves par
> **prénom + nom** (héritage des anciennes inscriptions sans compte) : deux homonymes
> parfaits pourraient voir leurs validations confondues. En revanche, pour
> s'inscrire / se retirer / marquer fait sur une tâche, l'identité de l'élève connecté
> vient toujours de son compte : envoyer le nom d'un autre élève dans la requête ne
> permet plus d'agir à sa place.

## Pour aller plus loin

- Vue d'ensemble de l'application : [presentation.md](presentation.md)
- Comptes, rôles et paliers en détail : [comptes-roles-et-groupes.md](comptes-roles-et-groupes.md)
- La carte, les zones et les repères où vivent les tâches : [carte-et-zones.md](carte-et-zones.md)
- Les statistiques et le suivi de la progression : [stats-forum-et-suivi.md](stats-forum-et-suivi.md)
