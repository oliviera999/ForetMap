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
  lecture des carnets d'observation.
- **Classement** : un palmarès des élèves fondé sur les tâches validées — motivant en
  classe, à utiliser avec discernement.
- **Export tableur** : les données de suivi s'exportent en un clic (permission
  dédiée) pour les bulletins ou les bilans.
- **Côté élève** : chacun voit sa propre progression ; l'accès aux statistiques
  générales est un réglage (activable ou non par l'administrateur).
- **Filtrage par groupe** : un professeur au périmètre limité ne voit que ses groupes.

## Le forum et les commentaires

- **Forum** : des fils de discussion avec messages, images et réactions emoji. Il peut
  être **cloisonné par groupe** (chaque classe son espace). Les visiteurs n'y ont pas
  accès, et le module entier peut être désactivé.
- **Modération** : les messages peuvent être **signalés** ; les professeurs disposent
  des outils de modération (masquer, supprimer, traiter les signalements).
- **Commentaires contextuels** : des commentaires attachés directement à une tâche, un
  projet ou une zone — la discussion reste au plus près du travail concerné.

## Notifications et temps réel

- Un **centre de notifications** signale ce qui est nouveau ; les événements critiques
  s'affichent en bandeau.
- L'application se met à jour **en temps réel** : une tâche validée par le professeur
  apparaît chez l'élève sans recharger la page ; les listes d'élèves et de tâches
  restent synchrones entre les écrans ouverts.

## L'audit et la médiathèque

- **Journal d'audit** : les actions sensibles (créations, suppressions, validations,
  prises de main sur un compte, tentatives de connexion douteuses…) sont consignées
  avec leur auteur et leur date. Sa lecture est réservée aux profils disposant de la
  permission dédiée.
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
