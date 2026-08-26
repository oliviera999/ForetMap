# Audit général ForetMap — 2026-08-26

> **Statut : à traiter.** Audit transversal du monorepo réalisé après la fusion des quatre
> dernières PR ouvertes (#362, #366, #369, #370), sur `main` @ `4dcbb815`, version **1.134.0**.
> Contrairement aux audits précédents, celui-ci a été mené **avec une base MariaDB réelle** :
> les suites backend, UI et le build ont été exécutés, et les constats de sécurité marqués
> « reproduit » l'ont été contre un serveur en fonctionnement (`NODE_ENV=production`).
>
> Successeur de [`AUDIT_GENERAL_2026-08.md`](AUDIT_GENERAL_2026-08.md) (23/08, v1.110.0) —
> voir §8 pour ce que celui-ci avait signalé et qui est aujourd'hui fermé.

---

## 1. Résumé exécutif

L'état du dépôt est **sain**. Les trois portes de qualité passent sur `main` fusionné :

| Contrôle                                  | Résultat                               |
| ----------------------------------------- | -------------------------------------- |
| `npm test` (backend, base MariaDB réelle) | **2631 / 2633**, 0 échec, 2 ignorés    |
| `npm run test:ui` (Vitest)                | **3123 / 3123**, 455 fichiers          |
| `npm run lint`                            | **0 erreur** (522 avertissements)      |
| `npm run format:check`                    | conforme                               |
| `npm run build` puis `git status`         | **aucune dérive** — `dist/` = sources  |
| `npm run db:init` sur base vierge         | schéma en version **202**, sans erreur |

Aucune injection SQL exploitable, aucun path traversal, aucune route d'administration ouverte.
Le SQL est systématiquement paramétré ; les seules interpolations de chaînes portent sur des
`LIMIT`/`OFFSET` issus de schémas Zod ou de constantes, et sur des listes de `?` construites
par le code.

**Trois constats méritent une correction rapide**, tous petits en volume :

1. **Les photos de tâches sont servies sans aucune authentification** — et la liste publique
   des tâches fournit les identifiants nécessaires. _Reproduit._
2. **Une URL `/api/…` inconnue renvoie `200 text/html`** (l'index de la SPA) au lieu d'un
   `404` JSON. _Reproduit._
3. **Huit vulnérabilités npm en dépendances de production**, dont quatre de gravité _high_,
   deux corrigeables sans changement cassant.

S'y ajoute un défaut de chaîne de publication qu'aucune suite de tests ne pouvait voir :
**le workflow « Release tag » n'a jamais publié une seule release** — 134 tags, zéro release,
rouge à chaque push sur `main`. Une interpolation `${{ … }}` du CHANGELOG dans un script
shell fait relire les notes de version comme du code (§4.4). Correctif : trois lignes.

Le reste relève de la **dette de process** — et c'est là que se trouve le vrai coût récurrent :
`dist/` est versionné, ce qui a produit **64 conflits sur la seule PR #366**, tous dans des
fichiers générés.

| Domaine                      | Critique | Majeur | Mineur | Info |
| ---------------------------- | :------: | :----: | :----: | :--: |
| Sécurité & exposition        |    0     |   3    |   3    |  2   |
| Base de données & migrations |    0     |   1    |   2    |  2   |
| Process, Git & CI            |    0     |   3    |   3    |  1   |
| Exploitation & performance   |    0     |   2    |   2    |  1   |
| Architecture & dette de code |    0     |   1    |   3    |  2   |

---

## 2. Sécurité & exposition

### 2.1 — MAJEUR · Les photos de tâches sont accessibles sans authentification

`routes/tasks/media.js:8` monte `GET /api/tasks/:id/image` **sans aucune garde** : ni
`requireAuth`, ni vérification de portée. Le routeur parent n'en pose pas non plus
(`server.js:398` → `app.use('/api/tasks', tasksRouter)`).

L'asymétrie est frappante avec la route homologue : `routes/observations.js:164` protège
l'image d'une observation par `requireAuth` **et** un contrôle de propriété
(`isOwner`/`observations.read.all`). La même donnée — une photo prise par un élève —
est donc protégée d'un côté et publique de l'autre.

**Le chaînage qui rend l'exposition directement exploitable :** `GET /api/tasks` est
volontairement public (`parseOptionalAuth`) et retourne **`id` et `image_url` pour toutes
les tâches**. Un visiteur anonyme n'a donc rien à deviner — l'UUID n'est pas un secret,
il est publié. Mesuré sur la base de test : 245 tâches listées, dont 2 avec une image.

> **Reproduit** contre un serveur en `NODE_ENV=production`, sans en-tête `Authorization` :
> une valeur témoin déposée dans `uploads/tasks/` puis référencée par `tasks.image_path`
> est renvoyée en `200` avec son contenu. Trace nettoyée après vérification.

**Correctif proposé** — aligner sur `observations.js` : `requireAuth` plus un contrôle de
portée (créateur, assigné, ou permission `tasks.manage`). Si l'exposition publique est un
choix produit assumé pour l'onglet Visite, alors c'est `image_url` qui doit disparaître de
la réponse anonyme de `GET /api/tasks` — pas la garde qui doit rester absente.

### 2.2 — MAJEUR · Une route `/api` inconnue renvoie `200 text/html`

`lib/spaFallback.js:47-52` enregistre le fallback SPA sur `/{*splat}` **sans exclure
`/api`**. Conséquence mesurée :

| Requête                  | Attendu                | Obtenu              |
| ------------------------ | ---------------------- | ------------------- |
| `GET /api/nimporte-quoi` | `404 application/json` | **`200 text/html`** |
| `GET /api/students`      | `404` (route absente)  | **`200 text/html`** |
| `GET /api/stats`         | `404` (route absente)  | **`200 text/html`** |

Trois dégâts, par ordre de gravité :

- **Un client qui appelle un endpoint supprimé ou mal orthographié reçoit un succès.**
  `res.json()` échoue ensuite sur `<!doctype html>` avec un message qui ne désigne pas la
  cause — le symptôme est à des lieues du défaut.
- **La supervision ne peut pas distinguer « endpoint disparu » de « tout va bien »** : les
  deux sont des `200`. Une route perdue au fil d'un refactor passe inaperçue.
- **Cela fausse un audit** : ce rapport a d'abord relevé `/api/students` et `/api/stats`
  comme « listes exposées sans authentification » avant que le `Content-Type` ne montre
  qu'il s'agissait de l'index HTML. Le même piège attend toute personne qui sondera l'API.

**Correctif proposé** — dans `registerSpaFallbackRoutes`, laisser passer au gestionnaire
d'erreurs 404 tout chemin commençant par `/api` :

```js
app.use('/api', (req, res) => res.status(404).json({ error: 'Route introuvable' }));
```

monté **juste avant** le fallback SPA. Le gestionnaire d'erreurs central de `server.js:479`
sait déjà répondre en JSON sur `/api` : c'est le même principe, appliqué au 404. Un test
`tests/spa-fallback.test.js` existe déjà et accueillerait le cas.

### 2.3 — MAJEUR · Huit vulnérabilités npm en production

`npm audit --omit=dev` sur `main` @ 1.134.0 :

| Gravité  | Paquet             | Nature                                                           |
| -------- | ------------------ | ---------------------------------------------------------------- |
| **high** | `engine.io`        | épuisement de connexions (transport polling Socket.IO)           |
| **high** | `socket.io-parser` | épuisement mémoire par trames sans pièce jointe                  |
| **high** | `brace-expansion`  | DoS par expansion exponentielle                                  |
| **high** | `ip-address`       | octets à zéro non significatif décodés en décimal                |
| moderate | `qs`               | DoS déclenchable à distance sur `qs.stringify`                   |
| moderate | `uuid` / `exceljs` | contrôle de bornes manquant (v3/v5/v6)                           |
| low      | `body-parser`      | `limit` invalide désactive silencieusement le contrôle de taille |

Les deux `high` Socket.IO **sont directement pertinents** : ce sont exactement des défauts
d'épuisement de ressources, sur le composant temps réel, dans un contexte d'hébergement
mutualisé contraint en mémoire — c'est-à-dire le sujet même de l'audit d'indisponibilité
traité par le lot 30 (#369). Ils sont corrigeables par `npm audit fix` sans changement cassant.

Seul `exceljs` → `uuid` exigerait une rétrogradation cassante (`exceljs@3.4.0`) ; à laisser
en l'état et à documenter comme accepté.

### 2.4 — MINEUR · Longueur minimale de mot de passe à 4 caractères, y compris pour les comptes prof

`lib/settings.js:359` : `'security.password_min_length': { min: 4, max: 32, default: 4 }`,
et `lib/passwordReset.js:7` retombe sur la même valeur. **Déjà signalé par l'audit du 23/08
(point n° 5 du Top 10) et toujours ouvert.**

Le compromis est compréhensible pour des élèves de sixième. Il ne l'est pas pour les comptes
**professeur et administrateur**, qui portent `admin.impersonate` — la prise de contrôle
d'un compte quelconque. Un plancher **différencié par type de compte** (4 pour `student`,
12 pour `teacher`) coûte peu et ferme le seul chemin réellement dangereux. Le hachage bcrypt
en facteur 10 est correct et n'est pas en cause.

### 2.5 — MINEUR · CSP réduite à `img-src`

`server.js:222` pose `Content-Security-Policy: img-src 'self' https: data: blob:;` et
`server.js:135` désactive la CSP de helmet. Il n'y a donc **ni `default-src`, ni `script-src`** :
aucune atténuation d'XSS par CSP sur la SPA. Le choix est documenté sur place (les polices
Google et les styles inline casseraient sous la CSP par défaut) et les SVG téléversés sont
correctement neutralisés (`server.js:298`, `default-src 'none'; sandbox` + téléchargement forcé).

Le durcissement raisonnable n'est pas « rallumer helmet » mais poser un `default-src 'self'`
avec les exceptions déjà connues (`style-src 'unsafe-inline'`, `font-src fonts.gstatic.com`),
en `Content-Security-Policy-Report-Only` d'abord pour mesurer avant d'appliquer.

### 2.6 — MINEUR · `SELECT *` puis retrait manuel des champs sensibles

Motif présent à 138 emplacements, dont `SELECT * FROM users` suivi de
`res.json({ ...row, password_hash: undefined })` (`routes/students.js:329,595`,
`routes/auth.js:411`). Le résultat est correct aujourd'hui — `JSON.stringify` élimine
`undefined`, et la table `users` ne contient qu'une colonne sensible.

Ce qui pose problème, c'est la **direction de la garde** : elle est défensive et nominative,
donc elle ne protège que ce qu'on a pensé à nommer. Le jour où une colonne sensible s'ajoute
à `users` (un secret TOTP, un jeton de session), **toutes** ces routes la publieront sans
qu'un test échoue. `routes/rbac.js:896` montre le bon motif — une liste blanche explicite de
champs. Piste : un test qui verrouille les colonnes de `users` renvoyables, à mettre à jour
sciemment lors d'un ajout de colonne.

### 2.7 — INFO · Rate-limit par IP et NAT scolaire

`lib/rateLimit.js` : 1200 req/min/IP en général, 20 tentatives/15 min sur l'authentification.
Une classe entière derrière l'IP publique unique de l'établissement **partage ces compteurs** :
30 élèves qui se connectent au même moment consomment 30 des 20 tentatives autorisées. Le
piège est déjà connu du dépôt côté e2e (`--foretmap-e2e-no-rate-limit`, cf. `CLAUDE.md`).
Piste : clé de limitation combinant IP **et** identifiant de compte quand le JWT est présent.

---

## 3. Base de données & migrations

### 3.1 — MAJEUR (corrigé pendant cet audit) · Collision de numéro de migration 201

La PR #366 apportait `201_visit_mascot_pack_deletions.sql` alors que `main` avait entre-temps
reçu `201_learning_acknowledgements.sql` (#368). `database.js:650` appelle
`assertNoNewDuplicateMigrationNumbers(files)`, qui **refuse tout numéro dupliqué** hors des
doublons historiques 021 et 037 : la fusion telle quelle **aurait fait échouer le démarrage
de l'application**, pas seulement la migration.

Résolu à la fusion (renumérotation en `202_…`, CHANGELOG aligné), puis vérifié par
`npm run db:init` sur base vierge : schéma en version 202, table `visit_mascot_pack_deletions`
et `learning_acknowledgements` toutes deux présentes.

**Ce qui reste à traiter, c'est le moment où le défaut est détecté.** Le garde-fou est un test
qui ne s'exécute qu'à la migration ; la règle `.cursor/rules/foretmap-pr-merge-conflict.mdc`
demande la vérification manuellement. Ni l'un ni l'autre ne se déclenche à l'**ouverture**
d'une PR. Un contrôle CI qui compare les numéros de migration de la branche à ceux de `main`
signalerait la collision au moment où elle se crée, et non à la fusion.

### 3.2 — MINEUR · 193 migrations jamais compactées

`migrations/001` à `202`, rejouées de bout en bout sur toute base neuve, avec les erreurs
attendues journalisées et ignorées (index déjà présent, colonne déjà supprimée). Un
`db:init` complet reste rapide, donc rien ne presse. Mais `sql/schema_foretmap.sql` et la
chaîne de migrations décrivent désormais deux fois la même vérité, et **la seule preuve
qu'elles coïncident est que les tests passent**. Piste : après une release, geler un snapshot
de schéma et repartir de `203`.

### 3.3 — MINEUR · 13 tables sans index hors clé primaire

`gl_settings`, `app_settings`, `maps`, `permissions`, `gl_content_pages`,
`resource_gating_policy`, `gl_resource_gating_policy`, `gl_reference_docs`,
`gl_game_constants`, `gl_game_constant_refs`, `schema_version`. Ce sont pour l'essentiel des
tables de configuration à quelques dizaines de lignes, où un balayage complet est le bon plan :
**aucune action requise**. Signalé pour que la liste soit relue si l'une d'elles se met à croître.

### 3.4 — INFO · Cloisonnement produit vérifié

L'isolement ForetMap ↔ G&L est réel et testé : un JWT `product:'gl'` est rejeté hors
`/api/gl/*` et réciproquement (`tests/gl-product-routing.test.js`). Sondé en fonctionnement :
`GET /api/gl/qcm/questions` sans jeton renvoie bien `401`.

---

## 4. Process, Git & CI — le poste de coût principal

### 4.1 — MAJEUR · `dist/` versionné : la source de presque tous les conflits

310 fichiers générés suivis par Git, 31 Mo dans l'arbre de travail, **188 Mo dans `.git`**.
Sur 30 jours, **77 des 262 commits** touchent `dist/`.

Mesuré pendant cette session, à la fusion des quatre PR :

| PR   | Conflits totaux | Dont `dist/` | Conflits de fond      |
| ---- | :-------------: | :----------: | --------------------- |
| #362 |        2        |      0       | 2 (numéro de version) |
| #366 |       66        |    **64**    | 2 (numéro de version) |
| #369 |        2        |      0       | 2 (numéro de version) |
| #370 |       18        |    **16**    | 2 (numéro de version) |

**80 conflits sur 88 portaient sur des fichiers qu'aucun humain n'écrit.** Ils ne se
« résolvent » pas : on reprend `dist/` d'un côté et on relance `npm run build`. C'est
exactement ce qui a été fait ici — et c'est un travail entièrement mécanique, refait à
chaque PR, sur chaque branche, indéfiniment. Le renommage à empreinte de Vite garantit que
**tout** fichier change à chaque build, donc le nombre de conflits ne diminuera jamais.

L'invariant que le versionnement de `dist/` protège est réel : le cron de déploiement
(`scripts/auto-deploy-cron.sh`) fait un `git pull` et n'exécute pas de build, et le workflow
`frontend-dist.yml` vérifie que `dist/` correspond aux sources. Mais cet invariant peut être
tenu autrement : construire sur le serveur au déploiement, ou publier `dist/` en artefact
de release et le déployer depuis là. Le premier chemin est le plus court, et il supprime
d'un coup les 80 conflits par lot, les 188 Mo de `.git`, et le risque — bien réel — qu'une
résolution manuelle d'un fichier généré introduise une incohérence indétectable en revue.

> **C'est, de loin, la recommandation au meilleur rapport bénéfice/effort de cet audit.**

### 4.2 — MAJEUR · Le numéro de version est un point de conflit systématique

Les 8 conflits restants ci-dessus sont tous `package.json` + `package-lock.json`, ligne
`version`. Chaque PR ouverte revendique un numéro qui est pris avant qu'elle ne fusionne :
sur cette session, #366 revendiquait 1.130.0 (déjà consommée), #369 revendiquait 1.131.0
(déjà consommée), #370 revendiquait 1.132.0 (consommée entre-temps). Trois renumérotations
manuelles pour quatre PR — 1.131.1, 1.132.0, 1.133.0, 1.134.0.

La règle anti-conflit de `CLAUDE.md` demande de vérifier les autres PR à chaque publication ;
c'est une vigilance humaine que rien n'outille. Deux sorties possibles :

- **Bumper à la fusion, pas dans la PR** — un job qui incrémente `version` sur `main` après
  chaque merge. La ligne `version` ne figure alors plus jamais dans un diff de branche.
- À défaut, une stratégie de fusion `union` sur `CHANGELOG.md` via `.gitattributes`
  (le fichier fait déjà **720 Ko / 6724 lignes** et sa tête est un point chaud permanent).

### 4.3 — MAJEUR · Deux sessions ont travaillé simultanément sur la même branche

Pendant l'intégration de la PR #370, la branche `claude/glossaire-popups-overlap-yqupmk` a
reçu, d'une autre session, **la même fusion de `main` avec la même renumérotation en
1.134.0**. Le travail était identique au fichier près — vérifié : `git diff` entre les deux
têtes est vide, `dist/` compris. Le doublon a donc été absorbé sans dégât (fusion de leur
tête plutôt qu'écrasement, puis abandon de mon commit redondant).

Le fait qu'il n'y ait pas eu de dégât ici tient au hasard : les deux résolutions étaient
identiques. Elles auraient tout aussi bien pu diverger sur le numéro de version et produire
un `main` incohérent. Piste : une convention de réservation de branche, ou au minimum un
`git fetch` + comparaison de tête **avant** toute résolution de conflit.

### 4.4 — MAJEUR · Le workflow « Release tag » n'a jamais publié une seule release

`.github/workflows/release-tag.yml:76` :

```yaml
printf '%s\n' "${{ steps.notes.outputs.body }}" >/tmp/notes.md
```

Une expression `${{ … }}` est substituée **dans le texte du script** avant que bash ne
l'analyse. Le corps injecté ici est un extrait de `CHANGELOG.md` — donc du Markdown
contenant des accents graves, des guillemets, des astérisques et des sauts de ligne. Bash
le relit comme du **code**.

Extrait du journal du run 158 (fusion de #369) :

```
docs/MASCOT_NARRATEUR_OLU.md: Permission denied
GLFeuilletPopover: command not found
/api/gl/*: No such file or directory
command substitution: line 7: syntax error near unexpected token `newline'
##[error]Process completed with exit code 2.
```

Les accents graves du CHANGELOG sont exécutés comme substitutions de commande, les `>` comme
redirections — le nom de fichier « Permission denied » est un chemin cité dans une note de
version, que bash a tenté d'écraser.

**Ce que ça casse.** Les lignes 74-75 créent et poussent le tag **avant** la ligne qui
échoue. Le tag part donc, la release non — et l'étape suivante n'est jamais atteinte.
Constat mesuré sur le dépôt :

|                                              |                    |
| -------------------------------------------- | ------------------ |
| Tags `v*` présents                           | **134**            |
| Releases GitHub publiées                     | **0**              |
| Six derniers runs du workflow (n° 153 à 158) | **6 échecs sur 6** |

Le workflow est donc rouge à **chaque** push sur `main` — y compris les quatre fusions de
cette session — et il l'était bien avant elles. Ce rouge permanent a un second coût : il
banalise l'échec, et un vrai défaut de release passerait inaperçu au milieu.

**Correctif** — passer le corps par l'environnement plutôt que par interpolation dans le
script, ce qui le rend opaque à bash :

```yaml
- name: Créer le tag + la release
  if: steps.check.outputs.exists == 'false'
  env:
    GH_TOKEN: ${{ github.token }}
    NOTES_BODY: ${{ steps.notes.outputs.body }} # ← ajouté
  run: |
    ...
    printf '%s\n' "$NOTES_BODY" >/tmp/notes.md    # ← au lieu de ${{ … }}
```

C'est aussi la bonne pratique de sécurité : sous sa forme actuelle, **tout ce qui entre dans
`CHANGELOG.md` devient du shell exécuté** avec `contents: write` et `GH_TOKEN`. Sur ce dépôt
le CHANGELOG n'est écrit que par des mainteneurs, donc la surface d'attaque est nulle en
pratique — mais c'est la même classe de défaut, et le correctif la ferme en même temps.

Une fois le workflow réparé, les 134 tags existants resteront sans release : à traiter à
part si l'historique compte (un `gh release create` rétroactif), ou à assumer.

### 4.5 — MINEUR · 79 branches distantes, dont 46 non fusionnées

32 branches entièrement fusionnées dans `main` peuvent être supprimées immédiatement. Parmi
les 46 non fusionnées, les plus anciennes remontent au **8 juillet** (`claude/app-docs-reference-bhzs5c`,
`claude/github-best-practices-inspiration-k8jfpr`, `claude/pr-merge-conflict-rule-5sdifu`).
Chacune porte un travail qui, s'il compte encore, ne se rebasera qu'au prix fort ; s'il ne
compte plus, il encombre. Un tri est à faire, branche par branche.

### 4.6 — MINEUR · La suite e2e ne bloque pas la CI

`.github/workflows/ci.yml` : `continue-on-error: true` sur l'étape Playwright, avec une
justification honnête sur place (instabilité en headless, budget de temps). 43 scénarios e2e
existent donc et **ne peuvent rien empêcher de passer**. C'est un choix défendable, mais il
signifie qu'aucun test de bout en bout ne garde `main` : les portes réelles sont lint,
backend, Vitest et build. À rendre bloquant au moins pour un sous-ensemble « smoke »
stabilisé (connexion, chargement de la carte, ouverture d'une tâche).

### 4.7 — MINEUR · Couverture mesurée mais sans seuil

`npm run test:coverage` s'exécute en CI (`--experimental-test-coverage`) et **aucun seuil
n'est appliqué** : la couverture ne peut donc pas régresser de façon visible. Un plancher,
même bas et posé au niveau actuel, transforme la mesure en garde-fou.

### 4.8 — INFO · 522 avertissements ESLint

492 `no-unused-vars`, 30 `react-hooks/exhaustive-deps`. Zéro erreur. Le volume de
`no-unused-vars` est en grande partie un artefact des tests (jetons préparés puis inutilisés) ;
la convention `^_` est déjà en place et suffirait à les absorber. Les 30
`exhaustive-deps` méritent en revanche une relecture ciblée : ce sont les seuls qui peuvent
masquer un défaut de rafraîchissement réel.

---

## 5. Exploitation & performance

### 5.1 — MAJEUR · Limite de corps JSON à 25 Mo, sur hébergement contraint

`server.js:204` : `FORETMAP_JSON_BODY_LIMIT` avec un défaut de **25 Mo**, appliqué à
`express.json()` **et** `express.urlencoded()`, donc à toutes les routes `/api`.

Le front envoie ses images en base64 dans le corps JSON (`src/utils/fileToDataUrl.js`,
`src/utils/mediaImport.js`, une douzaine de panneaux d'import). La compression côté client
(`compressImage`, 1200 px / qualité 0,75) rend le cas nominal bien plus léger — mais c'est
une politesse du client, pas une contrainte du serveur : **rien n'empêche un corps de 25 Mo
d'arriver**, et Express le met intégralement en mémoire avant de le remettre au routeur.
Quelques requêtes concurrentes suffisent à approcher le plafond mémoire d'un processus
CloudLinux LVE.

C'est précisément le symptôme que le lot 30 (#369) outille sans encore l'expliquer : un
process tué sans signal, indiscernable d'un redémarrage ordinaire jusqu'à ce que le journal
de cycle de vie le nomme. **Le journal de bord livré par #369 est maintenant l'outil qui
permettra de confirmer ou d'écarter cette piste** — c'est le premier endroit à regarder après
la prochaine indisponibilité. Piste de durcissement : abaisser le défaut global (2 Mo) et ne
relever la limite que sur les routes d'import qui en ont besoin.

### 5.2 — MAJEUR · La configuration serveur du lot 30 reste à appliquer

Le lot 30 est fusionné, mais son bénéfice dépend de **deux gestes côté o2switch qui ne sont
pas dans le code** :

```cron
*/3 7-22 * * * curl -fsS --max-time 20 https://foretmap.olution.info/api/health >/dev/null 2>&1
```

et, dans cPanel → _Setup Node.js App_, la vérification qu'une **seule instance** est
configurée. Sans le keepalive à `*/3`, l'arrêt d'inactivité Passenger (seuil 300 s) continuera
de se produire — la cadence `*/5` documentée jusqu'ici tombait pile sur le seuil et laissait
passer un arrêt sur deux. Détail dans `docs/CRONTAB.md` et `docs/EXPLOITATION.md`.

Une fois quelques jours de journal accumulés : `npm run prod:uptime-report -- --hours=168`.

### 5.3 — MINEUR · Poids du bundle frontend

`dist/assets` pèse 9,6 Mo. Les plus gros morceaux : `main` 408 Ko, `gl` 352 Ko,
`GLContentsAdminView` 220 Ko, `rive` 192 Ko, `react-vendor` 188 Ko, et côté CSS
`visitMascotPackExtras` **188 Ko**. Le découpage par vue est déjà en place et fait son
travail. Deux cibles se détachent : `GLContentsAdminView` (220 Ko pour une vue
d'administration, chargée par une poignée d'utilisateurs) et la feuille
`visitMascotPackExtras` (188 Ko de CSS, à vérifier — une feuille de cette taille contient
souvent des données encodées en `data:`).

### 5.4 — MINEUR · Pool MySQL à 30 connexions, file d'attente à 200

`database.js:71-88` : `connectionLimit` 30 (réglable par `FORETMAP_DB_CONNECTION_LIMIT`),
`queueLimit` 200, `connectTimeout` borné, erreurs de pool captées pour ne pas devenir des
`uncaughtException`. Le réglage est cohérent et défensif. À relire seulement si le journal
de cycle de vie désigne la base comme cause d'indisponibilité.

### 5.5 — INFO · Diagnostics exemptés du verrou de readiness

Le lot 30 a exempté `GET /api/admin/diagnostics` et `/api/admin/logs` du verrou qui renvoie
`503 SERVICE_NOT_READY` sur `/api/*` : l'outil de diagnostic n'est plus muet quand MySQL
tombe. Vérifié en fonctionnement : sans secret, `/api/admin/diagnostics` renvoie bien `403`
et non `503`.

---

## 6. Architecture & dette de code

### 6.1 — MAJEUR · Duplication ForetMap ↔ G&L : la plomberie, pas le métier

`node scripts/audit-duplication-fm-gl.mjs` (outil du dépôt) sur `main` @ 1.134.0 —
27 paires front et 21 paires back au-dessus du seuil. Les plus substantielles :

| Lignes communes | Paire                                                          |
| :-------------: | -------------------------------------------------------------- |
|       110       | `routes/quiz.js` ↔ `routes/gl/qcm.js`                          |
|       104       | `routes/learning-links.js` ↔ `routes/gl/learning-links.js`     |
|       102       | `routes/context-comments.js` ↔ `routes/gl/context-comments.js` |
|       97        | `routes/auth.js` ↔ `routes/gl/auth.js`                         |
|       67        | `GlossaryPopover.jsx` ↔ `GLGlossaryPopover.jsx`                |

Le dépôt sait déjà traiter ce genre de chose : `lib/shared/` compte 31 noyaux et
`src/shared/` 24 entrées, sur le motif « noyau métier partagé + adaptateur mince par
produit ». Le lot 31 (#370) vient d'en ajouter deux (`glossaryLinkClick`,
`useGlossaryLinkedHtml`) et a **explicitement écarté** la fusion des deux `GlossaryPopover`
— 502 lignes de différence sur 753, un gain faible pour un risque réel. Ce refus est le bon
réflexe et mérite d'être cité en exemple : **un ratio élevé signale une piste, pas une dette.**

Les deux paires qui valent un examen sérieux sont `context-comments` (102 lignes communes
sur 229/165, pour un domaine sans divergence produit apparente) et `learning-links`.

### 6.2 — MINEUR · 24 fichiers au-dessus de 800 lignes

Tête de liste : `src/App.jsx` (1808), `routes/gl/lore.js` (1684), `lib/glChaptersImport.js`
(1415), `routes/visit/mascot.js` (1393), `routes/gl/auth.js` (1383), `lib/speciesAutofill.js`
(1356). `src/App.jsx` est le plus gênant des six : c'est la racine de l'application ForetMap,
donc le fichier que **toute** évolution front finit par toucher — ce qui en fait aussi un
point de conflit récurrent entre branches.

### 6.3 — MINEUR · Documentation d'API partielle

`docs/API.md` (1854 lignes) documente de l'ordre de **88 chemins distincts** pour
**539 déclarations de routes** dans `routes/`. L'écart n'est pas aussi grand qu'il en a
l'air — beaucoup de déclarations sont des variantes de méthode sur un même chemin, ou des
routes d'administration internes. Mais le contrat de `CLAUDE.md` (« toute route publique
nouvelle ou modifiée → `docs/API.md` dans le même lot ») n'est vérifié par rien.
Un script listant les routes montées et les confrontant aux chemins documentés rendrait
l'écart visible et chiffrable.

### 6.4 — MINEUR · 22 documents d'audit dans `docs/`

`docs/` compte 83 fichiers, dont **22 `AUDIT_*.md`** — celui-ci compris. Aucun ne porte de
marque de clôture : rien ne distingue, à la lecture du dossier, un audit dont tout est traité
d'un audit dont rien ne l'est. L'en-tête « Statut : à traiter » existe et c'est le bon
mécanisme — il gagnerait à être mis à jour en fin de traitement, ou les audits clos déplacés
dans `docs/archives/`.

### 6.5 — INFO · Ce que le code fait bien, et qu'il faut préserver

- **SQL paramétré sans exception** ; les interpolations restantes portent sur des entiers
  validés par Zod ou des constantes de module.
- **Aucun `console.log`/`console.error`** dans `routes/`, `lib/`, `middleware/`, `server.js`
  — le logger Pino avec `redact` est utilisé partout.
- **Aucun `TODO`/`FIXME`/`HACK`** dans `src/`, `routes/`, `lib/`, `middleware/`.
- **Identité toujours dérivée du JWT** : `lib/tasks/studentActionContext.js` documente
  explicitement pourquoi un `studentId` fourni par le client n'est jamais accepté tel quel.
- **Commentaires qui expliquent le _pourquoi_** — souvent l'incident qui a motivé la ligne.
  `database.js:679-684` (doublons de migration 021/037), `lib/spaFallback.js`,
  `server.js:294` (XSS SVG stocké) en sont de bons exemples.
- **Hooks Git** (`.githooks/pre-commit`) qui rejouent lint et Prettier avant commit.

### 6.6 — INFO · Aucune demande utilisateur en attente dans la doc de référence

`docs/reference/` ne contient **aucun marqueur `🔧 À implémenter`** hors des documents qui
décrivent le mécanisme lui-même (`README.md`, `guide-du-mj.md`). Rien à reprendre de ce côté.

---

## 7. Plan d'action proposé

### Immédiat (petit volume, effet direct)

1. **Fermer `GET /api/tasks/:id/image`** (§2.1) — ou retirer `image_url` de la réponse
   anonyme de `GET /api/tasks`. Aligner sur `routes/observations.js:164`. _Une route,
   un test._
2. **Rendre `404` les chemins `/api` inconnus** (§2.2) — un `app.use('/api', …)` avant le
   fallback SPA. _Cinq lignes, un test dans `tests/spa-fallback.test.js`._
3. **`npm audit fix`** sur les deux `high` Socket.IO (§2.3) — sans changement cassant.
4. **Réparer « Release tag »** (§4.4) — passer les notes par `env:` au lieu d'une
   interpolation `${{ … }}` dans le script. _Trois lignes ; supprime un rouge permanent sur
   `main` et débloque la publication des releases._

### Court terme (supprime du travail récurrent)

5. **Sortir `dist/` du dépôt** (§4.1) — build au déploiement, ou artefact de release.
   _~80 conflits en moins par lot, 188 Mo de `.git` en moins._
6. **Bumper la version à la fusion, pas dans la PR** (§4.2) — supprime les 2 conflits
   restants de chaque PR.
7. **Contrôle CI de collision de numéro de migration** (§3.1) — au moment de l'ouverture
   de la PR, pas à la fusion.
8. **Appliquer la configuration o2switch du lot 30** (§5.2) — une ligne de crontab plus la
   vérification d'instance unique, puis lire `npm run prod:uptime-report`.

### Moyen terme

9. **Plancher de mot de passe différencié** — 12 caractères pour `teacher`/`admin` (§2.4).
10. **Abaisser la limite de corps JSON** à 2 Mo par défaut, relevée route par route (§5.1).
11. **CSP `default-src 'self'`** en `Report-Only` d'abord (§2.5).
12. **Rendre bloquant un sous-ensemble e2e smoke** et **poser un seuil de couverture**
    (§4.6, §4.7).
13. **Trier les 79 branches** — 32 sont fusionnées et supprimables sur-le-champ (§4.5).

---

## 8. Ce que l'audit du 23/08 signalait, et qui est fermé

Vérifié dans le code sur `main` @ 1.134.0 :

| Point (Top 10 du 23/08)                               | État aujourd'hui                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Réponses de QCM révélables par force brute            | **Fermé** — jeton de présentation à usage unique (`routes/gl/qcm.js`, migration 197) |
| Farm de score par présentation illimitée              | **Fermé** — position de l'équipe vérifiée (`routes/gl/games/markers.js:199-223`)     |
| `forgot`/`reset-password` prof sans rate-limit strict | **Fermé** — `authLimiter` monté sur les six chemins (`server.js:155-164`)            |
| `GET /api/site-issues` public                         | **Fermé** — `requirePermission('admin.settings.read')` (`server.js:447,451`)         |
| Mot de passe minimum à 4 caractères                   | **Toujours ouvert** — cf. §2.4                                                       |

Quatre des cinq points les plus graves de l'audit précédent sont traités. C'est le principal
enseignement de cette relecture : **le dépôt referme ce qu'on lui signale.** Les constats
laissés ouverts ci-dessus sont, pour l'essentiel, des points que l'audit précédent n'avait
pas vus, faute d'avoir pu exécuter l'application contre une base réelle.

---

## 9. Méthode et reproductibilité

- Base **MariaDB 11.4** installée localement, `npm run db:init` sur base vierge.
- Suites exécutées intégralement : `npm test`, `npm run test:ui`, `npm run lint`,
  `npm run format:check`, `npm run build`.
- Constats de sécurité marqués « reproduit » : sondés par `curl` contre `node server.js`
  en `NODE_ENV=production` sur port 3111, sans en-tête `Authorization`. Les données témoins
  insérées en base de test ont été retirées après vérification.
- Duplication mesurée par l'outil du dépôt : `node scripts/audit-duplication-fm-gl.mjs`.
- Vulnérabilités : `npm audit --omit=dev` (dépendances de production uniquement).
- Aucun fichier de code applicatif n'a été modifié par cet audit.
