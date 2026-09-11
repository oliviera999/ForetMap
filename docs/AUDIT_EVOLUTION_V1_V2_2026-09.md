# Audit d'évolution ForetMap — de la v1.0.0 à la v1.151.3, et la question de la V2

**Date :** 9 septembre 2026 · **Périmètre :** dépôt entier (ForetMap, G&L, Plan), historique
Git complet (2 702 commits, `58f2762f` → `4241b6cf`) · **Nature :** constat + arbitrage
proposé. **Aucun changement de comportement, aucune modification de code applicatif.**

> **Question posée :** au regard de l'évolution de l'application, peut-on poser une V2 ?
> **Réponse courte :** oui, la rupture de périmètre est réelle et le numéro `1.x` ment déjà —
> mais **pas dans l'état actuel du dépôt**, et pas comme un simple changement de numéro.
> Le détail est en §6, la recommandation en §7.

---

## 1. Méthode

Tout ce qui suit est mesuré sur le dépôt, pas estimé. L'historique était livré en clone
superficiel (147 commits depuis le 5 septembre) ; il a été déplié (`git fetch --unshallow`)
pour remonter au commit initial.

| Mesure              | Commande                                                         |
| ------------------- | ---------------------------------------------------------------- |
| État v1.0.0         | `git show 58f2762f:<fichier>`, `git ls-tree -r 58f2762f`         |
| Volumétrie actuelle | `git ls-files <motif> \| xargs wc -l`                            |
| Surface HTTP        | `grep -rhoE "router\.(get\|post\|put\|delete\|patch)\(" routes/` |
| Rythme              | `git log --format='%ad' --date=format:'%Y-%m' \| uniq -c`        |
| Ruptures déclarées  | `git log --format='%s' \| grep -E "BREAKING CHANGE\|!:"`         |
| Santé CI            | Runs GitHub Actions du 9 sept. 2026 (`ci.yml`)                   |

---

## 2. Le point de départ — v1.0.0, 18 mars 2026

Le commit initial `58f2762f` contient **six fichiers versionnés** :

```
.gitignore   database.js (180 l.)   package.json
server.js (514 l.)   public/index.html (2 549 l.)   public/map.png
```

- **3 243 lignes** de code applicatif au total.
- **5 dépendances** : `express@4`, `better-sqlite3`, `bcryptjs`, `cors`, `uuid`.
- **SQLite**, 9 tables (`zones`, `plants`, `tasks`, `task_assignments`, `task_logs`,
  `zone_photos`, `zone_history`, `map_markers`, `students`).
- **34 routes** déclarées directement dans `server.js`.
- Le front est **un seul fichier HTML de 2 549 lignes** servi en statique.
- **2 scripts npm** (`start`, `dev`). Aucun test, aucune CI, aucune migration, aucune doc.

C'était un prototype fonctionnel : carte, zones, tâches, inscription élève, validation prof.
Le périmètre tenait en une phrase, et c'est exactement celle qui est encore en tête du
`README.md` aujourd'hui.

---

## 3. Le point d'arrivée — v1.151.3, 9 septembre 2026

| Dimension                | v1.0.0                   | Aujourd'hui                                                         | Facteur |
| ------------------------ | ------------------------ | ------------------------------------------------------------------- | ------- |
| Fichiers versionnés      | 6                        | **3 669**                                                           | × 610   |
| Lignes ajoutées cumulées | —                        | **+614 234** (`git diff --shortstat` vs initial)                    | —       |
| Base de données          | SQLite, 9 tables         | **MySQL**, 68 tables ForetMap + 67 tables `gl_*`                    | × 15    |
| Migrations               | 0                        | **229** (idempotentes, garde anti-doublon en CI)                    | —       |
| Endpoints HTTP           | 34 (dans `server.js`)    | **628** dans **75 fichiers** de routes                              | × 18    |
| Front                    | 1 fichier HTML, 2 549 l. | **151 525 l.** (138 359 JS/JSX + 13 166 CSS)                        | × 59    |
| Composants / hooks       | 0                        | 156 composants ForetMap, 345 fichiers `src/gl`, 124 utils, 55 hooks | —       |
| Backend                  | 694 l.                   | **54 522 l.** (routes 33 638 + `lib/` 18 941 + socle 1 943)         | × 79    |
| Tests                    | 0                        | **144 014 l.** — 482 fichiers backend, 542 UI, 49 e2e               | —       |
| Dépendances              | 5                        | 21 runtime + 32 dev                                                 | × 10    |
| Scripts npm              | 2                        | **142**                                                             | × 71    |
| Documentation            | 0                        | **117 fichiers** dans `docs/` (dont 39 audits datés)                | —       |
| Produits servis          | 1                        | **3** (`foret`, `gl`, `plan`) — registre `lib/products.js`          | —       |
| CI                       | aucune                   | 5 workflows, 5 822 exécutions, 206 tags                             | —       |

**Rythme :** 2 702 commits en six mois, dont 940 sur le seul mois de juin.

| Mois    | 03/26 | 04/26 | 05/26 | 06/26   | 07/26 | 08/26 | 09/26 |
| ------- | ----- | ----- | ----- | ------- | ----- | ----- | ----- |
| Commits | 279   | 358   | 147   | **940** | 194   | 418   | 215   |

**Auteurs :** `oliviera999` 1 289 · `Claude` 1 112 · `github-actions[bot]` 80 ·
`Cursor Agent` 36 · `foretmap-bot` 18 · `dependabot` 16. Le dépôt est, de fait, un projet
co-écrit avec des agents — ce qui explique à la fois le rythme, la densité documentaire, et
certaines des fragilités relevées en §5.

---

## 4. Les six ruptures structurelles

L'évolution n'a pas été linéaire. Six moments changent la nature du logiciel, pas seulement
sa taille.

### R1 — SQLite → MySQL (19–20 mars 2026, ~48 h après le commit initial)

Motivé par l'hébergement o2switch (Passenger). Le premier correctif de production
(`fix: empêcher le crash Passenger — pool MySQL, uncaughtException`) date du 20 mars. Le
socle de persistance a changé avant même que le prototype ait vécu une semaine.

### R2 — Un fichier HTML → React + Vite (21 mars 2026, v1.4.0)

`feat(front): migration Vite — src/, dist en prod, hook temps réel`. Socket.IO arrive le
même jour. Le front cesse d'être un document et devient une application.

### R3 — PIN professeur → RBAC serveur (25–27 mars 2026, puis suppression définitive)

Le modèle d'autorisation initial (un PIN vérifié côté client) est remplacé par des rôles et
permissions fines relus en base à chaque requête. L'élévation par PIN est aujourd'hui
**supprimée**, avec trois endpoints conservés en `410 Gone` (`routes/auth.js:980`, `:1057`,
`:1063`). C'est une rupture de contrat au sens strict — voir §6.

### R4 — Monoproduit → monorepo bi-produit (19 mai 2026)

`feat(gl): ajouter les fondations bi-produit ForetMap/GL`. Routage par host, entrée Vite
`gl.html`, API `/api/gl/*`, isolement par claim JWT `product`. Puis un troisième produit
(`plan`) et un registre central (`lib/products.js`) en septembre.

**C'est la rupture la plus lourde, et la moins visible dans le numéro de version.**
Aujourd'hui, **327 des 628 endpoints (52 %)** et 345 fichiers `src/` appartiennent à
Gnomes & Licornes. Les cinq plus gros fichiers de routes du dépôt sont tous GL
(`gl/lore.js` 1 741 l., `gl/auth.js` 1 497 l., `gl/admin.js` 1 321 l.).

### R5 — Couche pédagogique transverse (juillet–août 2026)

Gating « lu/appris » conditionné par QCM, liens ressource ↔ question, feuillets, carnet
joueur, empreinte HMAC des réponses. ForetMap et GL cessent d'être deux applications
voisines : elles partagent un cœur pédagogique (`lib/shared/resourceQuestionGatingCore.js`).

### R6 — Identités unifiées + système d'information établissement (septembre 2026)

`feat(auth): identités unifiées ForetMap × G&L — users source unique des secrets`
(v1.147.0), puis l'intégration Moodle (20 modules sous `lib/moodle/`) et LTI 1.3. L'application
cesse d'être autonome : elle se branche sur l'annuaire du lycée.

---

## 5. Ce que le numéro `1.151.3` ne dit pas

C'est le constat le plus gênant de cet audit, et il est indépendant de la décision V2.

### 5.1 Aucune release n'a jamais été prononcée depuis le 20 mars

`CHANGELOG.md` fait 9 393 lignes. La dernière section **datée** est `[1.2.0] - 2026-03-20`.
Tout le reste — **9 312 lignes, 99 % du fichier** — est sous `[Non publié]`. Six mois de
travail, 2 400 commits et 149 incréments de version sont empilés dans une section qui, par
définition, décrit ce qui n'est pas encore sorti.

Il existe 206 tags Git (jusqu'à `v1.151.x`), créés automatiquement par `release-tag.yml`. Ils
marquent des fusions, pas des jalons. **Le versionnage fonctionne mécaniquement et ne
signifie plus rien éditorialement.**

### 5.2 Aucune rupture n'a jamais été déclarée — alors qu'il y en a eu

`git log | grep -E "BREAKING CHANGE|^[a-z]+(\(...\))?!:"` → **0 commit**.

Or le dépôt contient :

- trois endpoints `410 Gone` (élévation PIN supprimée) ;
- `migrations/166_drop_visit_v1_content.sql`, explicitement destructive (Visite V1 supprimée) ;
- `migrations/152_drop_dead_views.sql` (vues mortes) ;
- le changement de source de vérité des secrets de compte (R6).

Le workflow `version-bump.yml` sait détecter `BREAKING CHANGE` / `type!:` et bumper en
majeur (ligne 96). **Le mécanisme existe, personne ne l'a jamais utilisé.** Le `1.x` n'est
donc pas un choix conservateur : c'est un défaut de déclaration.

### 5.3 La CI est rouge sur `main`

Vérifié le 9 septembre 2026 : la PR **#442**, qui ne contient **que de la documentation**,
échoue en CI. Le test en cause est `tests/pedago-garden-auxiliaires.test.js:120` :

```
not ok 2097 - réseau GL : merle, mare et mycorhizes
  error: 'liaison GL manquante Hérisson commun → Escargot des bois'
```

Une PR qui ne touche aucun code applicatif ne peut pas casser un test de contenu :
**l'échec vient de `main`**. Les trois PR ouvertes (#439, #441, #442) sont rouges pour la
même raison.

Cause structurelle : le corpus pédagogique est semé par migrations et **asserté par les
tests**. Toute dérive de contenu (une espèce ajoutée sans sa liaison trophique) casse la CI
de l'ensemble des contributeurs, y compris ceux qui écrivent de la documentation. C'est un
couplage à revoir — les tests de contenu devraient être séparés des tests de code.

### 5.4 Constats P1 ouverts sur l'autorisation

L'audit du rôle professeur (PR #442, `AUDIT_ROLE_PROFESSEUR_2026-09.md`) relève deux P1 :

1. les révocations de permission sur les profils système sont **annulées au redémarrage**
   (`ensureDefaultRolesAndPermissions` réinsère la matrice en `INSERT IGNORE`) ;
2. le front lit les permissions dans le JWT et **ne les rafraîchit jamais**.

Le serveur applique la bonne règle dans les deux cas — ce ne sont pas des failles — mais
l'outil d'administration des droits ment à son utilisateur. Sur une application qui gère des
comptes élèves, c'est un défaut de confiance à traiter avant tout jalon nommé.

### 5.5 Autres tensions relevées, sans gravité immédiate

- **`dist/` est versionné** : 337 fichiers, 32 Mo, et un workflow dédié
  (`frontend-dist.yml`). Le dépôt `.git` pèse **210 Mo**. C'est un choix assumé (hébergement
  sans étape de build), mais son coût croît à chaque build.
- **Un workflow `auto-resolve-conflicts.yml` tourne à l'horaire.** Un dépôt qui a besoin
  d'automatiser la résolution de ses propres conflits signale que la parallélisation des
  branches est arrivée à sa limite — cohérent avec la règle anti-conflit de `CLAUDE.md` et
  la garde anti-doublon de migrations.
- **Rapport test/code ≈ 0,70** (144 014 l. de tests pour 206 047 l. applicatives). Le volume
  est sain ; c'est la **fiabilité** qui coûte — les messages de commit récents documentent
  plusieurs corrections de tests UI instables sous charge CI (`findByLabelText` au lieu de
  requêtes synchrones, attente d'options avant sélection).
- **Le `README.md` décrit encore la v1.0.** « Application de gestion de la forêt comestible »
  ne mentionne ni G&L, ni Plan, ni Moodle, ni les trois produits.

---

## 6. Poser une V2 : le pour et le contre

### 6.1 Les arguments **pour**

**P1 — SemVer est déjà violé, et une V2 régularise.**
Trois endpoints en `410`, une migration destructive, un changement de source de vérité des
secrets. Chacun aurait justifié un majeur. Passer en `2.0.0` en déclarant rétroactivement ces
ruptures rend le numéro honnête, et le workflow sait déjà le faire.

**P2 — Ce n'est plus la même application.**
Une application de gestion de forêt comestible est devenue une **plateforme pédagogique
multi-produits adossée au SI de l'établissement**. Un utilisateur de mars 2026 ne
reconnaîtrait ni le modèle d'autorisation, ni l'entrée, ni la moitié du périmètre. Le majeur
sert précisément à dire « le contrat a changé ».

**P3 — Un jalon de rentrée a une valeur d'usage.**
Le dépôt contient `docs/ROLLOUT_PASSATION.md` et `docs/reference/foretmap/rentree-moodle.md`.
Une V2 nommée donne un point d'appui pour la formation des profs, la documentation de
référence et la passation — bien plus qu'un `v1.151.3` illisible.

**P4 — Cela force enfin la clôture du CHANGELOG.**
9 312 lignes sous `[Non publié]` sont ingérables : personne ne peut répondre à « qu'est-ce qui
a changé depuis la rentrée ? ». Une release datée pose une coupe. C'est le bénéfice le plus
concret et le plus immédiat.

**P5 — Le coût technique est quasi nul.**
`npm run bump:major` existe, le workflow le respecte, `release-tag.yml` fait le reste.

### 6.2 Les arguments **contre**

**C1 — SemVer s'adresse à des tiers qui n'existent pas ici.**
Un majeur prévient des consommateurs d'API qu'ils doivent adapter leur code. ForetMap a **un**
déploiement, **un** front qui est livré avec le serveur, et aucun client externe. Techniquement,
`2.0.0` n'informe personne. C'est un acte de communication interne — légitime, mais qu'il faut
nommer comme tel plutôt que de le déguiser en rigueur SemVer.

**C2 — Le dépôt n'est pas en état d'être releasé.**
CI rouge sur `main` (§5.3). Deux P1 ouverts sur l'autorisation (§5.4). Le chantier Moodle est
explicitement marqué « ouvert, M4 terrain » dans l'index des audits. Les constats de charge
biodiversité sont « encore signalés ouverts ». **Graver un jalon sur un socle non vérifié,
c'est le rendre faux le jour où on le pose** — et un tag `v2.0.0` rouge est pire qu'une absence
de tag.

**C3 — Le numéro n'est pas le problème ; le rituel l'est.**
Ce qui a échoué en six mois, ce n'est pas le choix du chiffre, c'est l'absence de moment où
quelqu'un décide « ceci est sorti ». Passer à `2.0.0` sans changer ce rituel produira
`2.151.3` en mars 2027, avec le même `[Non publié]` de 9 000 lignes. **Une V2 qui ne change
que le premier chiffre soigne le symptôme.**

**C4 — Une V2 crée une attente côté utilisateurs.**
Les professeurs entendront « nouvelle version » et chercheront ce qui change **pour eux**.
Or la nouveauté visible de septembre — comptes unifiés, connexion Moodle — n'est pas
terminée. Annoncer un jalon en avance de phase déçoit, et la déception coûte plus cher que
l'attente.

**C5 — Le coût réel n'est pas dans le bump, il est dans la doc.**
117 fichiers de documentation, une référence fonctionnelle destinée aux admins/profs/MJ, un
README obsolète. Une V2 crédible suppose de reprendre au moins le README, `EVOLUTION.md`
(dont la section « État actuel » est encore datée 2026-04) et l'index de référence. C'est
un lot de travail, pas une commande.

---

## 7. Analyse franche et recommandation

**Le fond de la question est mal posé.** « Peut-on passer en V2 ? » suggère un arbitrage de
numérotation. Le vrai constat de cet audit est ailleurs : **le projet a perdu la notion de
release**. Il a un versionnage automatique irréprochable, 206 tags, une CI à cinq workflows —
et aucun moment, en six mois, où quelqu'un a écrit « voilà ce qui est sorti, à cette date, et
c'est vérifié ». Le `1.x` n'est pas trop bas : il est vide.

Dit franchement : **poser une V2 aujourd'hui serait un pansement décoratif sur une CI rouge.**
Et ne rien faire serait pire, parce que le `[Non publié]` continuera de grossir jusqu'à ce
que plus personne ne puisse répondre à la question la plus banale que pose un collègue en
salle des profs : « c'est quoi la différence avec la semaine dernière ? »

**Donc : oui à la V2, mais comme aboutissement d'une séquence, pas comme point de départ.**
Trois étapes, dans cet ordre.

### Étape A — Remettre `main` au vert (bloquant, quelques heures)

Rien ne se décide tant que la CI est rouge. Deux gestes :

1. corriger la liaison trophique manquante (`Hérisson commun → Escargot des bois`) qui fait
   échouer `tests/pedago-garden-auxiliaires.test.js` ;
2. **découpler les tests de contenu des tests de code** — un job (ou au minimum un fichier)
   séparé, pour qu'une dérive du corpus pédagogique n'empêche plus de fusionner une PR de
   documentation. C'est le correctif structurel ; le point 1 seul se reproduira.

### Étape B — Clôturer la 1.x (le geste à plus forte valeur, indépendant de la V2)

Prononcer une release **`1.152.0` — « clôture du cycle 1.x »** :

- renommer `[Non publié]` en `[1.152.0] - 2026-09-XX` ;
- réorganiser ces 9 312 lignes en sections thématiques (ForetMap / G&L / Plan / Pédagogie /
  Comptes & Moodle / Infrastructure) — c'est le seul travail réellement long, ~1 journée ;
- tag, release GitHub, et `[Non publié]` repart vide.

**Cette étape a de la valeur même si la V2 est refusée.** Elle est la condition d'une V2
lisible : on ne peut pas annoncer une V2 dont le contenu est un mur de 9 000 lignes.

### Étape C — Poser la V2 quand les critères sont tenus

Critères de sortie, à vérifier avant le bump — pas après :

| Critère                                                                                  | État au 9 sept.        |
| ---------------------------------------------------------------------------------------- | ---------------------- |
| CI verte sur `main` cinq jours consécutifs                                               | ❌ rouge               |
| Les deux P1 du rôle professeur corrigés (révocation RBAC, rafraîchissement front)        | ❌ ouverts             |
| Chantier Moodle : soit opérationnel en établissement, soit **hors périmètre V2** déclaré | ⚠️ ouvert (M4 terrain) |
| CHANGELOG clôturé (étape B)                                                              | ❌                     |
| `README.md` et `EVOLUTION.md` §1 remis à jour (3 produits, Moodle, RBAC)                 | ❌ datés               |
| Doc de référence relue pour les changements visibles utilisateur                         | à vérifier             |

Le bump se fait alors par un commit `feat!:` qui **déclare les ruptures rétroactivement** —
suppression de l'élévation PIN, suppression de Visite V1, unification des identités — de sorte
que `version-bump.yml` produise `2.0.0` de lui-même. Le `CHANGELOG` de la V2 s'ouvre sur une
section « Ruptures » qui les nomme.

### Ce qui n'est pas une raison de passer en V2

Pour être complet, et parce que c'est l'argument spontané : **« le projet a énormément
grossi » n'est pas un critère SemVer.** × 610 en fichiers et × 18 en endpoints décrivent une
croissance, pas une rupture. Ce qui justifie le majeur, ce sont les quatre ruptures de
contrat listées en §5.2 — pas les 614 234 lignes.

### Un arbitrage à poser séparément (hors V2)

**G&L représente 52 % de la surface HTTP du dépôt.** Ce n'est plus un « sous-produit » : c'est
un colocataire majoritaire dans un monorepo dont le nom, le README et la mission affichée
sont ceux de ForetMap. La question n'est pas urgente et n'a pas à être tranchée dans le cadre
d'une V2 — mais elle mérite d'être posée explicitement plutôt que subie : **ForetMap
héberge-t-il G&L, ou existe-t-il désormais une plateforme dont ForetMap et G&L sont deux
produits ?** La réponse change le nom du dépôt, la structure de la documentation, et la façon
dont on présente le tout à l'établissement. `AUDIT_CONVERGENCE_APPS_2026-09.md` a commencé ce
travail côté technique ; l'arbitrage éditorial reste à faire.

---

## 8. Synthèse en trois lignes

1. **Ce qui a été accompli en six mois est considérable** — d'un prototype SQLite de 3 243
   lignes à une plateforme multi-produits de 206 000 lignes applicatives, 144 000 lignes de
   tests et 229 migrations, sans jamais casser la production.
2. **Le versionnage, lui, n'a pas suivi** : zéro release prononcée depuis le 20 mars, zéro
   rupture déclarée alors qu'il y en a eu quatre, 99 % du CHANGELOG en `[Non publié]`.
3. **La V2 est justifiée sur le fond et prématurée sur la forme** : remettre `main` au vert,
   clôturer la 1.x, puis poser `2.0.0` comme jalon de rentrée avec ses ruptures déclarées.
