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
- **Compte ForetMap lié** : un joueur qui a relié son compte élève ForetMap peut
  aussi se connecter à GL avec le mot de passe de ce compte élève.

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
- **Réinitialisation par le MJ** : sur la fiche d'un joueur, une seule commande —
  « Reset mdp » — permet de poser un nouveau mot de passe (l'ancienne commande
  héritée du « PIN » a disparu ; tout parle désormais de « mot de passe »).
- **Changement forcé à la prochaine connexion** : un joueur peut être marqué
  « doit changer son mot de passe ». À sa connexion suivante, une fenêtre bloquante
  l'oblige à en choisir un nouveau avant de pouvoir jouer. Ce marquage se pose à la
  création d'un compte (coché par défaut quand aucun mot de passe n'est fourni) et
  automatiquement à l'import quand le mot de passe est généré.

> ⚠️ **Point d'attention** — Un joueur **sans adresse e-mail** ne peut pas utiliser
> « mot de passe oublié » : seul le staff peut alors le dépanner via « Reset mdp ».
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

### Relier son compte ForetMap (côté élève)

Si l'Admin a activé la **liaison ForetMap** (réglage de plateforme, désactivé par
défaut), un joueur peut relier son compte élève ForetMap : il saisit l'identifiant
et le mot de passe de ce compte, le jeu vérifie et mémorise le lien. Un compte
ForetMap ne peut être relié qu'à un seul joueur GL. Une fois relié, l'élève peut se
connecter à GL avec le mot de passe de son compte ForetMap (ou via Google avec son
adresse). Pour délier, il redonne son mot de passe GL.

### Importer des joueurs en masse

Le staff peut créer les comptes d'une classe entière d'un coup : télécharger le
**gabarit** (tableur), le remplir (prénom, nom, pseudo, e-mail facultatif, nom de la
classe — qui doit déjà exister —, mot de passe facultatif), puis l'importer. Une
**analyse à blanc** permet de vérifier le fichier avant de créer quoi que ce soit ;
le rapport signale ligne par ligne les erreurs (pseudo déjà pris, classe inconnue…).
Les joueurs sont créés **sans équipe** (l'affectation se fait ensuite) et un compte
ForetMap correspondant est automatiquement préparé pour chacun.

> ⚠️ **Point d'attention** — Si une ligne d'import ne fournit pas de mot de passe,
> le jeu en **génère un au hasard mais ne l'affiche nulle part** (ni dans le rapport
> d'import, ni dans l'export des joueurs). L'élève ne peut donc pas se connecter
> tant que le staff n'a pas fait « Reset mdp » (ou qu'il n'a pas utilisé « mot de
> passe oublié », s'il a une adresse e-mail). En pratique : **fournir les mots de
> passe dans le fichier**, ou prévoir une passe de réinitialisation après l'import.

## Pour aller plus loin

- Vue d'ensemble du jeu : [presentation.md](presentation.md)
- Déroulement d'une partie : [chapitres-et-progression.md](chapitres-et-progression.md)
- Le plateau de jeu : [carte-du-royaume.md](carte-du-royaume.md)
