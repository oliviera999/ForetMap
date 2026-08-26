# Quiz, glossaire, réseau trophique et carnet — ForetMap

> **Public de ce document : professeurs et administrateurs.**
> Il décrit ce que l'application fait aujourd'hui, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md)

## À quoi ça sert

Quatre modules pédagogiques complètent la carte et les tâches : le **Quiz** pour
vérifier les connaissances, le **Glossaire** pour le vocabulaire, le **Réseau
trophique** pour visualiser les relations entre espèces, et le **Carnet
d'observation** pour l'écriture naturaliste libre.

## Le Quiz

- **L'élève** répond à des questions à choix multiples depuis son onglet Quiz ; il voit
  immédiatement si sa réponse est juste et progresse à son rythme. **Chaque question
  présentée n'autorise qu'un essai** : un second choix sur la même présentation est
  refusé, il faut en relancer une (les propositions sont alors remélangées).
- **Le professeur** administre le catalogue de questions : création, édition,
  activation. Les questions peuvent être reliées aux termes du glossaire, ce qui aide
  l'élève à réviser le vocabulaire au passage.
- **La fiche question** se remplit champ par champ, chacun nommé en clair : énoncé,
  choix A à E, bonne réponse, et une explication propre à **chaque** choix possible
  (« Explication si l'élève choisit B »), plus l'explication affichée après une bonne
  réponse.
- **L'aperçu « Présenter »** montre la question telle que l'élève la verra —
  **illustration comprise**, avec sa légende et son crédit — et permet de répondre pour
  vérifier le retour pédagogique.
- **Légende de la photo** : elle est visible **du professeur seulement** (fiche et
  aperçu). Dans le catalogue livré, cette légende nomme le plus souvent le sujet
  photographié : l'afficher à l'élève donnerait la réponse. Ce qui accompagne l'image
  côté élève, c'est le **crédit et la licence**, affichés partout où la photo apparaît.
- **Le glossaire n'est pas consultable pendant la question.** Les termes reconnus dans
  l'énoncé et dans les propositions de réponse étaient cliquables : sur une question du
  type « Comment appelle-t-on le processus par lequel… ? », ouvrir le terme lié **donnait
  la réponse**. Ce qui devait aider à comprendre servait à deviner. Le texte reste affiché
  tel quel — on ne masque aucun mot —, mais rien ne s'ouvre tant que l'élève n'a pas
  répondu. La liste « Glossaire utile » suit la même règle, pour la même raison : elle
  désignait le sujet de la question aussi sûrement qu'un lien. **Après la réponse**,
  l'auto-liaison et la liste reviennent : c'est le moment où aller lire la définition est
  utile. La règle vaut aussi pour Gnomes & Licornes et pour l'aperçu du professeur, qui
  doit montrer ce que l'élève verra.
- **Ouvrir la question en fenêtre** : un bouton « ⤢ Ouvrir en fenêtre » affiche la
  question courante dans un petit panneau par-dessus la page, sans rien changer à
  l'affichage habituel. Utile pour se concentrer sur l'énoncé, et surtout côté professeur,
  où la question de test est noyée sous le catalogue et l'éditeur. C'est la même surface
  d'affichage et le même état : répondre dans la fenêtre ou dans la page revient au même.
- Les questions du Quiz servent aussi de **contrôle de compréhension** avant de valider
  un tutoriel ou une fiche espèce, si le dispositif est activé. L'écran « Rattacher des
  questions aux contenus », sous l'éditeur, relie les deux — à la main ou par
  rapprochement automatique des contenus : voir
  [Tâches, tutoriels et validation](taches-tutoriels-et-validation.md).

## Le Glossaire

- Le vocabulaire du jardin et des sciences du vivant, consultable par tous : chaque
  terme a sa définition, et peut être relié à des plantes du catalogue et à des
  questions de quiz.
- Le professeur enrichit le glossaire au fil de l'année.
- **L'onglet Glossaire est accessible aux professeurs comme aux élèves.** Il figurait
  jusqu'ici dans la seule barre élève : un professeur ne pouvait ouvrir le glossaire
  qu'en cliquant un terme dans un contenu, puis « Voir la fiche complète ». Sans terme
  sous la main, l'onglet restait hors d'atteinte.
- **« J'ai appris ce terme ».** La fiche d'un terme porte un bouton de validation, comme
  un tutoriel ou une fiche espèce. Le glossaire était jusqu'ici purement consultatif :
  rien ne distinguait un terme travaillé d'un terme jamais ouvert, et surtout, le contrôle
  de compréhension n'avait aucun geste auquel se rattacher — une question rattachée à un
  terme ne conditionnait rien du tout. Si le contrôle est actif et qu'une question
  bloquante est rattachée au terme, il faut la réussir avant de pouvoir valider. Dans la
  liste des termes, une **pastille d'état** dit où en est l'élève (✓ acquis, ? en attente,
  🔒 bloqué).
- **Fiche rapide en surimpression.** Partout où un terme du glossaire est cité et
  cliquable — dans un tutoriel ouvert en lecture, sur une fiche plante ou dans le réseau
  trophique — le clic ouvre une **petite fiche par-dessus l'écran en cours**. Une
  exception : pendant une question de quiz non encore répondue, les termes ne sont pas
  cliquables (voir plus haut). L'élève lit la définition, puis referme : il retrouve exactement sa page et sa
  position de lecture. Il ne quitte plus son tutoriel pour consulter un mot.
- La fiche rapide affiche la définition courte, la définition détaillée, l'exemple et
  l'étymologie, ainsi que les espèces et tutoriels rattachés au terme. Les **termes
  voisins** y sont proposés en pastilles : les enchaîner fait défiler les définitions
  dans la fiche, sans jamais la fermer.
- Un bouton **« Voir la fiche complète »** reste disponible pour basculer, cette fois
  volontairement, sur l'onglet Glossaire et y explorer le terme en grand.
- La fiche se ferme par la croix, par le bouton Fermer, par la touche Échap ou par un
  clic à côté.
- **La fiche rapide passe toujours devant ce qui l'a ouverte.** Ouverte depuis un quiz
  affiché en fenêtre, elle apparaissait derrière lui : la définition était demandée mais
  invisible, et il fallait refermer le quiz pour la lire. Symétriquement, la question de
  contrôle demandée depuis la fiche d'un terme (« j'ai appris ce terme ») s'affiche
  par-dessus cette fiche, qui reste ouverte derrière.
- Dans les tutoriels, les termes du glossaire sont désormais **repérables à l'œil** :
  ils apparaissent en vert, soulignés d'un pointillé. Ce marquage reste discret pour ne
  pas dénaturer la mise en page des fiches ; une fiche qui impose sa propre charte de
  liens garde la sienne.

## Le Réseau trophique

- Un **graphe interactif** des interactions entre les espèces du jardin : qui mange
  qui, qui aide qui (pollinisation, abri…). L'élève explore le graphe et découvre les
  chaînes alimentaires réelles de la forêt comestible.
- Le professeur (gestionnaire des plantes) crée et modifie les liens entre espèces —
  le graphe s'appuie sur le catalogue de biodiversité.

## Le Carnet d'observation

- **L'élève** tient un journal libre : une observation = un texte, une photo
  éventuelle, un lieu (zone) ou un groupe. C'est son espace d'écriture naturaliste,
  indépendant des tâches.
- **Le professeur** consulte les carnets de ses élèves (panneau dédié dans les
  statistiques) — la lecture du carnet d'un élève est réservée à son propriétaire et
  aux professeurs.
- Chaque action sur le carnet (écrire, supprimer) est faite au nom du compte connecté,
  vérifié par le serveur : un élève ne peut pas toucher au carnet d'un camarade.

## Les Tutoriels

Les fiches pratiques (arrosage, compostage…) sont décrites avec les tâches, car elles
y sont liées : voir [Tâches, tutoriels et validation](taches-tutoriels-et-validation.md).

## ⚠️ Points d'attention

> ⚠️ **Point d'attention** — Ces modules sont **activables/désactivables** dans les
> réglages (quiz, tutoriels, observations, forum…). Si un onglet manque chez un élève,
> vérifier d'abord les réglages des modules avant de chercher un problème.

> ⚠️ **Point d'attention** — La qualité du Réseau trophique dépend entièrement des
> liens saisis par le professeur : un graphe vide ou clairsemé n'est pas une panne,
> c'est un contenu à construire (idéalement avec les élèves).

## Pour aller plus loin

[Présentation générale](presentation.md) · [Plantes et biodiversité](plantes-et-biodiversite.md) · [Stats, forum et suivi](stats-forum-et-suivi.md) · [Sommaire](../README.md)
