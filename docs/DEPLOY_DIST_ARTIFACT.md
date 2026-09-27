# Sortir `dist/` du dépôt — build livré par la CI

Ce document décrit pourquoi le build frontend cesse d'être versionné, comment la CI le livre à
la place, et **dans quel ordre basculer** sans fenêtre d'indisponibilité.

- Mécanisme serveur : [`scripts/fetch-dist-artifact.js`](../scripts/fetch-dist-artifact.js)
- Publication CI : [`.github/workflows/dist-publish.yml`](../.github/workflows/dist-publish.yml)
- Déploiement : [`scripts/auto-deploy-cron.sh`](../scripts/auto-deploy-cron.sh)
- Tests : [`tests/fetch-dist-artifact.test.js`](../tests/fetch-dist-artifact.test.js)

## 1. Le problème

Le serveur (o2switch, mutualisé) n'installe que les dépendances de production —
`npm ci --omit=dev`, cf. `scripts/auto-deploy-cron.sh`. Vite n'y est donc pas disponible et le
déploiement par `git pull` suppose un build **déjà présent dans l'arbre**. D'où `dist/` commité.

Cette contrainte coûte deux choses, toutes deux mesurées sur le dépôt :

**Des conflits de merge sur les PR qui touchent au frontend.** Les noms de chunks portent un
hash de contenu : deux branches qui modifient `src/` renomment chacune les mêmes fichiers, et le
conflit est un **rename/delete** que git ne sait pas résoudre. Le job `frontend-dist` constate la
dérive au push et auto-commite un `dist/` régénéré.

> ⚠️ Une version antérieure de ce document affirmait que la dérive tombait sur **toutes** les PR,
> y compris purement documentaires, parce que « le build n'est pas reproductible ». C'était une
> erreur de diagnostic : un `dist/` construit avec `NODE_ENV=test` (build de développement) avait
> été poussé sur `main` le 17/09/2026, et toute branche en héritait. Le build **est**
> reproductible — voir l'encadré de l'étape 2.

Chaque PR ouverte porte donc un commit `dist/`, et **n'importe quelle paire** de PR entre en
conflit **rename/delete** sur `dist/` — que git ne peut structurellement pas résoudre : les
pilotes de merge de `.gitattributes` ne traitent que les conflits de _contenu_, pas les conflits
d'arborescence. `scripts/auto-resolve-conflicts.js` ne sait pas non plus les traiter (sa table
est indexée par nom de fichier, et ses résolveurs cherchent des marqueurs dans le texte). Chaque
fusion sur `main` remet donc toutes les PR ouvertes en conflit, indéfiniment.

**Le poids du dépôt.** ~30 Mo de blobs neufs à chaque build commité (355 fichiers, `dist/`
pèse 32 Mo), sur un pack de 126 Mo. L'essentiel de l'historique du dépôt est du build jetable.

## 2. Le mécanisme

La CI construit `main` et publie le résultat sur une branche d'artefacts dédiée,
**`dist-artifact/main`**, réécrite par force-push à chaque build. Cette branche contient :

```
dist/               le build, tel quel
BUILD_INFO.json     { sourceCommit, version, builtAt, branch, runId }
```

Chaque publication part d'un `git init` neuf : la branche ne porte donc **qu'un seul commit**,
et l'historique du dépôt ne grossit pas d'un build à l'autre.

`BUILD_INFO.json` vit à la racine de la branche, pas dans `dist/` : le serveur le lit
séparément (`git show <ref>:BUILD_INFO.json`) et n'extrait que `dist/`, donc ce qui est servi
est exactement le build.

### L'invariant à préserver

Tant que `dist/` était dans le même commit que les sources, « le build servi correspond aux
sources déployées » était gratuit. En les découplant, il faut le garantir explicitement : c'est
le rôle de `sourceCommit`. Le serveur ne pose un artefact que s'il correspond au commit qu'il
déploie. Trois décisions possibles (`decideAction`) :

| Décision | Situation                                           | Effet                                                                                       | Sortie |
| -------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------ |
| `apply`  | `sourceCommit` == commit déployé                    | l'artefact est posé                                                                         | 0      |
| `defer`  | `sourceCommit` est un **ancêtre** du commit déployé | publication CI encore en cours → déploiement reporté au prochain tick, **sources intactes** | 75     |
| `stale`  | `sourceCommit` est étranger à l'historique déployé  | refus + alerte email, **sources intactes**                                                  | 1      |

`defer` n'est pas une erreur : c'est le cas normal pendant la minute où la CI publie.

### Ordre des opérations dans le cron

Le contrôle est fait **avant** le `git pull`, et la pose **juste après** :

1. `git fetch origin main` → `REMOTE_SHA`
2. fenêtre d'accalmie (`DEPLOY_QUIET_SECONDS`, 180 s par défaut)
3. **`fetch-dist-artifact.js --mode check --expect-source $REMOTE_SHA`**
   → `75` : sortie propre, rien n'a bougé ; `1` : alerte, rien n'a bougé
4. `git pull --ff-only`
5. **`fetch-dist-artifact.js --mode apply --expect-source $REMOTE_SHA`**
   → en cas d'échec : rollback complet
6. `npm ci --omit=dev` si besoin, migrations, redémarrage, `post-deploy-check`

Sans l'étape 3, un `git pull` réussi suivi d'un artefact indisponible laisserait le serveur avec
des sources neuves et un build périmé : assets en 404, SPA qui ne démarre pas. L'étape 3 est ce
qui rend la bascule sûre.

### Auto-réparation

Tant que `dist/` était versionné, un dossier abîmé se réparait tout seul au `git pull` suivant.
Ce n'est plus vrai : un `dist/` effacé (nettoyage d'hébergeur, disque plein) ou un **clone
serveur tout neuf** laisserait le site sans front, et le chemin « aucun nouveau commit » du cron
sort trop tôt pour le rattraper.

Le cron appelle donc `--mode repair` **à chaque passage**, y compris sans nouveau commit. Ce mode
court-circuite avant tout accès réseau quand `dist/` est complet — il ne coûte donc rien dans le
cas courant — et récupère l'artefact sinon.

**Un `dist/` reposé exige un redémarrage.** Le serveur ne décide qu'**au démarrage** s'il sert
`dist/` (`serveDist` et la racine statique, `server.js`) : démarré pendant que `dist/` manquait,
il sert la page d'aide au déploiement (« L'interface utilisateur est désormais livrée par le
build Vite… ») à la place du site, même une fois `dist/` revenu. (Cette section affirmait le
contraire jusqu'à l'incident du 27/09/2026.) D'où :

- `--mode repair` sort avec le code **10** quand il a reposé `dist/`, et le cron redémarre alors
  l'application ;
- `GET /api/health` publie `frontend` (`dist`, `missing` ou `dev`) : à chaque passage sans
  déploiement, le cron redémarre un serveur qui annonce `missing` alors que `dist/` est en place
  (réveil de Passenger au mauvais moment, pull fait hors du cron). Au plus un redémarrage de ce
  type par 30 minutes.

Ces vérifications tournent aussi quand l'arbre de travail n'est pas propre (déploiement bloqué) :
`dist/` est ignoré par git, le reposer ne touche à aucun fichier suivi.

### Rollback

`--mode apply` met l'ancien `dist/` de côté dans `dist.prev/`. Le rollback du cron
(`rollback_to`) fait `git reset --hard $PREV_SHA` — qui ne ramène plus le build, puisqu'il n'est
plus versionné — puis `--mode restore-previous`, qui remet `dist.prev/` en place **sans nouvel
accès réseau**. Un `dist.prev/` incomplet est refusé : poser un build tronqué est pire que ne
rien poser.

### Pourquoi quatre déclencheurs de publication

`dist-publish.yml` écoute `push` sur `main`, `workflow_run` après « Version bump on merge », un
`schedule` horaire et `workflow_dispatch`. Le deuxième n'est pas un luxe :

> `version-bump.yml` pousse `chore(release): vX [skip bump]` sur `main` **avec le
> `GITHUB_TOKEN`**, et un push par `GITHUB_TOKEN` ne déclenche aucun workflow (anti-boucle
> GitHub). La tête de `main` est donc presque toujours un commit que `push` n'a jamais vu.

Sans ce crochet, l'artefact serait en permanence un commit en retard sur `main` et le serveur
reporterait son déploiement **indéfiniment**. Le `schedule` horaire est le filet de sécurité si
un déclencheur est manqué (`[skip ci]` dans un message, run annulé, incident Actions) : au pire,
le déploiement attend une heure au lieu d'une minute.

Le job construit toujours la tête courante de `main`, pas le SHA déclencheur, et s'abstient si
l'artefact publié correspond déjà — le passage horaire ne republie donc pas 32 Mo pour rien.

## 3. Bascule — runbook

⚠️ **L'ordre compte, et les étapes 1 et 3 ne peuvent pas être dans la même fusion.** Le cron
s'exécute _depuis_ `$APP_DIR/scripts/auto-deploy-cron.sh` : modifier ce script et compter sur son
nouveau comportement dans le même passage, c'est réécrire un script bash en cours d'exécution.
Le serveur doit avoir **déjà pris** la nouvelle version du script avant que `dist/` disparaisse
du dépôt.

### Étape 1 — livrer le mécanisme (fait par cette PR)

Après fusion, rien ne change en production : `DEPLOY_DIST_SOURCE` vaut `repo` par défaut, donc
le cron se comporte exactement comme avant. La seule nouveauté visible est la branche
`dist-artifact/main` qui apparaît sur le dépôt.

Vérifier que la publication fonctionne :

```bash
# depuis n'importe quel clone
git fetch --force origin 'dist-artifact/main:refs/remotes/origin/dist-artifact/main'
git show origin/dist-artifact/main:BUILD_INFO.json
git rev-parse origin/main     # doit correspondre à sourceCommit
```

Laisser passer **au moins un cycle de cron** (2 min) pour que le serveur ait pris la nouvelle
version de `scripts/auto-deploy-cron.sh`. Confirmer dans
`logs/foretmap-auto-deploy.log` qu'un déploiement a bien eu lieu après cette fusion.

### Étape 2 — contrôle à blanc sur le serveur

Sans rien remplacer : l'artefact est extrait dans `dist.candidate/` et comparé au `dist/` servi.

```bash
cd /home/USER/foretmap
npm run deploy:dist:verify
# ou, en contrôlant l'alignement :
node scripts/fetch-dist-artifact.js --mode verify --expect-source "$(git rev-parse HEAD)"
```

Attendu : `artefact complet (N fichiers)` et un **nombre** de fichiers égal à celui de `dist/`.
Un `artefact incomplet`, ou un nombre de fichiers nettement différent, **arrête la bascule ici**.

> ✅ **Le build est reproductible — un écart de noms est donc un signal, pas du bruit.** Deux
> exécutions du même commit produisent le même `dist/`, fichier par fichier : vérifié sur
> `a9a9956` par le run `frontend-dist` **1079** (rebuild CI identique au `dist/` commité) et par
> un `NODE_ENV=production npm run build` lancé hors CI, sur une autre machine, qui reproduit les
> mêmes noms de chunks (`main-BSLTciXE.js`, `react-vendor-ClBrELym.js`) et les mêmes empreintes
> PWA (`foret-93d16d65`, `gl-9cb3d42c`, `plan-5b782279`, `staff-5f2a79c3`).
>
> La mesure inverse du 17/09/2026 sur `a4c0849` (« ~80 chunks renommés ») comparait un artefact
> de production à un `dist/` commité **construit en mode développement** (`NODE_ENV=test` hérité
> du shell). L'écart ne venait pas du build, mais du mode.
>
> Conséquence pratique : `findDistGaps` (cohérence interne, nombre de fichiers) reste le contrôle
> de base, mais un `diff -rq` entre l'artefact et le `dist/` commité du **même commit** doit
> ressortir **vide**. S'il liste des chunks renommés, l'un des deux builds n'a pas tourné en mode
> production — arrêter la bascule et chercher l'`NODE_ENV`.

Nettoyer ensuite : `rm -rf dist.candidate`.

### Étape 3 — basculer, puis retirer `dist/` du dépôt

> **Fait le 26/09/2026.** `DEPLOY_DIST_SOURCE=branch` a été activé sur le serveur, puis la PR
> d'exploitation a retiré `dist/` du dépôt. Écart assumé avec le point 2 ci-dessous :
> `frontend-dist.yml` n'est pas supprimé mais **réduit** (build de contrôle + miroirs CJS, plus
> aucun recommit de `dist/`), parce que son job `dist` est attendu par la protection de branche
> et qu'il est le seul à contrôler les miroirs `lib/visit-pack/`, `lib/gl-pack/`,
> `lib/term-autolink/`. Le défaut de `DEPLOY_DIST_SOURCE` dans le cron passe à `branch`.

**Dans cet ordre, sans inverser.**

1. **Sur le serveur**, activer le nouveau mode dans le `.env` (ou l'environnement du cron) :

   ```bash
   DEPLOY_DIST_SOURCE=branch
   ```

   À partir de cet instant, le cron exerce la chaîne complète à chaque déploiement : contrôle
   préalable de l'artefact, `git pull`, récupération et contrôle d'intégrité.

   `dist/` étant **encore versionné** à ce stade, le script le détecte (`isDistTracked`) et
   **ne le remplace pas** : le remplacer salirait l'arbre de travail, et le cron refuse de
   déployer sur un arbre sale (« arbre de travail non propre ») — le serveur se bloquerait à
   chaque passage. Le build livré par le `git pull` est celui du même commit, donc il n'y a
   rien à corriger. Le journal l'annonce explicitement :

   ```
   [fetch-dist] dist/ est encore versionné : artefact validé mais non posé (recouvrement de bascule).
   ```

   C'est donc un **vrai essai à blanc en production** : tout est vérifié, rien n'est encore
   confié à l'artefact. Laisser passer un ou deux déploiements dans cet état.

2. **Dans le dépôt**, une PR courte qui :
   - ajoute `dist/` à `.gitignore` ;
   - `git rm -r --cached dist` ;
   - supprime `.github/workflows/frontend-dist.yml` (l'auto-commit de `dist/` sur les branches de
     PR — la source même des conflits). Ses échecs des 17/09/2026 (runs `1066`, `1072`, `1074`)
     n'étaient **pas** du bruit : ils signalaient un `dist/` construit en mode développement sur
     `main`, et le run `1079` est repassé au vert une fois le build de production reposé. Ce
     workflow fait son travail — le retirer fait perdre le seul filet qui rattrape un `dist/`
     commité non conforme aux sources. C'est acceptable **parce que** `dist/` cesse au même
     moment d'être servi depuis le dépôt : après l'étape 3, c'est `dist-publish.yml` qui
     construit, et son artefact ne peut pas être construit à la main dans un mauvais mode ;
   - retire la garde `dist/` de `.githooks/pre-push` ;
   - retire du `README`/`docs` les consignes « lancer `npm run build` avant de pousser ».

3. Après fusion, le premier `git pull` supprime `dist/` de l'arbre serveur, et `--mode apply`
   le repose immédiatement depuis l'artefact, **avant** tout redémarrage. Si l'artefact est
   indisponible à ce moment-là, le rollback ramène `PREV_SHA` — dont le `dist/` est encore
   versionné : la panne se répare d'elle-même.

### Retour en arrière

À tout moment : `DEPLOY_DIST_SOURCE=repo` sur le serveur. Si l'étape 3 point 2 est déjà
fusionnée, il faut aussi revenir sur ce commit (`dist/` doit redevenir suivi) — d'où l'intérêt
de le garder en PR séparée et facilement révocable.

## 4. Effet sur le travail quotidien

- **Plus de `npm run build` avant de pousser.** Le hook `pre-push` et la garde du cron n'ont
  plus d'objet (retirés à l'étape 3).
- **Plus de conflit sur `dist/`.** C'était la cause unique des conflits récurrents entre PR.
- **Une PR frontend redevient lisible** : le diff ne contient que les sources.
- **Développement local inchangé** : `npm run dev` utilise le serveur Vite ; `npm run build`
  reste nécessaire pour tester en mode production (e2e Playwright, `NODE_ENV=production`), et
  produit un `dist/` désormais ignoré par git.
- **Les miroirs CJS restent versionnés** (`lib/visit-pack/`, `lib/gl-pack/`,
  `lib/term-autolink/`, `lib/shared/`) : ils sont requis au _runtime_ par l'API, qui tourne sans
  `src/` en production, et leur contenu est déterministe — ils ne provoquent pas de conflit
  rename/delete. Ils continuent d'être synchronisés par `npm run build` et contrôlés par le
  garde-fou pack mascotte du cron.

## 5. Dépannage : le site affiche la page d'aide au déploiement

Symptôme : au lieu du site, une page « L'interface utilisateur est désormais livrée par le build
Vite (dossier dist/) ». Le serveur tourne en production **sans** `dist/`, ou a démarré sans lui.

Incident du 27/09/2026, pour mémoire : la ligne de crontab appelait le script sans `bash`, le
`git pull` de #554 a réécrit le script sans droit d'exécution, et chaque passage échouait sur
« Permission denied ». Les mises à jour suivantes sont passées par le bouton **« Update from
Remote »** de cPanel — un simple `git pull`, qui a retiré `dist/` sans poser le build ni lancer
les migrations.

Tout se fait dans le terminal, **sans node** (`APP` = dossier de l'application) :

1. **État** — rien n'est modifié :

   ```bash
   cd "$APP"
   git rev-parse HEAD
   git status --short | head -20
   ls -la dist/index.vite.html dist/gl.html
   tail -n 30 logs/foretmap-auto-deploy.log
   ```

   « Permission denied » dans le journal : corriger la ligne de crontab (`bash /…/scripts/auto-deploy-cron.sh`,
   [`docs/CRONTAB.md`](CRONTAB.md)). « Arbre de travail non propre » : `git status` liste les
   fichiers en cause ; des fichiers suivis supprimés par erreur se remettent avec
   `git checkout -- <chemin>` (les fichiers non suivis — `??` — ne bloquent plus le
   déploiement). « node et npm introuvables » : poser `DEPLOY_NODE_BIN_DIR` dans la ligne de
   crontab ([`docs/CRONTAB.md`](CRONTAB.md), pré-requis). « ÉCHEC du git pull » : le message
   de git juste au-dessus nomme le fichier non suivi à déplacer.

2. **Poser le build à la main** si `dist/index.vite.html` manque. Vérifier d'abord que
   `sourceCommit` est bien le `HEAD` du serveur ; sinon, ne rien poser et attendre la
   publication de la CI (ou redéployer le bon commit) :

   ```bash
   git fetch origin dist-artifact/main
   git show FETCH_HEAD:BUILD_INFO.json          # sourceCommit = git rev-parse HEAD ?
   rm -rf dist.new && mkdir dist.new
   git archive --format=tar FETCH_HEAD dist | tar -x -C dist.new --strip-components=1
   ls dist.new/index.vite.html dist.new/gl.html  # les deux doivent exister
   [ -d dist ] && mv dist dist.broken
   mv dist.new dist
   ```

3. **Migrations** si le code a été mis à jour hors du cron : sauvegarde
   (`bash scripts/db-backup.sh --label avant-migration`, ligne finale « OK »), puis cPanel →
   Setup Node.js App → Run JS Script → `db:status`, et `db:migrate` s'il en attend.

4. **Redémarrer** : cPanel → Setup Node.js App → **Restart**. Puis Run JS Script →
   `check:runtime`, et recharger le site.

À ne pas faire :

- **un second cron qui fait `git pull`** (ou `cd … && git pull origin main`). Il met à jour les
  sources sans poser le build, sans migrer, sans redémarrer, et il masque les nouveaux commits au
  cron de déploiement, qui ne voit plus rien à déployer. C'était la cause de l'incident du
  27/09/2026 : **une seule ligne de déploiement**, celle de `auto-deploy-cron.sh` ;
- utiliser « Update from Remote » ou « Deploy HEAD Commit » dans l'outil Git de cPanel (même
  défaut ; le message « The system cannot deploy … `.cpanel.yml` » est sans objet, ForêtMap ne
  s'en sert pas) ;
- faire `chmod +x` sur un script suivi par git ;
- pointer `DEPLOY_ENV_FILE` vers un fichier qui n'existe pas (le journal le signale désormais).

Sans `DEPLOY_SECRET`, le cron redémarre l'application par `tmp/restart.txt` (mécanisme
Passenger). Pour vérifier une fois que ce mécanisme fonctionne sur l'hébergement :
`touch tmp/restart.txt`, recharger le site, puis `GET /api/admin/diagnostics` → `restarts`
(ou `npm run prod:uptime-report`) doit montrer un arrêt `restart-file`.
