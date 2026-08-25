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
- **Une question affichée = une réponse comptée.** Dès que l'équipe a répondu (juste ou
  faux), la question affichée est close : renvoyer la même réponse ne rapporte pas de
  points supplémentaires. Pour rejouer, il faut une nouvelle question — nouveau passage
  sur le repère, ou nouveau tirage.
- **Le score se compte par joueur, pas par équipe.** Chaque élève qui répond juste rapporte
  un point à son équipe : une équipe de cinq peut donc gagner jusqu'à cinq points sur la
  même question. C'est voulu — on veut que **chacun réponde**, et non qu'un seul réponde
  pour tout le groupe. Corollaire à garder en tête au moment de composer les équipes : une
  équipe nombreuse marque mécaniquement plus qu'une équipe réduite. Si les scores doivent
  être comparables, former des équipes de taille voisine.

## Le conditionnement par QCM (« marquer appris »)

La mécanique la plus pédagogique du jeu : exiger qu'un élève **réussisse une question**
avant de pouvoir marquer une ressource (espèce, terme du glossaire scientifique,
tutoriel, feuillet…) comme apprise.

- **Relier ressources et questions** : dans **Contenus → Conditionnement QCM**, on crée
  des liens « cette ressource ↔ cette question », avec un interrupteur « bloquant » par
  lien, un statut et des filtres pour s'y retrouver.
- **Régler le comportement global** : dans **Réglages plateforme → Conditionnement par
  QCM** (admin) — l'interrupteur général (tant qu'il est éteint, les liens sont sans
  effet), le **mode** (une réussite suffit / toutes les questions / un nombre minimum), le
  **nombre de réussites** du mode « minimum », la **granularité du suivi** (par joueur ou
  par équipe) et le **délai avant nouvelle tentative** après une erreur (3 jours par défaut).
- **Assouplir une ressource en particulier** : une ressource peut porter sa propre politique
  (son propre mode, ou une dispense complète), qui l'emporte sur le réglage général. Mais
  l'interrupteur général reste **maître** : éteint, rien n'est demandé nulle part.
- **Ce que vit l'élève** : au moment de marquer « appris », l'écran annonce combien de
  questions seront posées **et ce qu'une erreur coûterait** (« une erreur bloquera la
  validation pendant 3 jours ») ; il peut abandonner sans rien risquer. On ne lui pose que
  le nombre de questions réellement exigé par le mode : en mode « une réussite suffit », une
  seule question, même si la ressource en compte cinq. Bonne réponse → il peut confirmer ;
  mauvaise réponse → la ressource est verrouillée le temps du délai, puis il peut réessayer.
- **Les bonnes réponses comptent toujours**, même données avant l'activation du
  conditionnement et même ailleurs (sur le plateau, à l'entraînement) : allumer
  l'interrupteur ne fait pas repasser à l'élève une question qu'il a déjà réussie.
- **Un contenu désactivé n'est plus marquable** : un feuillet ou un terme retiré du jeu
  (statut « inactif ») ne peut plus être marqué appris ni importé dans le carnet.

## Le marquage « appris » et le carnet

Indépendamment du conditionnement, l'élève peut marquer les contenus comme appris/lus
(espèces, glossaire scientifique, tutoriels, écosystèmes, feuillets, pages) et
**importer ses acquis dans son carnet personnel** — le MJ suit tout cela dans les
statistiques (progression individuelle et de classe).

### Posséder un feuillet ≠ l'avoir étudié

Deux choses différentes, souvent confondues :

- **Posséder** un feuillet (le voir arriver dans le Carnet de Sélène) ne demande
  **aucune question sur ce feuillet**. Il arrive parce que l'équipe a traversé une zone,
  parce qu'un joueur a marqué « apprise » **une autre ressource** (une espèce, un terme de
  glossaire… — c'est le marquage qui déclenche, avec ou sans question), parce qu'il a été
  **offert à l'ouverture** de la partie, ou parce qu'un camarade l'a **échangé** au Marché.
- **Le marquer étudié** (et donc pouvoir l'importer dans son carnet personnel) passe,
  lui, par le conditionnement QCM du feuillet lui-même, comme n'importe quelle autre
  ressource — et n'est proposé que sur un feuillet déjà accessible en partie.

Autrement dit : le QCM ne garde pas la porte du feuillet, il garde la porte du
**carnet personnel**. Un feuillet peut donc être lu par toute l'équipe sans qu'aucun
élève n'ait répondu à une question à son sujet.

## ⚠️ Points d'attention

> ⚠️ **Point d'attention** — Le conditionnement est **inerte tant que l'interrupteur
> global est éteint**, même si des liens existent : l'écran des liens le rappelle en
> bandeau. C'est le premier réflexe si « le blocage ne marche pas ».

> ⚠️ **Point d'attention** — Le délai de nouvelle tentative s'applique à **toute la
> ressource** après une erreur : un élève verrouillé n'est pas un bug. Le délai se
> règle (jusqu'à l'annuler, à 0 jour).

> ⚠️ **Point d'attention** — Le **mode** choisi change beaucoup la charge de travail : sur une
> ressource reliée à huit questions, « toutes les questions » en demande huit, « une réussite
> suffit » une seule. Le mode par défaut est « une réussite suffit ».

> ⚠️ **Point d'attention** — Seuls les liens que **quelqu'un a cochés « bloquant »**
> conditionnent quoi que ce soit. Les liens créés automatiquement par les imports de QCM
> (qui repèrent les termes de glossaire cités par une question) sont **non bloquants** : ils
> documentent, ils ne barrent pas la route. Pour exiger une question, cochez sa case
> « bloquant » dans **Contenus → Conditionnement QCM**.

> ⚠️ **Point d'attention** — La **granularité « par équipe »** fait compter la bonne réponse
> d'un coéquipier pour tous ses camarades — y compris celle saisie par le MJ quand le réglage
> « QCM réservés au MJ » est actif. En « par joueur » (défaut), chacun répond pour lui : dans
> ce cas, le mode animation ne fait progresser personne côté conditionnement.

> ⚠️ **Point d'attention** — Un élève ne peut pas lire la bonne réponse par avance : elle
> ne quitte jamais le serveur avant d'avoir été trouvée — ni dans le QCM lui-même, ni par
> la liste publique des questions, qui ne livre le corrigé qu'aux enseignants gérant le
> catalogue. **Chaque présentation n'autorise qu'un essai** : renvoyer un autre choix sur
> la même question mélangée est refusé, il faut en relancer une (les choix sont alors
> remélangés). Et si le score d'équipe est
> activé, **une même réponse ne compte qu'une fois** : renvoyer plusieurs fois la sienne ne
> fait pas monter le score. À ne pas confondre avec la règle du point par joueur ci-dessus —
> les camarades, eux, marquent bien chacun le leur.

## Pour aller plus loin

[Présentation générale](presentation.md) · [Carte du royaume](carte-du-royaume.md) · [Guide du MJ](guide-du-mj.md) · [Sommaire](../README.md)
