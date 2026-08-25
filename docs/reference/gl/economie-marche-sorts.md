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

### Le plafond de jeu (nouveau réglage)

Le 99 ci-dessus est une limite **technique**. À côté existe désormais un plafond
**de jeu** : **« Cœurs maximum »** et **« Gemmes maximum »** (Réglages GL → Gameplay),
réglables de 1 à 99. La valeur **0 (par défaut) signifie « pas de plafond »** — le jeu
se comporte exactement comme avant tant que vous n'y touchez pas.

Pourquoi ce réglage existe : sans plafond, les cœurs ne font que monter. Ils cessent
d'être une ressource sous tension, et tous les sortilèges de soin (Soins, Transmission,
Résurrection) deviennent inutiles puisqu'il n'y a jamais de pénurie. Fixer un plafond
(5 est la valeur discutée pour une année de 6ème) redonne de la valeur au soin et rend
la gestion de son capital réellement intéressante.

**Deux règles à connaître avant de l'activer :**

- **Le plafond bloque les gains, il ne confisque rien.** Un élève déjà à 9 cœurs le
  jour où vous fixez le plafond à 5 **ne perd pas 4 cœurs**. Il ne peut simplement plus
  monter ; son solde ne redescend que par ses propres dépenses. Une sanction rétroactive
  et invisible serait incompréhensible pour un élève de 6ème — le jeu ne le fait pas.
- **Le plafond s'applique au jeu, pas au MJ.** Les effets de cases et les
  récompenses de feuillets le respectent (un gain qui ferait dépasser est tout
  simplement ignoré : rien n'est pris à personne). Sur le **Marché**, un échange
  qui ferait dépasser le plafond d'un des deux joueurs est **refusé** — personne
  ne perd rien, personne n'en gagne. Sans cela, le Marché serait le contournement
  évident (« donne-moi tes cœurs, je suis au maximum ») _ou_ ferait disparaître
  la monnaie du donneur. Un **ajustement manuel du MJ** reste souverain : vous
  pouvez toujours accorder un dépassement exceptionnel.

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
  - Si l'équipe du camarade **a déjà** ce feuillet, elle **garde le sien** : la copie ne
    l'efface pas davantage, et une découverte faite sur la carte ne se transforme pas en
    simple échange.
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
  un message de solde insuffisant). Si un plafond de cœurs ou de gemmes est en
  vigueur, un échange qui ferait dépasser ce plafond chez l'un des deux est
  **refusé de la même façon** : rien n'est transféré.
- Le Marché est un **module** à activer — et il exige que la **vitalité** soit active
  aussi : les réglages l'indiquent désormais clairement, avec un bouton pour activer
  les deux d'un coup.

## Les Sortilèges

- Chaque chapitre a son **catalogue de sorts**, avec un coût en gemmes et/ou en cœurs.
- Le lancement passe par un **assistant** : les joueurs de l'équipe (ou de toutes les
  équipes, selon le réglage) **contribuent** au pot commun du sort, chacun voyant son
  solde et ce qu'il lui restera. Quand le coût est réuni, le sort se lance — avec
  **l'approbation du MJ** si le réglage l'exige.
- Un même sort n'est débité **qu'une fois**, même si plusieurs personnes cliquent
  « lancer » au même instant : la seconde tentative reçoit un message « ce sortilège a
  déjà été lancé » et rien n'est prélevé une deuxième fois.
- **Chaque élève ne dépense que ses propres points, et pour sa propre équipe** (réglages
  par défaut). Le MJ et l'admin, eux, répartissent pour qui ils veulent. Les réglages
  « Coordinateur » et « Les deux », qui laissent un élève puiser dans les points d'un
  camarade, restent disponibles mais sont **désactivés par défaut** et signalés par un ⚠️
  dans les Réglages : c'est un choix à faire en conscience, pas un état de départ.
- On ne verse dans le pot que ce que le sort demande : sur un sort qui ne coûte que des
  cœurs, aucune gemme ne peut y partir (et réciproquement).
- Tant qu'un sort attend la validation du MJ, la même équipe ne peut pas en ouvrir un
  **second exemplaire** : cela évitait deux entrées jumelles dans la file du MJ — et deux
  débits s'il les acceptait toutes les deux.
- Avec le réglage « lancement réservé au MJ », les joueurs **voient toujours** le pot se
  remplir : c'est le lancement qui leur est fermé, pas la consultation.
- Par défaut, les joueurs peuvent lancer les sorts ; le profil de séance « MJ +
  tours » réserve le lancement au MJ.
- **Lancer un sort n'est pas lié au tour.** Même quand les tours sont activés, toutes les
  équipes peuvent lancer — le tour sert à cadencer les déplacements de mascotte et les dés
  (une fois par tour chacun), pas les sortilèges. Ce qui régule les sorts, c'est la
  validation du MJ.
- Le module Sortilèges est désactivé par défaut : c'est un choix d'activation
  conscient de l'admin.

### Ce que fait l'application quand le sort part — et ce qu'elle ne fait pas

C'est le point le plus souvent mal compris, alors disons-le net : **l'application encaisse
le coût du sort, elle n'en applique pas l'effet.**

Quand le pot est réuni et que le sort part, il se passe exactement trois choses :

1. les cœurs et les gemmes promis sont **retirés** aux joueurs qui ont contribué (et à eux
   seuls, chacun du montant qu'il a mis) ;
2. une **fenêtre de résultat** s'ouvre chez tout le monde dans la partie : le nom du sort,
   son coût, la liste de ceux qui l'ont lancé, et **le texte de sa fiche** (« effet court »
   et « effet détaillé ») ;
3. une ligne s'inscrit au **journal de partie** : « _L'équipe X lance ✨ Nom du sort._ » —
   ou « _Toute la partie lance…_ » quand c'est le MJ qui a ouvert un pot commun sur
   l'ensemble du plateau, puisque les contributeurs viennent alors de plusieurs équipes.

Puis l'application s'arrête là. Elle ne soigne personne, ne déplace aucune mascotte,
n'accorde aucun bonus, ne débloque aucun feuillet, ne décompte aucune durée. Les champs
**« portée »**, **« cible »**, **« timing »**, **« limite d'usage »** et **« cumul »** de la
fiche sont des **consignes écrites pour vous** : ils s'affichent au joueur, ils ne sont
jamais vérifiés par le logiciel.

**C'est donc le MJ qui applique l'effet**, à la table, avec les outils de la console :
raconter (narration), ajuster les cœurs et les gemmes d'un joueur ou d'une équipe, déplacer
une mascotte, accorder un score.

### La file « Sortilèges à appliquer »

Pour que rien ne se perde, la console du MJ tient la liste des sorts **payés dont l'effet
n'a pas encore été appliqué**. Chaque entrée rappelle ce qu'il y a à faire :

- le nom du sort, l'équipe (ou « toute la partie »), l'heure du lancement et ce qui a été payé ;
- le **texte de l'effet**, ainsi que portée, cible, moment et limite d'usage tels qu'ils sont
  écrits sur la fiche ;
- un bouton **« Raconter cet effet »** qui pré-remplit la narration — vous relisez, ajustez et
  envoyez : rien n'est écrit au journal à votre place ;
- un bouton **« Effet appliqué ✔ »** qui retire le sort de la liste et inscrit l'application au
  journal de partie.

Les outils d'ajustement (cœurs et gemmes, score) sont dans le même écran, juste en dessous.
Le logiciel ne calcule toujours rien : il vous rappelle quoi faire, et garde trace du moment
où vous l'avez fait.

> ⚠️ **Point d'attention** — Un sort dont l'effet n'est jamais coché reste dans la file : c'est
> voulu, c'est le signal. Si vous jugez qu'il n'y avait rien à appliquer, cochez quand même —
> la liste doit rester le reflet de ce qui reste à faire. Et rédigez l'« effet court » des
> fiches comme une **instruction exécutable** (« +2 ❤️ à l'équipe voisine ») plutôt que comme
> une formule d'ambiance : c'est ce texte que la file vous met sous les yeux.

> ⚠️ **Point d'attention** — « Une fois par partie » écrit dans **limite d'usage** n'est pas
> tenu par le logiciel : tant que les cœurs et les gemmes suivent, le sort peut repartir.
> C'est à vous de compter.

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
circuit de l'économie, qui relie la lecture du lore à la vitalité. Par défaut, une
équipe n'encaisse cette récompense **qu'une fois** par feuillet : deux élèves qui
découvrent le même feuillet au même instant ne doublent ni les cœurs ni la dépense
de gemmes.

## ⚠️ Points d'attention

> ⚠️ **Point d'attention** — Comme les jauges sont durables, une classe qui joue toute
> l'année accumule. Le **plafond de jeu** décrit plus haut est la réponse à ce problème ;
> tant qu'il vaut 0 (défaut), l'accumulation continue et il faut compter sur les
> **ajustements MJ** ou des coûts de sorts plus élevés. Un « plancher » configurable
> (empêcher un élève de descendre sous X cœurs via le marché ou un sort) est noté au
> registre comme évolution possible, à trancher après observation en classe.

> ⚠️ **Point d'attention — sortilèges à effet scolaire réel.** Cinq sortilèges ne
> produisent pas un effet de jeu mais un effet dans la scolarité de l'élève : **Esquive**
> (reporter un rendu), **Révélation** (le professeur donne la réponse), **Mentorat**
> (« vert + » à l'oral), **Annulation** (dispense d'une activité évaluée) et
> **Consécration** (« vert + » au bulletin). Ils exigent désormais tous une **validation
> du MJ** avant de partir : leur coût n'a pas changé, mais un élève ne peut plus se les
> offrir seul parce qu'il a réuni les gemmes. Les sortilèges purement fictionnels
> (déplacement, soin, narration) restent en lancement libre.

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
