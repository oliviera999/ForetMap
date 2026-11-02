# Connecteur Claude : brancher l'assistant sur le contenu du site

> **Public de ce document : administrateurs et n3boss.** Il décrit ce que l'application fait
> aujourd'hui, sans jargon technique. Retour au sommaire : [../README.md](../README.md)

## À quoi ça sert

Le **connecteur Claude** permet de relier l'assistant **Claude** (site claude.ai, application
de bureau ou mobile, Claude Code) au contenu pédagogique du site. Une fois connecté, vous
pouvez demander à Claude, en langage courant :

- de **chercher** une espèce, un terme du glossaire, un tutoriel, une question de quiz, une
  zone ou un repère ;
- d'**ouvrir une fiche complète** (espèce, carte, clé de détermination, réseau trophique,
  question de quiz, plateau et récit de Gnomes & Licornes) ;
- de **passer le contenu en revue** : photos sans crédit, clés de détermination incomplètes,
  termes de glossaire jamais employés, définitions différentes entre le site et le jeu,
  questions de quiz incomplètes, niveaux du jeu qui ne correspondent pas à la 6ᵉ, doublons
  d'espèces, zones vides… ;
- d'obtenir une **vue d'usage anonyme** (combien de réponses aux quiz, d'observations, de
  lectures de tutoriels — jamais par élève).

Les **administrateurs** peuvent en plus faire **corriger** du contenu par Claude (voir plus bas).

## Ce que Claude ne voit jamais

Le connecteur ne donne accès **à aucune donnée personnelle** : ni comptes, ni noms d'élèves,
ni adresses, ni classes, ni messages du forum, ni commentaires, ni carnets, ni journaux de
connexion. Les chiffres d'usage sont des **totaux**, et un total inférieur à 5 s'affiche
« <5 » pour qu'on ne puisse pas reconnaître un élève. Une adresse e-mail glissée par erreur
dans un crédit photo est masquée.

## Qui peut l'utiliser

| Profil                | Lecture et revue du contenu | Corrections de contenu |
| --------------------- | --------------------------- | ---------------------- |
| Admin                 | ✅                          | ✅                     |
| n3boss                | ✅                          | —                      |
| Prof de classe, élève | —                           | —                      |

C'est la permission **« Connecteur Claude (MCP) »** qui ouvre l'accès, et **« Écriture par le
connecteur MCP »** qui ouvre les corrections. Un administrateur peut les ajouter ou les
retirer dans **Profils & utilisateurs**. Un retrait prend effet **immédiatement**, même pour
un Claude déjà connecté.

Le connecteur doit d'abord être **activé sur le serveur** par la personne qui gère
l'hébergement (voir « Pour les curieux »).

## Se connecter

1. Dans Claude : **Réglages → Connecteurs → Ajouter un connecteur personnalisé**, puis
   l'adresse du site suivie de **`/mcp`** (par exemple `https://votre-site/mcp`).
2. Cliquez sur **Connecter** : une page du site s'ouvre. Saisissez votre **identifiant** et
   votre **mot de passe** habituels, puis votre **code de double authentification** si vous
   l'avez activée.
3. La page suivante résume la demande : l'application (Claude), l'adresse où vous serez
   renvoyé, et ce qui est demandé (lecture, et corrections pour un admin). Cliquez sur
   **Autoriser**.

Si la page signale une **« adresse locale »**, c'est Claude Code sur votre ordinateur :
n'autorisez que si vous venez de lancer la connexion vous-même.

Pour **déconnecter** Claude : retirez le connecteur dans les réglages de Claude.

## Faire corriger du contenu (administrateurs)

Les corrections se font **toujours en deux temps** :

1. Claude **prépare** la correction et vous montre **avant / après** pour chaque champ, avec
   les risques éventuels (champ vidé, renommage…). **Rien n'est encore modifié.**
2. Vous donnez votre accord ; Claude **applique**. Si quelqu'un a modifié la même fiche entre
   les deux étapes, l'application est **refusée** et rien n'est écrit : il faut préparer une
   nouvelle correction.

Chaque correction appliquée est inscrite au **journal d'audit**.

Ce qui peut être corrigé : textes des fiches espèces (description, rôle, remarques, dangers,
sources), **crédits et licences des photos**, nom et description des zones et repères,
définitions des glossaires, textes et feedbacks des questions de quiz, niveau des questions du
jeu, et le **rattachement d'une espèce** à une zone, un repère, une carte ou un terme du
glossaire. Rien d'autre : ni comptes, ni réglages, ni suppression de fiches.

> **Bonne pratique.** Le contenu du site est aussi **décrit dans le code** (c'est ce qui
> permet de réinstaller le site à l'identique). Après une correction, Claude fournit un
> **fichier de mise à jour** à transmettre au développeur pour qu'il l'ajoute au code ; sans
> cela, une future mise à jour pourrait remettre l'ancienne version. Pour une correction qui
> peut attendre, on peut aussi ne demander **que** ce fichier, sans rien modifier sur le site.

## ⚠️ Points d'attention

- La connexion par **Google** n'est pas proposée sur la page du connecteur : un compte qui se
  connecte uniquement par Google doit d'abord se créer un mot de passe sur le site.
- Il n'y a pas encore d'écran listant « les connecteurs ouverts sur mon compte » : on retire
  l'accès dans Claude, ou un administrateur retire la permission.
- Les réponses de Claude restent celles d'un assistant : une revue du contenu signale des
  pistes, elle ne remplace pas la relecture d'un professeur.
- Ce que vous écrivez à Claude et les réponses du connecteur sont traités par **Anthropic**
  selon les conditions de votre compte Claude (fiche de registre : voir le DPO).

## Pour les curieux

L'activation se fait par la variable `MCP_ENABLED=true` et l'adresse publique
`MCP_PUBLIC_BASE_URL` ; les corrections sont actives par défaut pour les admins
(`MCP_WRITE_ENABLED`, à `false` pour les couper). Documentation technique : `docs/MCP.md` ;
fiche de registre RGPD : `docs/MCP_REGISTRE_TRAITEMENT.md`.
