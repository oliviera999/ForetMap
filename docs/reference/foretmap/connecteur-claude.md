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

## Ce que l'assistant peut faire (depuis le 5 novembre 2026)

Le connecteur permet de **tout faire** sur ForêtMap depuis l'assistant, comme dans le site :
lister et créer des tâches, les valider, les archiver, inscrire des élèves, gérer les projets,
les groupes, les tutoriels, les quiz, les fiches espèces, les cartes, les plans, les réglages
et les droits, et (administrateurs) piloter l'exploitation. Chaque action passe par **les
mêmes règles que le site** : valider une tâche détache ses lieux, fait avancer la progression
des élèves et le projet, prévient les personnes concernées.

Tout est **ouvert par défaut** et se règle dans l'administration (Réglages → Exploitation →
« Connecteur Claude », voir [activer-le-connecteur.md](activer-le-connecteur.md), partie B).

## Données des élèves

Les **administrateurs** peuvent, par défaut, lire et modifier les données nominatives des élèves
par l'assistant (identité, groupes, tâches, comptes rendus, réussite aux quiz…). **Chaque
lecture est notée au journal.** Les autres comptes ne voient que des **totaux**, et un total
inférieur à 5 s'affiche « <5 ». L'option « Données nominatives des élèves » permet de couper cet
accès.

Les **mots de passe, codes secrets et jetons** ne sont **jamais** transmis à l'assistant, quel
que soit le réglage.

## Qui peut l'utiliser

| Profil         | Lire                                        | Agir sur le site (tâches, projets, fiches…) | SQL, données d'élèves, exploitation |
| -------------- | ------------------------------------------- | ------------------------------------------- | ----------------------------------- |
| Admin          | ✅                                          | ✅                                          | ✅                                  |
| n3boss         | ✅                                          | ✅ avec ses droits dans le site             | —                                   |
| Prof de classe | sur demande (permission « Connecteur MCP ») | avec ses droits dans le site                | —                                   |
| Élève          | —                                           | —                                           | —                                   |

C'est la permission **« Connecteur MCP »** qui ouvre l'accès. Par l'assistant, chacun ne peut
faire **que ce qu'il peut déjà faire dans le site** : si le site refuse une action, l'assistant
reçoit le même refus. Un administrateur peut ajouter ou retirer la permission dans **Profils &
utilisateurs** ; un retrait prend effet **immédiatement**, même pour un assistant déjà connecté.

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

Pour les champs de texte (fiches espèces, glossaire, quiz, tutoriels, contenus de visite…), les
corrections s'appliquent **tout de suite** par défaut. Si l'option « Écritures par Claude » est
réglée sur « Plan à valider », elles se font **en deux temps** :

1. L'assistant **prépare** la correction et vous montre **avant / après** pour chaque champ, avec
   les risques éventuels (champ vidé, renommage…). **Rien n'est encore modifié.**
2. Vous donnez votre accord ; l'assistant **applique**. Si quelqu'un a modifié la même fiche
   entre les deux étapes, l'application est **refusée** et rien n'est écrit : il faut préparer
   une nouvelle correction.

Dans les deux cas, la bonne pratique « fichier de mise à jour pour le développeur » reste la
même.

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

- **Données des élèves.** L'accès nominatif des administrateurs est ouvert par défaut ; avant
  de s'en servir largement, voir la direction et le DPO (fiche de registre). Chaque lecture est
  tracée. Les **secrets** (mot de passe, double authentification, jetons) restent **interdits**.
- **Arrêter les modifications d'un geste** : bouton « Couper l'écriture » dans la section
  « Connecteur Claude » de l'administration.
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
`MCP_PUBLIC_BASE_URL` ; tous les autres réglages se font dans l'administration (clés `mcp.*`,
`docs/MCP.md` § 13) — une variable `MCP_…` posée sur le serveur les verrouille. Fiche registre RGPD : `docs/MCP_REGISTRE_TRAITEMENT.md`. Rapport de santé : crontab
(`docs/CRONTAB.md`, ligne 9).
