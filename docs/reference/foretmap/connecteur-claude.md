# Connecteur MCP : brancher un assistant sur le contenu du site

> **Public de ce document : administrateurs et n3boss.** Il décrit ce que l'application fait
> aujourd'hui, sans jargon technique. Retour au sommaire : [../README.md](../README.md)

## À quoi ça sert

Le **connecteur MCP** permet de relier un **assistant compatible** (Claude sur claude.ai /
bureau / mobile / Claude Code, **Cursor**, **ChatGPT**, **Gemini CLI**) au contenu
pédagogique du site. Une fois connecté, vous pouvez demander à l'assistant, en langage courant :

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

Les **administrateurs** peuvent en plus faire **corriger** du contenu via l'assistant (voir plus
bas) et lui faire **surveiller le site** (voir « Surveiller le site »).

## L'assistant se souvient de ce qui est stable

Le connecteur a une **mémoire** : l'assistant y retrouve, en début de conversation, les règles
et pièges connus du site (par exemple « dans les quiz, le commentaire de la bonne réponse reste
vide »), et y note ce qui restera vrai la prochaine fois. Une note **partagée** sert à tous les
comptes du connecteur ; une note **personnelle** n'est visible que de vous. Une note ancienne
est signalée « à revérifier ». Le site **refuse** une note qui contient une adresse e-mail ou
ressemble à un mot de passe ou à une clé. N'y mettez jamais d'information sur un élève.
Seul l'auteur d'une note partagée, ou un administrateur, peut la modifier ou l'effacer.

## Ce que l'assistant ne voit jamais

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

C'est la permission **« Connecteur MCP »** qui ouvre l'accès, et **« Écriture par le
connecteur MCP »** qui ouvre les corrections. Un administrateur peut les ajouter ou les
retirer dans **Profils & utilisateurs**. Un retrait prend effet **immédiatement**, même pour
un assistant déjà connecté.

Le connecteur doit d'abord être **activé sur le serveur** par la personne qui gère
l'hébergement. Checklist complète (serveur + tous les assistants) :
[activer-le-connecteur.md](activer-le-connecteur.md).

## Se connecter

1. Dans l'assistant : ajoutez un connecteur / serveur MCP avec l'adresse du site suivie de
   **`/mcp`** (par exemple `https://votre-site/mcp`). Chemins typiques :
   - **Claude** : Réglages → Connecteurs → Ajouter un connecteur personnalisé ;
   - **Cursor** : entrée `foretmap` dans les réglages MCP (variable `FORETMAP_MCP_URL`) ;
   - **ChatGPT** : ajout d'un serveur MCP personnalisé (selon le mode développeur du compte) ;
   - **Gemini CLI** : configuration `mcpServers` avec l'URL `/mcp`.
2. Lancez la connexion : une page du site s'ouvre. Saisissez votre **identifiant** et votre
   **mot de passe** habituels, puis votre **code de double authentification** si vous l'avez
   activée.
3. La page suivante résume la demande : l'application (nom de l'assistant), l'adresse où vous
   serez renvoyé, et ce qui est demandé (lecture, et corrections pour un admin). Cliquez sur
   **Autoriser**.

Si la page signale une **« adresse locale »**, c'est un outil sur votre ordinateur (Claude
Code, Cursor, Gemini CLI…) : n'autorisez que si vous venez de lancer la connexion vous-même.

Pour **déconnecter** : retirez le connecteur dans les réglages de l'assistant.

## Faire corriger du contenu (administrateurs)

Les corrections se font **toujours en deux temps** :

1. L'assistant **prépare** la correction et vous montre **avant / après** pour chaque champ, avec
   les risques éventuels (champ vidé, renommage…). **Rien n'est encore modifié.**
2. Vous donnez votre accord ; l'assistant **applique**. Si quelqu'un a modifié la même fiche
   entre les deux étapes, l'application est **refusée** et rien n'est écrit : il faut préparer
   une nouvelle correction.

Chaque correction appliquée est inscrite au **journal d'audit**.

Ce qui peut être corrigé : textes des fiches espèces (description, rôle, remarques, dangers,
sources), **crédits et licences des photos**, nom et description des zones et repères,
définitions des glossaires, textes et feedbacks des questions de quiz, niveau des questions du
jeu, et le **rattachement d'une espèce** à une zone, un repère, une carte ou un terme du
glossaire. Rien d'autre : ni comptes, ni réglages, ni suppression de fiches.

> **Bonne pratique.** Le contenu du site est aussi **décrit dans le code** (c'est ce qui
> permet de réinstaller le site à l'identique). Après une correction, l'assistant fournit un
> **fichier de mise à jour** à transmettre au développeur pour qu'il l'ajoute au code ; sans
> cela, une future mise à jour pourrait remettre l'ancienne version. Pour une correction qui
> peut attendre, on peut aussi ne demander **que** ce fichier, sans rien modifier sur le site.

## Surveiller le site (administrateurs)

- **Rapport de santé** : demandez « comment va le site ? ». L'assistant répond par un statut
  **vert**, **orange** ou **rouge** et la liste des alertes : base de données lente ou en
  retard de mise à jour, erreurs du serveur, redémarrages anormaux, sauvegarde ou tâche
  planifiée en retard, disque presque plein, certificat de sécurité bientôt expiré… Les seuils
  sont fixes et affichés avec le rapport.
- **Chaque jour**, une tâche planifiée refait ce rapport et l'enregistre ; un **e-mail** part à
  l'adresse d'exploitation quand le statut est orange ou rouge (ou chaque jour si l'hébergeur
  l'a réglé ainsi). L'assistant peut montrer l'**historique** (« depuis quand c'est orange ? »).
- **Journaux du serveur** : l'assistant peut lire, en lecture seule, les journaux des tâches
  planifiées, du démarrage et du serveur web, ainsi que les scripts et la documentation, et y
  chercher un message d'erreur. Les mots de passe, clés et jetons y sont **toujours masqués** ;
  du fichier de configuration du serveur, seuls les noms des réglages apparaissent.
- **Tâches planifiées** : l'assistant dit, pour chaque tâche (sauvegarde, déploiement, purge,
  tâches récurrentes…), quand elle a tourné pour la dernière fois et si elle est en retard.

Rien de tout cela ne modifie le site.

## ⚠️ Points d'attention

- La connexion par **Google** n'est pas proposée sur la page du connecteur : un compte qui se
  connecte uniquement par Google doit d'abord se créer un mot de passe sur le site.
- Il n'y a pas encore d'écran listant « les connecteurs ouverts sur mon compte » : on retire
  l'accès dans les réglages de l'assistant, ou un administrateur retire la permission.
- Les réponses restent celles d'un assistant : une revue du contenu signale des pistes, elle
  ne remplace pas la relecture d'un professeur.
- Ce que vous écrivez à l'assistant et les réponses du connecteur sont traités par le
  **fournisseur de cet assistant** (Anthropic, OpenAI, Google, Cursor… selon le client
  choisi). Fiche de registre : voir le DPO.
- **Gemini Enterprise** (offre professionnelle Google avec secret client) n'est **pas**
  supporté ; seul Gemini en ligne de commande sur un poste local l'est.

## Pour les curieux

Guide pas à pas : [activer-le-connecteur.md](activer-le-connecteur.md). Contrôle rapide :
`npm run mcp:activate-check -- --base https://votre-domaine`. Activation technique complète :
`docs/MCP.md` (« Activer en production »). Variables : `MCP_ENABLED=true`,
`MCP_PUBLIC_BASE_URL` ; corrections admin via `MCP_WRITE_ENABLED`. Fiche registre RGPD :
`docs/MCP_REGISTRE_TRAITEMENT.md`. Rapport de santé : crontab (`docs/CRONTAB.md`, ligne 9).
