# Les QCM et la pédagogie — Gnomes & Licornes

> **Public de ce document : professeurs, maîtres du jeu (MJ) et administrateurs.**
> Il décrit ce que le jeu fait aujourd'hui, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md)

## À quoi ça sert

Les questions à choix multiples sont le cœur pédagogique du jeu : elles vérifient les
connaissances d'écologie, rythment la partie sur le plateau, déclenchent des
découvertes narratives et peuvent conditionner le « marquer appris ».

## Deux jeux de questions distincts

|              | **QCM biomes**                               | **QCM lore**                                          |
| ------------ | -------------------------------------------- | ----------------------------------------------------- |
| Sujet        | Écologie / sciences du vivant (le programme) | L'histoire du jeu (Sélène, le Souffle, les feuillets) |
| Sert à       | Apprendre et vérifier les connaissances      | Faire avancer et récompenser le récit                 |
| S'édite dans | Contenus → QCM biomes                        | Contenus → QCM lore                                   |

Les deux se gèrent de la même façon : édition question par question ou **import/export
tableur**, avec pour chaque question ses choix de réponse et des **retours
pédagogiques** (un commentaire par réponse, qui explique pourquoi c'est juste ou faux).

## Où l'élève rencontre les questions

- **Sur le plateau** : une équipe qui arrive sur un repère « question » reçoit un QCM —
  soit une **question fixe** choisie par le MJ pour ce repère, soit un **tirage** dans
  le catalogue (par catégorie/niveau). Le repère précise s'il puise dans les QCM biomes
  ou les QCM lore.
- **Hors partie** : les questions restent accessibles pour s'entraîner.
- **Réglage « QCM réservés au MJ »** : quand il est actif, les joueurs ne reçoivent
  plus les questions directement — le MJ les présente et les valide depuis sa console
  (mode animation).
- La répétition d'une question sur un repère déjà visité dépend d'un réglage (à chaque
  passage, une fois par équipe, une fois par partie).

## Le conditionnement par QCM (« marquer appris »)

La mécanique la plus pédagogique du jeu : exiger qu'un élève **réussisse une question**
avant de pouvoir marquer une ressource (espèce, terme du glossaire scientifique,
tutoriel, feuillet…) comme apprise.

- **Relier ressources et questions** : dans **Contenus → Conditionnement QCM**, on crée
  des liens « cette ressource ↔ cette question », avec un interrupteur « bloquant » par
  lien, un statut et des filtres pour s'y retrouver.
- **Régler le comportement global** : dans **Réglages plateforme → Conditionnement par
  QCM** (admin) — l'interrupteur général (tant qu'il est éteint, les liens sont sans
  effet), le mode (une réussite suffit / toutes les questions / un nombre minimum), le
  marquage automatique après une bonne réponse, et le **délai avant nouvelle
  tentative** après une erreur (3 jours par défaut).
- **Ce que vit l'élève** : au moment de marquer « appris », une question s'ouvre ;
  bonne réponse → c'est acquis (et marqué automatiquement si le réglage le prévoit) ;
  mauvaise réponse → la ressource est verrouillée le temps du délai, puis il peut
  réessayer.

## Le marquage « appris » et le carnet

Indépendamment du conditionnement, l'élève peut marquer les contenus comme appris/lus
(espèces, glossaire scientifique, tutoriels, écosystèmes, feuillets, pages) et
**importer ses acquis dans son carnet personnel** — le MJ suit tout cela dans les
statistiques (progression individuelle et de classe).

## ⚠️ Points d'attention

> ⚠️ **Point d'attention** — Le conditionnement est **inerte tant que l'interrupteur
> global est éteint**, même si des liens existent : l'écran des liens le rappelle en
> bandeau. C'est le premier réflexe si « le blocage ne marche pas ».

> ⚠️ **Point d'attention** — Le délai de nouvelle tentative s'applique à **toute la
> ressource** après une erreur : un élève verrouillé n'est pas un bug. Le délai se
> règle (jusqu'à l'annuler, à 0 jour).

## Pour aller plus loin

[Présentation générale](presentation.md) · [Carte du royaume](carte-du-royaume.md) · [Guide du MJ](guide-du-mj.md) · [Sommaire](../README.md)
