# Gnomes & Licornes — Rôles et connexion

> **Public de ce document : professeurs, maîtres du jeu (MJ) et administrateurs.**
> Il décrit ce que le jeu fait aujourd'hui, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md) · Vue d'ensemble : [presentation.md](presentation.md)

## À quoi ça sert ?

Ce document explique **qui peut entrer dans Gnomes & Licornes, avec quels droits, et
comment** : les quatre rôles du jeu, l'écran de connexion unique, le mode découverte
pour les visiteurs, la gestion des mots de passe, la prise de main sur un compte
élève, et la liaison avec les comptes ForetMap.

## Qui l'utilise ? Les quatre rôles

| Rôle       | Qui c'est                                           | Ce qu'il peut faire                                                                                                                                        |
| ---------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Joueur** | Un élève, avec un compte créé par le staff          | Jouer : lire les contenus, proposer des actions, déplacer sa mascotte (selon le réglage), lancer des sorts, tenir son carnet personnel, échanger au marché |
| **Invité** | Un visiteur de passage, sans compte                 | Regarder seulement : découvrir le monde du jeu et les contenus « nature ». Aucune action, aucune modification                                              |
| **MJ**     | Un enseignant (compte enseignant ForetMap)          | Tout animer et tout éditer : parties, équipes, joueurs (création, import, mots de passe), contenus (chapitres, cartes, questions, feuillets…)              |
| **Admin**  | Un enseignant disposant des droits d'administration | Tout ce que fait le MJ, **plus** les réglages de la plateforme : modules, gameplay, marque, mode invité, liaison ForetMap, conditionnement par QCM         |

Comment on obtient le rôle MJ ou Admin :

- Un **administrateur ForetMap** qui se connecte à GL devient automatiquement
  **Admin GL** : son compte GL est créé et relié tout seul à la première connexion.
- Un **enseignant non administrateur** ne peut entrer comme **MJ** que si un compte
  MJ a déjà été préparé pour lui dans GL ; sinon la connexion staff lui est refusée
  avec un message explicite.

> ⚠️ **Point d'attention** — Il n'existe pas, aujourd'hui, d'écran dans GL pour
> **créer ou promouvoir un compte MJ** : un enseignant non administrateur ne devient
> MJ que si son compte a été préparé en dehors des écrans du jeu. Le circuit
> « comment nommer un nouveau MJ » mérite d'être outillé ou documenté.

**Retirer un rôle ou désactiver un compte prend effet tout de suite.** Rétrograder un
Admin en MJ, désactiver un joueur ou supprimer son compte s'applique **dès l'action
suivante** de la personne concernée — même si elle est déjà connectée : elle perd
aussitôt les droits retirés, ou se retrouve déconnectée si son compte n'est plus actif.
Le flux en direct de la partie est aussi coupé dès que la connexion se rétablit
(coupure réseau, onglet qui reprend) : on ne garde pas l'écoute d'une partie dont
on a été retiré. Il n'y a donc rien à attendre, et aucune manipulation
supplémentaire à faire pour « forcer » la déconnexion.

## Comment ça se passe

### Se connecter : un seul écran pour tout le monde

L'écran de connexion demande simplement un **identifiant (pseudo ou e-mail)** et un
**mot de passe** — il précise : « Ton profil (joueur, MJ ou admin) est déterminé
après connexion ». C'est le jeu qui reconnaît le type de compte :

1. il cherche d'abord un **joueur** portant ce pseudo ;
2. sinon (ou si le mot de passe ne correspond pas), il tente une connexion
   **enseignant** (MJ ou Admin, avec le compte ForetMap) ;
3. si rien ne correspond, le message d'erreur reste volontairement vague, sans
   révéler quel compte existe.

Trois façons d'entrer :

- **Pseudo + mot de passe** : la voie classique pour les joueurs comme pour le staff.
- **« Continuer avec Google »** : réservé aux adresses du lycée (domaines autorisés,
  configurables). Le jeu retrouve le compte joueur ou staff correspondant à l'adresse.
- **Un seul compte, un seul mot de passe** : depuis septembre 2026, chaque joueur a un
  compte ForetMap (créé automatiquement par le jeu, ou son vrai compte élève s'il en a
  un). C'est **ce compte qui porte le mot de passe** : le changer dans le jeu le change
  aussi pour ForetMap, et inversement. Le joueur peut d'ailleurs se connecter au jeu avec
  son pseudo de jeu, ou avec l'e-mail / le pseudo de son compte ForetMap, et se connecter à
  ForetMap avec son pseudo de jeu.

> ℹ️ **Transition** — un joueur créé avant cette unification, dont le compte ForetMap avait
> son propre mot de passe, peut encore utiliser son ancien mot de passe de jeu **une
> dernière fois** : il devient alors son mot de passe unique. Personne n'est bloqué.

- **Trop d'essais** : après cinq mots de passe faux sur le même identifiant, le compte est
  bloqué 30 secondes, puis de plus en plus longtemps (jusqu'à 15 minutes). Cela ne concerne
  que ce compte : les autres élèves de la classe ne sont pas gênés.

### Le mode invité (« Découvrir sans compte »)

Quand le **mode découverte est activé** (réglage de la plateforme, à la main de
l'Admin — il est activé par défaut), l'écran de connexion propose un bouton
« Découvrir sans compte ». L'invité navigue alors en lecture seule : plateau de
démonstration, contenus « nature », extraits du lore. Un bandeau « Mode découverte »
reste affiché, avec un bouton pour se connecter ou quitter. Dès qu'une action
demande un compte, le jeu la refuse poliment.

### Les mots de passe

- **Longueur minimale** : **4 caractères pour les joueurs** (relevable par un
  réglage), **8 caractères minimum pour le staff** (MJ et Admin) — et davantage si
  le réglage global est plus strict.
- **Mot de passe oublié** : depuis l'écran de connexion, on saisit son adresse
  e-mail et on reçoit un lien de réinitialisation valable une heure. La procédure
  fonctionne pour les joueurs (si leur compte a une adresse e-mail) comme pour le
  staff. La réponse à l'écran est toujours neutre, pour ne pas révéler quels comptes
  existent.
- **Réinitialisation par le MJ** : sur la fiche d'un joueur, une seule commande de
  **réinitialisation du mot de passe** permet d'en poser un nouveau (l'ancienne commande
  héritée du « PIN » a disparu ; tout parle désormais de « mot de passe »). Le joueur est
  **déconnecté partout** (jeu et ForetMap) : un mot de passe changé invalide les sessions
  ouvertes, ce qui permet de reprendre un compte compromis sans attendre.
- **Changement forcé à la prochaine connexion** : un joueur peut être marqué
  « doit changer son mot de passe ». À sa connexion suivante, une fenêtre bloquante
  l'oblige à en choisir un nouveau avant de pouvoir jouer. **Dès que le nouveau mot
  de passe est enregistré, il peut jouer tout de suite** — sans se déconnecter ni
  se reconnecter. Ce marquage se pose à la création d'un compte (coché par défaut
  quand aucun mot de passe n'est fourni) et automatiquement à l'import quand le mot
  de passe est généré.

> ⚠️ **Point d'attention** — Un joueur **sans adresse e-mail** ne peut pas utiliser
> « mot de passe oublié » : seul le staff peut alors le dépanner via « Reset mdp ».
> L'adresse est celle du compte ForetMap du joueur (modifiable par le staff sur sa fiche,
> ou par l'élève dans son profil).

Une **prise de contrôle** d'un compte joueur (« se connecter en tant que ») s'arrête
d'elle-même si le membre du staff qui l'a ouverte est désactivé, supprimé ou perd son
rôle : la session contrôlée est coupée dès l'action suivante, sans attendre l'expiration
de la connexion. Désactiver un compte staff suffit donc à reprendre la main.

> Par ailleurs, quand le MJ réinitialise un mot de passe, le joueur n'est **pas**
> obligé de le changer ensuite : si l'on veut un mot de passe « provisoire », il faut
> le savoir (le changement forcé n'est pas réarmé par la réinitialisation).

### Prendre la main sur un compte joueur (« Voir comme »)

Depuis la liste des joueurs, le staff peut cliquer **« Voir comme »** pour naviguer
temporairement **avec l'identité d'un élève** — utile pour le dépanner ou vérifier
exactement ce qu'il voit.

- Un **bandeau d'avertissement** s'affiche en permanence : « Prise de contrôle »,
  avec le pseudo de l'élève, le rappel que « les actions sont enregistrées pour ce
  compte », et un bouton « Revenir à mon compte ».
- L'opération est **tracée** : le début et la fin de chaque prise de main sont
  consignés dans les journaux d'audit et de sécurité (qui a pris quel compte, quand).
- Elle ne fonctionne **que vers des comptes joueurs** : impossible de prendre la
  main sur un autre MJ ou un Admin, et impossible d'enchaîner deux prises de main.

> ⚠️ **Point d'attention** — Pendant la prise de main, le staff agit **réellement**
> au nom de l'élève : ce qu'il fait (réponses, achats, articles…) est enregistré sur
> le compte du joueur. À réserver au dépannage, pas à la démonstration.

### L'aperçu « vue joueur » (sans changer de compte)

Différent de la prise de main : un bouton de la barre du haut permet au staff de
**basculer l'affichage en « vue joueur »** pour voir l'interface comme un élève
(sans les menus d'administration). Un bandeau le rappelle et précise que les droits
MJ/admin restent actifs — c'est un simple filtre d'affichage, rien n'est fait au nom
d'un élève. Un clic ramène à la vue normale.

### Rattacher son compte élève ForetMap (côté élève)

Chaque joueur possède déjà un compte ForetMap — celui que le jeu lui a créé. Mais un
élève inscrit **par lui-même** à ForetMap (ou importé par un professeur) peut vouloir
utiliser ce compte-là. Si l'Admin a activé la **liaison ForetMap** (réglage de
plateforme, désactivé par défaut), le joueur saisit l'identifiant et le mot de passe de
son compte élève dans son profil : le jeu vérifie, **bascule le joueur sur ce compte**
(c'est désormais son mot de passe qui vaut, pour le jeu comme pour ForetMap) et supprime le
compte créé par le jeu, devenu inutile. Un compte ForetMap ne peut être rattaché qu'à un
seul joueur.

Pour **détacher** son compte élève, le joueur redonne son mot de passe : le jeu lui recrée
un compte à lui, avec ce même mot de passe, et le compte élève reprend son indépendance.

> ℹ️ Le staff voit sur la fiche de chaque joueur s'il joue avec un **compte élève** (rattaché)
> ou avec le compte **miroir** créé par le jeu.

### Importer des joueurs en masse

Le staff peut créer les comptes d'une classe entière d'un coup : télécharger le
**gabarit** (tableur), le remplir (prénom, nom, pseudo, e-mail facultatif, nom de la
classe — qui doit déjà exister —, mot de passe facultatif), puis l'importer. Une
**analyse à blanc** permet de vérifier le fichier avant de créer quoi que ce soit ;
le rapport signale ligne par ligne les erreurs (pseudo déjà pris, classe inconnue…).
Les joueurs sont créés **sans équipe** (l'affectation se fait ensuite) et un compte
ForetMap correspondant est automatiquement préparé pour chacun.

- **Élève déjà inscrit à ForetMap** : si la ligne porte le même e-mail qu'un compte élève
  existant — ou le même pseudo **et** les mêmes prénom et nom —, le jeu **rattache ce
  compte** au lieu d'en créer un second. L'élève garde son mot de passe ForetMap ; le
  rapport le signale (« compte existant rapproché »).
- **Mots de passe** : après un import réel, le rapport affiche **une seule fois** la liste
  des identifiants créés (pseudo + mot de passe, fourni dans le fichier ou généré par le
  jeu), avec un bouton pour la copier ou la télécharger en tableur et la distribuer. Un mot
  de passe généré doit être changé par l'élève à sa première connexion. **Cette liste
  n'est plus jamais affichée ensuite** — noter les identifiants tout de suite ; sinon,
  « Reset mdp » sur la fiche du joueur.
- **Rentrée de plusieurs centaines d'élèves** : préférer des fichiers par classe (une
  centaine de lignes au plus), chacun précédé d'une analyse à blanc.

### Vérifier la cohérence des comptes (staff)

Un rapport de **réconciliation** (accessible au staff via l'API d'administration, et
lancé automatiquement au démarrage) recense les situations anormales : joueur sans compte
ForetMap, compte miroir dont le joueur a été supprimé, élève en doublon probable, reliquats
d'anciens mots de passe. Il peut aussi **réparer** ce qui ne demande pas de décision
humaine (recréer les liens et les appartenances aux groupes de classe), et, sur demande
explicite, supprimer les comptes miroirs orphelins.

### Supprimer un joueur ou un élève

- Supprimer un **joueur** dans le jeu supprime aussi le compte miroir que le jeu lui avait
  créé. Si le joueur jouait avec un **vrai compte élève** ForetMap, ce compte est conservé
  et simplement retiré du groupe de la classe.
- Supprimer un **élève** dans ForetMap supprime aussi son joueur. La suppression est
  refusée tant que le joueur est engagé dans une partie en cours (ou a contribué à un
  sortilège d'une partie terminée) : terminer ou supprimer la partie d'abord.
- **Désactiver un élève** dans ForetMap le coupe aussi du jeu, immédiatement. Désactiver un
  **joueur** dans le jeu ne touche pas à son compte ForetMap.

## Pour aller plus loin

- Vue d'ensemble du jeu : [presentation.md](presentation.md)
- Déroulement d'une partie : [chapitres-et-progression.md](chapitres-et-progression.md)
- Le plateau de jeu : [carte-du-royaume.md](carte-du-royaume.md)
