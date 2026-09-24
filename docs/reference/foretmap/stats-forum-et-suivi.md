# Statistiques, forum et suivi — ForetMap

> **Public de ce document : professeurs et administrateurs.**
> Il décrit ce que l'application fait aujourd'hui, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md)

## À quoi ça sert

Suivre l'activité (statistiques, classement, audit), faire vivre les échanges (forum,
commentaires) et rester informé (notifications, temps réel).

## Les statistiques

- **Tableau de bord professeur** : pour chaque élève, le nombre de tâches par statut
  (en cours, faites, validées), la progression vers les paliers, et un panneau de
  lecture des carnets (articles enrichis, imports, export).
- **Classement** : un palmarès des élèves fondé sur les tâches validées — motivant en
  classe, à utiliser avec discernement.
- **Export tableur** : les données de suivi s'exportent en un clic (permission
  dédiée) pour les bulletins ou les bilans.
- **Côté élève** : chacun voit sa propre progression ; l'accès aux statistiques
  générales est un réglage (activable ou non par l'administrateur).
- **Fiche « Mes statistiques » d'un compte hors groupe n3beur** (visiteur, membre du
  personnel, professeur, administrateur) : ni badge de palier, ni barre de progression,
  ni compteurs de tâches, ni « Activité récente » — ces rubriques n'ont pas de sens pour
  un compte qui ne fait pas de tâches. Sa fiche se limite au volet **Biodiversité &
  tutoriels** (espèces observées, observations, tutoriels lus), qui reste visible pour
  tout le monde. Dès qu'un compte rejoint un groupe conférant un palier n3beur, les
  rubriques de progression et de tâches réapparaissent.
- **Filtrage par groupe** : un professeur au périmètre limité ne voit que ses groupes.

## Le forum et les commentaires

- **Forum** : des fils de discussion avec messages, images et réactions emoji. Il peut
  être **cloisonné par groupe** (chaque classe son espace). Seuls les **visiteurs** n'y ont
  pas accès, et le module entier peut être désactivé.
- **Qui participe** : élèves, personnels (AED, vie scolaire, agents), profs de classe,
  n3boss et administrateurs — écrire, répondre et réagir. Le personnel et les profs de
  classe n'ont pas de carte de travail ni de tâches, mais ils ont la parole : ce sont eux
  qui voient le terrain au quotidien. Ouvrir un **nouveau sujet** suppose d'appartenir à au
  moins un groupe, puisque le forum est cloisonné par groupe : pensez à rattacher les
  personnels à un groupe (par exemple « Personnels ») si vous voulez qu'ils puissent lancer
  des discussions et pas seulement répondre.
- **Messages non lus** : un **point rouge** s'allume sur l'onglet **Forum** dès qu'une autre
  personne publie un message (nouveau sujet ou réponse) que vous n'avez pas encore vu. Sur
  téléphone, quand le Forum est rangé dans le menu, le point apparaît aussi sur le bouton
  « Plus » ; côté professeur, il apparaît aussi sur le pôle **Suivi**. Ouvrir le forum
  éteint le point. Vos propres messages ne l'allument jamais.

  > ⚠️ **Point d'attention** — La lecture est mémorisée **sur l'appareil** : un message lu
  > sur l'ordinateur de la salle peut encore apparaître comme non lu sur le téléphone. La
  > toute première fois qu'un compte ouvre l'application sur un appareil, le point s'allume
  > s'il existe déjà des messages, puisque rien n'y a encore été lu.

- **Affichage** : sur ordinateur, la liste des sujets est à gauche et la discussion à droite.
  Sur téléphone ou tablette en portrait, on voit d'abord la **liste** ; toucher un sujet
  ouvre la **discussion** en plein écran, et le bouton « ← Tous les sujets » ramène à la liste.
  Le formulaire d'un **nouveau sujet** reste replié derrière le bouton « + Nouveau sujet ».
  Après une réponse, la discussion se place sur la page qui contient ce nouveau message. Un
  sujet **verrouillé** l'indique clairement à la place du formulaire de réponse.
- **Réactions** : les réactions déjà posées restent visibles sous chaque message ; un
  toucher sur l'une d'elles l'ajoute ou la retire, le bouton « + » ouvre la liste complète.
- **Signaler / supprimer** : « Signaler » ouvre un petit champ pour le motif (au moins trois
  caractères) ; on ne signale pas ses propres messages. Supprimer un message demande une
  confirmation ; le message est alors remplacé par « [message supprimé] » pour tout le monde.
- **Modération** : les messages peuvent être **signalés** ; les professeurs disposent
  des outils de modération (masquer, supprimer, traiter les signalements).
- **Commentaires contextuels** : des commentaires attachés directement à une tâche, un
  projet ou une zone — la discussion reste au plus près du travail concerné. Mêmes
  participants que le forum : tout le monde sauf les visiteurs. Depuis le **Plan des
  personnels**, le bouton « Signaler ou proposer » d'une fiche de lieu écrit dans ces mêmes
  commentaires, et le message ressort dans « Messages reçus sur les lieux ». À côté du
  titre de la section, même repliée, une **pastille chiffrée** résume la situation :
  - **rouge** avec le **nombre de commentaires non lus** (jamais ouverts, ou arrivés
    depuis la dernière consultation) ;
  - **verte** avec le **nombre total** de commentaires une fois tout lu ;
  - **aucune pastille** quand il n'y a pas encore de commentaire.

  Ouvrir la section marque les messages comme lus et la pastille repasse au vert.

  > ⚠️ **Points d'attention** — le suivi de lecture est propre à chaque appareil : un fil
  > lu sur l'ordinateur de la salle reste rouge sur le téléphone. Le nombre de non-lus est
  > déduit de l'écart avec le nombre de commentaires lors de la dernière lecture : si des
  > messages ont été supprimés entre-temps, il peut être sous-estimé (il vaut toujours au
  > moins 1 dès qu'il y a du nouveau). Au premier affichage après cette évolution, les fils
  > déjà lus mais modifiés depuis comptent tous leurs commentaires comme non lus, une seule
  > fois.

  > ⚠️ **Corrigé le 23 septembre 2026** — le point « non lus » ne s’allumait **jamais**, et
  > deux messages envoyés dans la même seconde pouvaient s’afficher dans le désordre. Le
  > nombre, lui, a toujours été juste. Au premier chargement suivant la correction, les fils
  > déjà lus paraîtront **une fois** non lus : les repères de lecture enregistrés par les
  > navigateurs ne valaient rien et sont repris de zéro.

## Notifications et temps réel

- Un **centre de notifications** signale ce qui est nouveau ; les événements critiques
  s'affichent en bandeau.
- **Échéances de l'élève** : deux avis suivent ses tâches en cours — « Échéance proche »
  (à rendre aujourd'hui ou demain) et « Tâches en retard » (date limite dépassée). Ils se
  comptent en **jours de calendrier** : une tâche à rendre _aujourd'hui_ est annoncée comme
  proche, jamais comme en retard. Chacun est un avis **d'état** : il passe tout seul en
  « lu » dès qu'aucune tâche ne le justifie plus (échéance repoussée, tâche terminée ou
  validée), au lieu de s'empiler à chaque changement de compte.
- L'application se met à jour **en temps réel** : une tâche validée par le professeur
  apparaît chez l'élève sans recharger la page ; les listes d'élèves et de tâches
  restent synchrones entre les écrans ouverts. Une observation ajoutée ou retirée
  du carnet se voit aussi tout de suite chez les autres personnes connectées.
- **Présence en ligne (professeur)** : sur le classement, une pastille indique si
  l'élève est **en ligne**, **vu récemment** (quelques minutes) ou **hors ligne**.
  Seuls les profils autorisés à lire les statistiques voient ces pastilles — les
  élèves ne voient pas qui d'autre est connecté. L'administrateur peut couper cette
  fonction dans les modules du site.

## L'audit et la médiathèque

- **Journal d'audit** : les actions sensibles (créations, suppressions, validations,
  prises de main sur un compte, tentatives de connexion douteuses…) sont consignées
  avec leur auteur et leur date. Sa lecture est réservée aux profils disposant de la
  permission dédiée. Les **créations et modifications** de zones, plantes, repères,
  groupes, tutoriels, packs mascotte, questions QCM et liens du réseau trophique y
  figurent aussi.
- **Journal de sécurité (administrateurs)** : sous-onglet dédié dans Audit, réservé aux
  administrateurs. Il reprend les mêmes événements avec l’**adresse IP** et le
  **navigateur** utilisés, des filtres (période, compte, action, IP) et un export
  tableur ou JSON pour un incident. La déconnexion d’un compte **n’efface pas** cet
  historique : on peut toujours remonter jusqu’à l’auteur via son compte, puis croiser
  l’IP et le navigateur.
- **Suivi utilisateurs (administrateur)** : dans les paramètres d’administration,
  un panneau dédié montre (1) qui est **en ligne** ou **vu récemment** (sans surcharger
  le serveur : pas de battement de cœur permanent), (2) le **passage** dans les
  applications du lycée — compteurs anonymes pour tout le monde, et pour les comptes
  connectés quels produits ont été touchés —, (3) un **journal d’activité léger**
  (connexions, débuts de session) distinct de l’audit sensible, conservé moins longtemps.
  Les visiteurs sans compte n’apparaissent que dans les compteurs anonymes.
- **Médiathèque** : une bibliothèque d'images (et de pistes audio ou vidéo)
  réutilisables pour illustrer les contenus, gérée par les professeurs.
- **Importer depuis un téléphone** : deux boutons, « 📁 Importer » (galerie ou
  gestionnaire de fichiers) et « 📸 Prendre une photo ». Les photos volumineuses sont
  automatiquement allégées avant l'envoi ; un fichier refusé est signalé **par son nom**
  et n'interrompt pas l'import des autres.
- **Formats acceptés** : images JPEG, PNG, WebP, GIF, SVG ; audio MP3, WAV, OGG, M4A ;
  vidéo MP4, WebM, MOV. Taille maximale : 15 Mo par média.
- **Photos jointes à un message** (forum, commentaires) : jusqu'à **trois** par message, et
  **8 Mo par photo**. Au-delà, l'envoi est refusé avec un message qui le dit — l'allègement
  automatique avant envoi fait que la limite n'est en pratique jamais atteinte depuis un
  téléphone. Cette borne protège le serveur : quelques envois très lourds simultanés
  suffisaient à le faire redémarrer, ce qui coupait le site pour tout le monde.

## ⚠️ Points d'attention

> ⚠️ **Point d'attention** — Les photos **HEIC / HEIF** (réglage « haute efficacité » de
> certains appareils Android et iPhone) ne sont pas lisibles par les navigateurs :
> l'import les refuse en expliquant le réglage à changer (Appareil photo → Format des
> photos → **JPEG** ou « Compatibilité maximale »).

> ⚠️ **Point d'attention** — Le classement est calculé sur les tâches **validées** :
> un professeur qui tarde à valider fausse involontairement le palmarès (et retarde
> les promotions de palier). Un passage régulier sur la file « à valider » est le
> meilleur entretien du système.

> ⚠️ **Point d'attention** — Le cloisonnement du forum par groupe suppose des groupes
> bien tenus : un élève sans groupe voit l'espace commun. Vérifier la composition des
> groupes en début d'année.

## Pour aller plus loin

[Présentation générale](presentation.md) · [Comptes, rôles et groupes](comptes-roles-et-groupes.md) · [Tâches, tutoriels et validation](taches-tutoriels-et-validation.md) · [Sommaire](../README.md)
