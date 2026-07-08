# La Visite et les mascottes — ForetMap

> **Public de ce document : professeurs et administrateurs.**
> Il décrit ce que l'application fait aujourd'hui, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md)

## À quoi ça sert

La Visite est le **mode grand public** de ForetMap : un parcours de découverte du
jardin, soigné et guidé par une mascotte animée, distinct de la carte de travail des
élèves. Elle s'adresse aux visiteurs de passage (même sans compte), aux élèves et aux
familles.

## Ce que vit le visiteur

- **Entrer** : depuis l'écran d'accueil, un bouton « Visiter en invité » (activable
  dans les réglages) ouvre la visite sans créer de compte. À la première venue, une
  fenêtre de bienvenue propose de **choisir sa mascotte guide** ; ce choix est retenu
  pour les fois suivantes et reste modifiable pendant la visite.
- **Explorer** : un plan du jardin avec zones et repères, que l'on parcourt en
  déplaçant la vue (zoom, glisser, mode plein écran). **Cliquer un lieu envoie d'abord
  la mascotte s'y rendre**, puis ouvre sa fiche.
- **La fiche d'un lieu** : titre, sous-titre, photo principale, contenu éditorial
  (paragraphes, intertitres, blocs d'images légendées), un volet Biodiversité (les
  espèces du lieu), un volet Tuto (les fiches pratiques associées), un mode « lecture
  confortable », et un bouton **« Marquer comme vu »** — qui fait fêter la mascotte.
- **La progression « vu / non-vu »** : pour un élève connecté, elle est rattachée à son
  compte et durable ; pour un invité anonyme, elle est mémorisée environ **24 heures**
  puis s'efface. Les marquages faits hors connexion sont conservés et synchronisés au
  retour du réseau.

## Les mascottes

- Chaque mascotte est un personnage animé (démarche, humeurs, célébrations) doté de
  **bulles de dialogue** contextuelles : elle commente les déplacements, l'ouverture
  d'une zone ou d'un repère, le marquage « vu »… La toucher la fait réagir.
- Elle se déplace **au clic** sur le plan et retient sa position d'une visite à
  l'autre.
- Un utilisateur connecté peut choisir **sa** mascotte préférée dans son profil ;
  l'administrateur définit la mascotte par défaut et peut restreindre la liste
  proposée.

## Ce que gère le professeur

- **Éditer les contenus** : directement dans la vue Visite — un panneau d'outils permet
  de dessiner des zones de visite, poser des repères, puis remplir chaque fiche
  (textes, blocs éditoriaux, photos — importables depuis les photos de la carte de
  travail, l'ordre est réordonnable). Une case « Visible en visite » masque un lieu au
  public sans le supprimer. Un bascule « aperçu élève » montre le rendu final.
- **Synchroniser avec la carte de travail** : la Visite a ses propres lieux, liés à
  ceux de la carte par leur identité. Deux outils : l'**import sélectif** (copier des
  zones/repères de la carte vers la visite, ou l'inverse — seule la géométrie et le nom
  voyagent) et le **réalignement complet** (reconstruire la couche visite depuis la
  carte, en préservant les textes des lieux conservés). C'est une **copie ponctuelle**,
  pas un lien vivant.
- **Créer des mascottes** : l'onglet « Packs mascotte » offre un **studio visuel** —
  animations image par image, comportements (réactions périodiques, réaction au
  toucher), bulles de dialogue par événement, aperçu animé en direct, bibliothèque
  d'images partagée. Un pack se travaille en **brouillon** puis se **publie** (seuls
  les packs publiés apparaissent en visite) ; il s'exporte et s'importe en archive pour
  circuler entre établissements.
- **Suivre la fréquentation** : un tableau de bord donne sessions, lieux vus et taux de
  parcours complets, en séparant élèves connectés et visiteurs anonymes.

## ⚠️ Points d'attention

> ⚠️ **Point d'attention** — **Pas de guidage GPS dans la Visite** : la mascotte s'y
> déplace uniquement au clic. Le suivi de la position GPS existe, mais sur la **carte
> de travail** des élèves (avec calage du plan et seuil de précision). Si l'on souhaite
> une visite « sur le terrain » guidée par la position réelle, c'est une évolution à
> demander.

> ⚠️ **Point d'attention** — Les contenus de visite n'acceptent que des **images**
> (pas d'audio ni de vidéo), et la progression d'un invité anonyme est **éphémère**
> (~24 h) : elle n'est pas transférée s'il crée ensuite un compte.

> ⚠️ **Point d'attention** — La synchronisation carte ↔ visite étant une copie
> ponctuelle, une zone renommée ou déplacée sur la carte de travail ne se met pas à
> jour toute seule côté visite : penser à resynchroniser. Et les packs mascotte n'ont
> pas d'historique de versions : publier écrase l'état précédent (exporter une archive
> avant les grands changements fait office de sauvegarde).

## Pour aller plus loin

[Présentation générale](presentation.md) · [Carte et zones](carte-et-zones.md) · [Sommaire](../README.md)
