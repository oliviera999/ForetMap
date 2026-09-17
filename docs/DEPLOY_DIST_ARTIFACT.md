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

**Des conflits de merge systématiques.** Les noms de chunks portent un hash de contenu, donc
chaque build renomme tous les fichiers. Deux branches qui touchent le frontend produisent un
conflit **rename/delete** sur `dist/` — et git ne peut structurellement pas le résoudre : les
pilotes de merge de `.gitattributes` ne traitent que les conflits de _contenu_, pas les
conflits d'arborescence. `scripts/auto-resolve-conflicts.js` ne sait pas non plus les traiter
(sa table est indexée par nom de fichier, et ses résolveurs cherchent des marqueurs dans le
texte). Chaque fusion sur `main` remet donc toutes les PR ouvertes en conflit, indéfiniment.

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
cas courant — et récupère l'artefact sinon. Aucun redémarrage n'est nécessaire : les fichiers
statiques et l'entrée SPA sont lus sur le disque à chaque requête (`res.sendFile`, cf.
`lib/spaFallback.js`).

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

Attendu : `artefact complet (N fichiers)` et un nombre de fichiers comparable à `dist/`. Un écart
de quelques fichiers est normal si `main` a avancé entre-temps ; un écart massif ou un
`artefact incomplet` **arrête la bascule ici**.

Nettoyer ensuite : `rm -rf dist.candidate`.

### Étape 3 — basculer, puis retirer `dist/` du dépôt

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
     PR — la source même des conflits) ;
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
