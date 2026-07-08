# L'économie du jeu : cœurs, gemmes, marché et sortilèges — Gnomes & Licornes

> **Public de ce document : professeurs, maîtres du jeu (MJ) et administrateurs.**
> Il décrit ce que le jeu fait aujourd'hui, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md)

## À quoi ça sert

Comprendre d'où viennent et où vont les points du jeu — pour l'expliquer simplement
aux élèves et régler des séances équilibrées.

## Les deux jauges : cœurs ❤️ et gemmes 💎

Chaque joueur possède deux jauges **personnelles et durables** (elles ne se remettent
pas à zéro entre les parties), plafonnées à 99 :

- **Cœurs ❤️** — les points de vie.
- **Gemmes 💎** — les points de pouvoir.

L'ensemble s'appelle la **vitalité** ; c'est un réglage global à activer, et
l'administrateur choisit les valeurs de départ des nouveaux joueurs (3 et 3 par
défaut).

**Le triple rôle, assumé** : les mêmes points servent de jauge de vie/pouvoir, de
monnaie d'échange et de récompense. C'est voulu — un seul système simple plutôt que
trois compteurs — et c'est pourquoi le jeu affiche désormais, partout où l'on dépense,
« _tu dépenses tes cœurs/gemmes — il te restera N_ ».

## Le schéma des flux

```
  ENTRÉES                              SORTIES
  ────────                             ────────
  Ajustements du MJ  ──►  ❤️ 💎  ◄──  Lancement de sortilèges
  (par joueur/équipe)      │           (coûts en gemmes et/ou cœurs)
  Récompenses de           │
  feuillets (cœurs)  ──►   │    ◄──   Consultation/effacement de
                           │           feuillets (coûts en gemmes)
                           ▼
                    Marché : les points circulent
                    entre camarades (rien ne se crée,
                    rien ne se perd — ça s'échange)
```

À côté existe le **score d'équipe** : un compteur par équipe et par partie, alimenté
notamment par la résolution d'actions — il ne se confond pas avec la vitalité
(individuelle et durable).

## Le Marché

- Un échange se fait **entre deux joueurs de la même classe** : chacun propose ce
  qu'il donne (cœurs et/ou gemmes), un fil de discussion accompagne la négociation,
  et l'échange n'aboutit que lorsque **les deux ont coché « J'accepte »**.
- Sous chaque champ, le joueur voit ce qu'il lui restera après l'échange ; à la
  finalisation, le serveur vérifie les soldes (un échange impossible est refusé avec
  un message de solde insuffisant).
- Le Marché est un **module** à activer — et il exige que la **vitalité** soit active
  aussi : les réglages l'indiquent désormais clairement, avec un bouton pour activer
  les deux d'un coup.

## Les Sortilèges

- Chaque chapitre a son **catalogue de sorts**, avec un coût en gemmes et/ou en cœurs.
- Le lancement passe par un **assistant** : les joueurs de l'équipe (ou de toutes les
  équipes, selon le réglage) **contribuent** au pot commun du sort, chacun voyant son
  solde et ce qu'il lui restera. Quand le coût est réuni, le sort se lance — avec
  **l'approbation du MJ** si le réglage l'exige.
- Par défaut, les joueurs peuvent lancer les sorts ; le profil de séance « MJ +
  tours » réserve le lancement au MJ.
- Le module Sortilèges est désactivé par défaut : c'est un choix d'activation
  conscient de l'admin.

## Les feuillets de Sélène

Selon les réglages, la consultation ou l'« effacement » d'un feuillet peut **coûter des
gemmes**, et certaines découvertes **rapportent des cœurs** — c'est le troisième
circuit de l'économie, qui relie la lecture du lore à la vitalité.

## ⚠️ Points d'attention

> ⚠️ **Point d'attention** — Comme les jauges sont durables, une classe qui joue toute
> l'année accumule : penser aux **ajustements MJ** (ou à des coûts de sorts plus
> élevés) pour garder de la tension. Un « plancher » configurable (empêcher un élève de
> descendre sous X cœurs via le marché ou un sort) est noté au registre comme évolution
> possible, à trancher après observation en classe.

> ⚠️ **Point d'attention** — Le Marché n'apparaît chez les joueurs que si module Marché
> **et** vitalité sont actifs tous les deux ; les réglages avertissent, mais c'est le
> premier réflexe de vérification si « le Marché a disparu ».

## Pour aller plus loin

[Présentation générale](presentation.md) · [Guide du MJ](guide-du-mj.md) · [Les deux peuples du seuil](lore-deux-peuples.md) · [Sommaire](../README.md)
