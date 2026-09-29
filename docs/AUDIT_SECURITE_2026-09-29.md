# Audit sécurité — failles d'écriture et accès tiers au code source (29 septembre 2026)

> **Instantané daté** (convention : [`docs/audits/README.md`](audits/README.md)). Ne pas réécrire
> les constats ; marquer « Traité » en conservant le texte d'origine.
>
> **Portée** : failles exploitables par un utilisateur connecté ou un anonyme, et **accès au code
> source par des tiers** sous deux angles : fuite accidentelle depuis la production, et partage
> volontaire du dépôt (jury, prestataire, relecteur). Complète
> [`AUDIT_SECURITE_2026-09-22.md`](AUDIT_SECURITE_2026-09-22.md) (lecture des données) et
> [`AUDIT_RGPD_2026-09-28.md`](AUDIT_RGPD_2026-09-28.md).
>
> **Limite** : relecture du code et du dépôt uniquement. **Rien n'a été sondé sur la production** ;
> les constats d'exposition serveur sont des risques à vérifier, désormais couverts par
> `npm run deploy:check:prod`.

## Verdict

Une faille **critique** exploitable sans compte : le laissez-passer du plan public ouvrait le
plan des personnels. Elle est corrigée avec tests, comme cinq autres constats. Le risque résiduel
principal ne relève pas du code : le dump de production retiré en septembre reste joignable dans
les références `refs/pull/*` de GitHub pour quiconque a accès au dépôt. Le dépôt étant **privé**
(vérifié le 29/09), cela se limite désormais aux collaborateurs — d'où la règle : **ne jamais
partager le dépôt, remettre une archive** (`docs/EXPLOITATION.md` § 12).

| ID  | Gravité   | Constat                                                                                    | Statut                                                   |
| --- | --------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| C1  | Critique  | Cookie du plan public accepté par le plan des personnels                                   | **Traité**                                               |
| C2  | Critique  | Dump de production encore joignable via `refs/pull/*`                                      | Ouvert — action propriétaire                             |
| I1  | Important | Codes d'accès des plans sans longueur minimale                                             | **Traité**                                               |
| I2  | Important | Laissez-passer valides 30 jours après changement de code                                   | **Traité**                                               |
| I3  | Important | Groupes : annexion d'élèves hors périmètre                                                 | **Traité**                                               |
| I4  | Important | Isolement G&L / ForetMap rompu sur la modération des commentaires                          | Ouvert — exclu de ce lot                                 |
| I5  | Important | Injection de script dans la CI (`head_ref`)                                                | **Traité**                                               |
| I6  | Important | Exposition possible de `.git/`, `.env`, journaux en production ; bundle runtime trop large | **Traité** (sondes + liste blanche) ; docroot à vérifier |
| I7  | Important | `CHANGELOG.md` et `docs/*.md` publics                                                      | **Traité**                                               |
| M1  | Mineur    | Changement de mot de passe hors limiteur strict                                            | **Traité**                                               |
| M2  | Mineur    | Actions GitHub non épinglées, pas de `npm audit`                                           | **Traité**                                               |
| M3  | Mineur    | `xlsx@0.18.5` vulnérable                                                                   | Conservé (dépendance de test uniquement)                 |
| M4  | Mineur    | `err.message` SQL renvoyé par quelques imports                                             | Ouvert                                                   |
| M5  | Mineur    | Invité G&L autorisé à répondre aux QCM                                                     | Ouvert (à arbitrer : peut être voulu)                    |
| M6  | Mineur    | Infrastructure de production décrite dans la documentation versionnée                      | Ouvert (atténué par I7 et le dépôt privé)                |

## Constats

### C1 — Le plan public ouvrait le plan des personnels (Traité)

`lib/accessGate.js` signait la **valeur seule** du cookie, pas son nom. Les deux gardes
(`lib/planAccess.js`, `lib/staffPlanAccess.js`) partageaient le secret `VISIT_COOKIE_SECRET` et la
valeur `'ok'`. Recopier le cookie `plan_access` sous le nom `staff_plan_access` suffisait donc à
ouvrir le plan des personnels avec le seul code du plan public, distribué largement.

**Correctif** : option `bindName` de `createSignedCookieGate` — la signature couvre
`nom\nvaleur`. Activée pour les deux plans seulement : les cookies de progression anonyme de la
Visite, qui passent par la même fabrique, restent valides (test « signature historique
inchangée »).

### C2 — Dump de production joignable dans l'historique GitHub (Ouvert)

Le dump retiré de `main` et des tags (audit du 22/09, § 12 ; procédure `EXPLOITATION.md` § 10)
reste référencé par environ 366 `refs/pull/*`, que GitHub ne laisse pas réécrire par un
`push --mirror`. Il subsiste aussi dans des branches locales et le stash du poste de
développement. Actions propriétaire ci-dessous.

### I1 / I2 — Codes d'accès des plans (Traités)

`routes/settings.js` acceptait un code d'un caractère. Et la valeur du cookie ne dépendant pas du
code, **changer le code ne révoquait rien** pendant 30 jours — contrairement à ce que laissait
entendre la documentation de référence.

**Correctifs** : minimum de 8 caractères à l'enregistrement (un code vide efface toujours) ; la
valeur du cookie est une empreinte du hachage du code en vigueur (`codePassValue`), si bien qu'un
changement de code ferme la porte à tous les appareils. Conséquence assumée : une ressaisie
unique du code pour les laissez-passer émis avant ce lot.

### I3 — Groupes : annexion d'élèves hors périmètre (Traité)

`PUT /api/groups/:id/members` acceptait n'importe quel compte actif. Un prof de classe, qui ne
voit que ses groupes, pouvait y faire entrer l'élève d'une autre classe et accéder ensuite à ses
tâches et productions par le jeu du périmètre.

**Correctif** : `findUsersOutsideManageScope` (`lib/groupScope.js`), appliqué au remplacement, à
l'ajout en masse et à l'ajout unitaire. Est accepté un compte dont un groupe actif est déjà dans
le périmètre du gestionnaire (ou est ce groupe), ou un élève **sans aucun groupe** (nouvel
arrivant). Refus : `403 Utilisateur hors périmètre` (ligne en erreur pour l'ajout en masse). Les
gestionnaires à vue globale ne sont pas concernés.

### I4 — Modération croisée des commentaires (Ouvert, exclu de ce lot)

`routes/gl/context-comments.js` : la suppression, les réactions et les signalements ne filtrent
pas `context_type` ; un MJ G&L peut supprimer un commentaire ForetMap (et symétriquement côté
ForetMap pour les types `gl_*`). Écarté du lot à la demande du mainteneur.

### I5 — Injection dans la CI (Traité)

`.github/workflows/frontend-dist.yml` interpolait `${{ github.head_ref }}` directement dans un
script `run:`, dans un workflow doté de `contents: write`. Un nom de branche forgé exécutait des
commandes. **Correctif** : passage par `env: HEAD_REF` et `"$HEAD_REF"` (recommandation GitHub,
[Security hardening for GitHub Actions](https://docs.github.com/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#understanding-the-risk-of-script-injections)).

### I6 — Exposition en production (Traité côté outillage)

Si le docroot cPanel est le clone Git, `/.git/config`, `/.env` ou `startup.log` peuvent être
servis par le frontal avant même Express. Rien ne le contrôlait. Le bundle runtime copiait par
ailleurs tout sauf une liste d'exclusions : `src/`, `tests/`, `tmp/`, `.worktrees/`, variantes
`.env.*`.

> **Rédigé en parallèle de l'incident réel** : le 28/09, la racine web de la production était
> bien le dossier du dépôt ; corrigé côté hébergement (racine vide) et sondes non bloquantes
> ajoutées par la PR #565 (`EXPLOITATION.md` § 11.4), fusionnée pendant ce lot.

**Correctifs** : les sondes de `scripts/post-deploy-check.js` (celles de la PR #565, dont le
choix non bloquant est conservé) couvrent en plus `/.git/config`, `/startup.log` et
`/src/main.jsx` — une page HTML de la SPA, une 403 ou une 404 sont acceptées ; le bundle est
construit par **liste blanche** (`scripts/prepare-runtime-deploy.js` et sa variante PowerShell),
avec exclusions imbriquées (`node_modules`, dumps, `.env*` hors `.env.example`, journaux).

### I7 — Documentation technique publique (Traité)

`GET /CHANGELOG.md` et `/docs/API.md` étaient servis sans authentification : avec `/api/version`,
un tiers connaissait les correctifs déployés et la carte des routes. **Correctif** : permission
`admin.settings.read` ; la page « À propos » les charge avec le jeton et ne les montre qu'aux
administrateurs. `README.md` reste public.

### M1 à M3 (M1, M2 traités ; M3 conservé)

- **M1** : `/api/auth/me/password` et `/api/gl/auth/change-password` ajoutés aux chemins du
  limiteur strict (`lib/products.js`).
- **M2** : actions épinglées par SHA (`checkout`, `setup-node`, `upload-artifact`), suivies par
  Dependabot (écosystème `github-actions`) ; `permissions: contents: read` sur `ci.yml` ; étape
  `npm audit --omit=dev --audit-level=high` informative (non bloquante au départ).
- **M3** : `xlsx` n'est importé que par des tests (`devDependencies`, absent du bundle et de la
  production) ; conservé. À remplacer si un import de fichiers Excel entre un jour dans le code
  servi.

### Conforme (à ne pas défaire)

Pas de sourcemaps en production ; statique borné à `dist/`, `/uploads` et `/tutos` ; SQL
paramétré ; JWT HS256 relu en base ; DOMPurify ; SVG servis en bac à sable ; `.gitignore` et
`.cursorignore` complets ; aucun secret de production en dur.

## Tests

`tests/security-audit-2026-09-29.test.js` : cookie recopié refusé (C1), signature historique
inchangée, laissez-passer révoqué après changement de code et ancien format `ok` refusé (I2), code
court refusé (I1), prof de classe refusé sur l'élève d'une autre classe et accepté sur un nouvel
arrivant, administrateur non concerné (I3), chemins du limiteur (M1), détection des sondes (I6).
Contrôle de rougissement : neutraliser `findUsersOutsideManageScope` fait échouer le test I3.
`tests-ui/AboutView.test.jsx` : seul le README est public, le CHANGELOG est lu avec le jeton (I7).

## Actions du propriétaire (documentées, non exécutées)

1. **Demander au support GitHub la purge des `refs/pull/*`** et des vues en cache qui pointent
   vers le dump (C2).
2. **Réinitialiser les 41 comptes** dont le hachage figure dans le dump ; tracer l'incident au
   registre RGPD (constat R1 de l'audit du 28/09).
3. Supprimer les branches locales et le stash qui contiennent le dump.
4. Partager le code **par `git archive`**, jamais par un accès au dépôt ni un clone
   (`docs/EXPLOITATION.md` § 12).
5. Sur le serveur : la racine web a été séparée du dépôt le 28/09 (§ 11.4) ; après chaque
   déploiement, lancer `npm run deploy:check:prod` et traiter tout `FAIL … servi tel quel`.
6. Ne pas définir `LOAD_TEST_SECRET` en production.
