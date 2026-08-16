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
                    Marché : les gemmes circulent
                    entre camarades (rien ne se crée,
                    rien ne se perd — ça s'échange).
                    Les cœurs, eux, ne circulent pas.
```

À côté existe le **score d'équipe** : un compteur par équipe et par partie, alimenté
notamment par la résolution d'actions — il ne se confond pas avec la vitalité
(individuelle et durable).

## Le Marché

- **Les cœurs ne s'échangent pas** (réglage par défaut) : seules les **gemmes 💎** circulent
  entre joueurs. La raison est simple — si un cœur peut être retiré à un élève pour un écart
  de conduite, le laisser s'échanger permettrait de le racheter à un camarade, ou de se le
  faire offrir : la mesure n'aurait plus aucune portée. Une monnaie s'échange, une sanction non.
  Le réglage **« Cœurs échangeables sur le Marché »** (Réglages GL → Gameplay) permet de revenir
  au comportement historique si votre usage des cœurs ne porte aucune signification de conduite.
- **Les feuillets, eux, s'échangent** : un joueur peut proposer un feuillet de son carnet
  (jusqu'à 10 par offre). C'est une **copie** — il garde le sien, et le feuillet devient
  lisible par **toute l'équipe** du camarade qui le reçoit, comme n'importe quelle
  découverte. Le nom de celui qui l'a trouvé le premier reste attaché au feuillet : on
  n'offre pas la paternité d'une découverte, on offre une lecture.
  - Un élève ne peut proposer que ce qu'il a déjà — y compris ce qu'il a trouvé lors d'un
    chapitre précédent, puisque son carnet le suit d'une partie à l'autre.
  - Le receveur doit **participer à une partie en cours** : sans équipe active, l'échange
    est refusé avec un message explicite (le feuillet n'aurait nulle part où atterrir).
  - Réglage **« Feuillets échangeables sur le Marché »** (actif par défaut, nécessite le
    module Carnet de Sélène).
- Un échange se fait **entre deux joueurs de la même classe** : chacun propose ce
  qu'il donne (des gemmes, un ou plusieurs feuillets — et des cœurs si le réglage ci-dessus
  est activé), un fil de discussion accompagne la négociation,
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

### Réserver un sortilège à un peuple

Chaque sortilège porte un réglage **« Lanceurs autorisés »** à trois valeurs :

| Réglage                 | Qui peut lancer le sort                        |
| ----------------------- | ---------------------------------------------- |
| **Gnomes et licornes**  | tout le monde (valeur par défaut, comme avant) |
| **Gnomes uniquement**   | seules les équipes gnomes                      |
| **Licornes uniquement** | seules les équipes licornes                    |

Le peuple d'un joueur est celui de **son équipe** — un élève change donc de peuple
s'il change d'équipe, exactement comme le lore le raconte au passage des seuils.

Concrètement, quand un sort est réservé :

- il porte une **pastille** (« 🧙 Gnomes uniquement ») dans le catalogue de sorts et
  sur sa fiche, avant même qu'on essaie de le lancer ;
- l'assistant de lancement ne propose **que les équipes du bon peuple** ;
- dans la liste des contributeurs, les joueurs de l'autre peuple apparaissent mais
  avec la mention « Ne peut pas contribuer à ce sortilège », champs verrouillés ;
- le serveur refuse le lancement même si quelqu'un contourne l'écran — et il
  revérifie **juste avant de débiter** les cœurs et les gemmes. Un sort restreint
  après coup, alors que le pot était déjà réuni, ne part pas et ne coûte rien.

### Régler plusieurs sortilèges d'un coup

Dans **Contenus → Sortilèges**, chaque sort de la liste porte une case à cocher, avec
un « Tout sélectionner » au-dessus. Dès qu'au moins un sort est coché, un bandeau
d'**édition en masse** apparaît : on y choisit le réglage à appliquer, sa nouvelle
valeur, et on valide.

Les réglages modifiables en masse sont ceux à valeurs fixes :

- **Lanceurs autorisés** (le peuple, ci-dessus) ;
- **Validation du MJ** (lancement immédiat ou soumis à approbation) ;
- **Portée du lancement** (solo, collectif, ou libre) ;
- **Statut** (officiel ou proposé).

Le message de retour indique combien de sorts ont réellement changé : si certains
avaient déjà la valeur demandée, ils sont comptés à part — ce n'est pas une erreur.

> Le tableur d'import/export des sortilèges porte aussi ces trois réglages, en
> colonnes `lanceurs`, `validation_mj` et `portee_lancement` — pratique pour préparer
> tout un catalogue hors ligne. Une colonne **absente** du fichier laisse le réglage
> tel qu'il est en base : ré-importer un ancien fichier ne lève donc pas les
> restrictions déjà posées.

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

> ⚠️ **Point d'attention** — Un sortilège réservé à un peuple devient injouable pour une
> partie où **toutes les équipes sont du même autre peuple**. Rien ne casse (le sort est
> simplement refusé, avec un message clair), mais si un chapitre est bâti autour de sorts
> gnomes, prévoyez au moins une équipe gnome — ou laissez ces sorts sur « Gnomes et
> licornes ».

## Pour aller plus loin

[Présentation générale](presentation.md) · [Guide du MJ](guide-du-mj.md) · [Les deux peuples du seuil](lore-deux-peuples.md) · [Sommaire](../README.md)
