# Chantier G&L « décisions » : orchestration

Pour la **session orchestratrice** (Claude Code, Opus, effort élevé). Une session de lot ne lit pas ce fichier : elle
lit `REGLES_COMMUNES.md` et sa fiche.

Calé le 24/11/2026 sur `main` = `d65dca4` (v1.263.7, 13 h 47, heure de Casablanca), dernière migration `391`. Prod au
même niveau à 13 h 26 pour la v1.263.6 ; 19 catalogues sans écart ; aucune vraie séance jouée (parties 16 et 17 :
tests).

## 1. Ton rôle

- Tu orchestres **tout le chantier**, les trois vagues, sans attendre Oliv entre deux. Tu **ne codes pas** et tu ne
  fais aucun lot toi-même : ton contexte doit tenir jusqu'au bout.
- Tu prépares (section 3), tu lances un sous-agent par lot (section 4), tu fusionnes chaque lot fini dans la branche
  d'intégration (section 6), tu portes chaque vague sur `main` (section 7), tu rends compte (section 11).
- **Un seul lot à la fois par couloir**, donc trois sous-agents de lot en même temps au plus.
- **Aucune CI n'est attendue** (Oliv, 24/11 : « les fusions ne doivent pas attendre […] Il n'y a que le banc qui fera
  foi »). Aucun `gh pr checks`, aucune sonde de statut. `gh pr list` et `gh pr checks` répondent d'ailleurs 403 dans
  une session Claude Code (GraphQL fermé) : passe par `git` et par `gh api` (REST).
- **Rien ne s'écrit en prod**, ni par toi ni par un lot : ni connecteur, ni SQL, ni réglage, ni synchronisation
  manuelle de catalogue. Sache-le quand même : à chaque déploiement, le serveur passe les migrations **et synchronise
  seul les catalogues changés** (`lib/glTenirSync.js`, par empreinte, sauf `GL_TENIR_SYNC=0` ; pas désactivé en prod le
  24/11). Une vague change donc les textes et les sorts servis dès qu'elle est sur `main`.
- **Tu ne gardes jamais une branche extraite** : les sous-agents travaillent dans des copies du même dépôt, et git
  refuse qu'une branche soit extraite deux fois. Travaille toujours en tête détachée
  (`git checkout --detach origin/<branche>`) et pousse par `git push origin HEAD:<branche>`.
- **Chaque arrivée sur `main` déploie** : `.github/workflows/release.yml` tourne à la poussée, monte la version et
  publie l'artefact que le serveur récupère en quelques minutes, migrations comprises. Il y a donc trois déploiements,
  un par vague.
- **Pas de fusion sur `main` le jeudi de 8 h à 15 h**, heure de Casablanca (séances des 6e ; choix de Claude, qu'Oliv
  peut retirer) :
  `TZ=Africa/Casablanca date '+%u %H'` ; jour `4` et heure de `08` à `14` : attends 15 h. Les fusions dans la branche
  d'intégration, elles, n'attendent jamais.
- Aucune tâche planifiée pour relayer une session.

## 2. Le plan

`plan.json` (même dossier) est la forme lisible par un script de ce tableau.

| Lot | Couloir | Vague | Titre | Étapes | Attend | Banc | Migration | Charge |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `moteur-1` | moteur | 1 | Moteur du tour | 4 | — | seuils | — | moyenne |
| `moteur-2` | moteur | 1 | Les rôles du tour s'échangent | 3 | `moteur-1`, `contenu-1`, `contenu-2` | seuils | mig-regles-roles (ex N+8) | moyenne |
| `moteur-3` | moteur | 1 | Escalier et règles de séance | 4 | `moteur-2`, `contenu-2`, `ecrans-1` | seuils | mig-relance (ex N+3, seulement si l'import ne suffit pas) | forte |
| `moteur-4` | moteur | 1 | La question de case récompensée et la sonde | 3 | `moteur-3`, `ecrans-2` | seuils | mig-cases-question (ex N+2) ; mig-sonde (ex N+7) | forte |
| `moteur-5` | moteur | 1 | Trame, Lumière, appareils | 4 | `moteur-4` | seuils | mig-lumiere-trame (ex N+1) | moyenne |
| `ecrans-1` | ecrans | 1 | Portes et surfaces, bilan Team Spirit, onglets des biomes, message d'état | 6 | — | fumée | — | moyenne |
| `ecrans-2` | ecrans | 1 | L'erreur d'Olu visible, la question sans sa réponse visible | 4 | `ecrans-1`, `moteur-1` | fumée | — | moyenne |
| `ecrans-3` | ecrans | 1 | Les mascottes sautent de case en case | 5 | `ecrans-2` | fumée | — | moyenne |
| `ecrans-4` | ecrans | 1 | Au tableau, un seul écran d'équipe | 7 | `ecrans-3`, `moteur-4` | seuils | — | forte, reprise prévue |
| `ecrans-5` | ecrans | 2 | Le son : la projection chante | 3 | `ecrans-4` | fumée | — | légère |
| `ecrans-6` | ecrans | 2 | Les mots du voyage à l'écran, « Mon sac », la visite d'Olu, le fond du plateau | 4 | `ecrans-5`, `contenu-2` | fumée | — | moyenne |
| `ecrans-7` | ecrans | 2 | La table de jeu I : matières, tablette d'équipe, gemmes, typographie, barre | 5 | `ecrans-6`, `contenu-6` | fumée | — | forte |
| `ecrans-8` | ecrans | 2 | La table de jeu II : cinq onglets, « Mon sac » en deux états, surcouches, projection | 4 | `ecrans-7`, `contenu-6` | fumée | — | forte, reprise prévue |
| `ecrans-9` | ecrans | 2 | Le plateau : symboles gravés, figurines, voile qui pâlit, fil doré | 5 | `ecrans-8` | fumée | — | moyenne |
| `ecrans-10` | ecrans | 2 | La fouille et l'oiseau | 6 | `ecrans-9` | fumée | — | moyenne |
| `ecrans-11` | ecrans | 2 | Les moments forts et les sons du tour | 5 | `ecrans-10` | fumée | — | moyenne |
| `contenu-1` | contenu | 1 | Catalogues du tour : erreurs d'Olu, péripéties, retours, questions de lecture, mots du voyage | 6 | — | fumée | — | forte |
| `contenu-2` | contenu | 1 | Pistes de zone, badges, Passeur, textes d'écran, pseudo de la Lettre | 6 | `contenu-1` | fumée | — | moyenne |
| `contenu-3` | contenu | 1 | Page Histoire : lue par une question, délai annoncé, textes, illustrations | 4 | `contenu-2` | fumée | mig-histoire (ex N+4) | forte, reprise prévue |
| `contenu-4` | contenu | 1 | Carnet de Sélène et notes du copiste : les données | 3 | `contenu-3` | fumée | mig-copiste-carnet (ex N+6) | forte |
| `contenu-5` | contenu | 2 | Lexique du voyage, pages servies, vitrine, « +1 » du journal, traces de passage | 7 | `contenu-4`, `ecrans-4`, `ecrans-6` | fumée | mig-pages-servies (remplace N+5 : base neuve et « Mon sac ») | forte |
| `contenu-6` | contenu | 2 | Les marges du copiste | 5 | `contenu-5` | fumée | — | forte |
| `fin-1` | fin | 3 | Décisions consignées et règles v4 | 5 | tous les lots des vagues 1 et 2 | complet | — | moyenne |
| `fin-2` | fin | 3 | Docs de référence, docs du prof, skills, vérifications complètes | 4 | `fin-1` | complet | — | forte, reprise prévue |

**Couloirs.** Un couloir possède ses fichiers ; deux lots du même couloir ne tournent jamais ensemble. Dans un
couloir, l'ordre est celui du tableau.

| Couloir | Ce qu'il possède | Lots, dans l'ordre |
| --- | --- | --- |
| moteur | Règles et moteur du tour (serveur) : lib/glTour.js, lib/glTenir*.js, lib/glChasse.js, lib/glEscalier.js, lib/glTrameDefis.js, src/shared/glSortMomentsCore.js | `moteur-1`, `moteur-2`, `moteur-3`, `moteur-4`, `moteur-5` |
| ecrans | Écrans du tour et du plateau : src/gl/components/tenir/*, src/gl/components/mj/GLTourScreen.jsx, GLGameBoard.jsx, AppGL.jsx, src/gl/utils/glTenirMoment.js, src/gl/styles/* | `ecrans-1`, `ecrans-2`, `ecrans-3`, `ecrans-4`, `ecrans-5`, `ecrans-6`, `ecrans-7`, `ecrans-8`, `ecrans-9`, `ecrans-10`, `ecrans-11` |
| contenu | Données et contenu : data/gl/**, catalogues, migrations de données, routes/gl/lore.js, routes/gl/learning.js, Histoire, carnet, copiste, lexique | `contenu-1`, `contenu-2`, `contenu-3`, `contenu-4`, `contenu-5`, `contenu-6` |
| fin | Règles v4 et documentation | `fin-1`, `fin-2` |

**Règle de lancement.** Un lot se lance quand (1) tous ses « attend » sont fusionnés dans la branche d'intégration,
(2) aucun lot de son couloir ne tourne, (3) sa vague est ouverte. Quand plusieurs lots sont prêts, prends d'abord
celui dont le plus de lots dépendent (chemin critique de la vague 1 : `moteur-1` → `moteur-2` → `moteur-3` →
`moteur-4` → `ecrans-4`).

**Vagues.** La vague 2 s'ouvre quand la vague 1 est sur `main` ; la vague 3, quand la vague 2 est sur `main`.

**Plafond** : 24 sessions de lot et 8 reprises (les deux se comptent dans `ETAT.md`). Au-delà : arrêt, rapport à Oliv.

## 3. Préparation (une fois ; « lot 0 »)

1. `git fetch origin`. Vérifie que `origin/main` contient `docs/prompts/gl-decisions/` (ce kit). Lis `CLAUDE.md`,
   `.cursor/rules/foretmap-pr-workflow.mdc`, `.cursor/rules/foretmap-pr-merge-conflict.mdc`.
2. **Si `origin/claude/gl-decisions-integration` existe déjà**, tu es une reprise : va à la section 9.
3. Ce qui a bougé depuis le calage :
   `git log --oneline d65dca4..origin/main -- lib/gl* lib/glTour.js src/gl src/shared/glTenir* routes/gl data/gl migrations docs/GL_TENIR_A_DEUX_REGLES.md docs/reference/gl`.
   Note ce qui touche un lot. Le chantier UI/UX de ForêtMap fusionne sur `main` en même temps (styles sortis de
   `src/index.css`, cliquet du budget de bundle dans `scripts/check-bundle-budget.js`) : aucun lot ne touche
   `src/index.css`.
4. Outils : `git push --dry-run origin HEAD:refs/heads/claude/gl-decisions-essai` (droit de pousser une branche) ;
   `gh api repos/oliviera999/ForetMap --jq .default_branch` (API REST) ; `which mysqld_safe mariadbd node` ; démarre
   MariaDB une fois pour toutes (`mysqld_safe &`), les lots créent leurs propres bases.
5. Crée la branche d'intégration, en tête détachée : `git checkout --detach origin/main`. Copie
   `docs/prompts/gl-decisions/ETAT.modele.md` en `docs/prompts/gl-decisions/ETAT.md`, remplis l'en-tête (commit de
   départ, date, écarts du point 3), committe (`chore(gl): chantier décisions — état de départ`), puis
   `git push origin HEAD:refs/heads/claude/gl-decisions-integration`.
6. **Mesures de départ du banc.** Lance un sous-agent (type général, arbre de travail) avec ce message : « Sur la
   branche `origin/claude/gl-decisions-integration` du dépôt (en tête détachée), installe (`npm ci --ignore-scripts`), prépare la base
   du banc (`export GL_SIM_DB=foretmap_depart_sim` dans le terminal, le `.env` ne suffit pas ; `npm run gl:sim:db`), lance
   `npm run gl:sim -- --scenario ensemble-unifie --runs 5 --seed 14` puis
   `npm run gl:sim -- --scenario multi-appareils --runs 5 --seed 14`. Lis les deux `reports/gl-sim/<date>-<scénario>/summary.json` et rends, par
   scénario, classe et plateau, ces champs : `carnetComplet` (part des exécutions), `ecartLicornesGnomes`,
   `gemmesPayeesEnSortsParEleve`, `reculsLumiere`, `equipesSousVoilePct`, `pagesTrouveesEvts`, et les attendus manqués ;
   plus le nombre de violations et le code de sortie. Vingt lignes au plus, en tableau. Ne modifie aucun fichier. » Recopie son tableau dans `ETAT.md`,
   section « Mesures de départ », committe, pousse.

## 4. Lancer un lot

- **Outil** : le sous-agent `gl-decisions-lot` (défini dans `.claude/agents/gl-decisions-lot.md` : sa propre copie du
  dépôt, Opus, effort élevé), lancé **en arrière-plan**. S'il n'est pas proposé, un sous-agent général avec
  `isolation: worktree`, modèle Opus.
- **Message de lancement, mot pour mot** (remplace `<id>` et `<titre>`) :

  > Chantier « G&L décisions » du dépôt oliviera999/ForetMap. Tu es la session du lot <id> (<titre>), et seulement de
  > ce lot. Fais `git fetch origin`, puis lis sur `origin/claude/gl-decisions-integration` le fichier
  > `docs/prompts/gl-decisions/REGLES_COMMUNES.md` en entier et ta fiche `docs/prompts/gl-decisions/lots/<id>.md`.
  > Suis-les. Ta branche : `claude/gl-decisions-<id>` (reprends-la si elle existe). À la fin : pousse ta branche, ne
  > fusionne rien, ne lance aucune session de lot, et rends dix lignes au plus.

- Une **reprise** : même message, précédé d'une ligne qui dit pourquoi (« Reprise : ton rapport dit `partielle`, il
  reste … » ; « Reprise : fusionne `origin/claude/gl-decisions-integration` et résous le conflit dans … » ; « Reprise :
  le banc de l'intégration casse après ta fusion : … »). Si le sous-agent d'origine peut encore être repris, reprends
  celui-là ; sinon lances-en un neuf sur la même branche. Une reprise compte dans le plafond.
- Note dans `ETAT.md` l'heure de lancement de chaque lot (un commit par changement d'état suffit : pas à chaque
  minute).

## 5. Suivre

- Tu attends le retour des sous-agents : **dix lignes, jamais un diff ni un journal de test**. Si tu as besoin d'un
  détail, lis le rapport du lot (`docs/prompts/gl-decisions/rapports/<id>.md` sur sa branche), pas son code.
- Un lot pousse après chaque étape. Lot sans retour : `git fetch origin` puis
  `git log -1 --format=%cI origin/claude/gl-decisions-<id>`. Aucun commit depuis trois heures et pas de réponse :
  relance-le (reprise).
- Si la machine sature (tests qui tombent en délai dépassé sans raison, base qui refuse des connexions) : passe à
  deux lots en parallèle, puis à un.

## 6. Fusionner un lot dans la branche d'intégration

Conditions, toutes : le rapport du lot dit `faite` ; il dit le **banc vert** (et, au régime « seuils », aucune alerte
inexpliquée) ; la branche est poussée.

```bash
git fetch origin
git ls-tree --name-only origin/claude/gl-decisions-integration migrations/ | sort | tail -1   # plus haute migration
git checkout --detach origin/claude/gl-decisions-integration
git merge --no-ff origin/claude/gl-decisions-<id> -m "Fusion du lot <id> : <titre>"
# (mise à jour de ETAT.md, commit)
git push origin HEAD:claude/gl-decisions-integration
```

- **Conflit** limité à `changelog.d/`, `docs/prompts/gl-decisions/` ou un doc : résous-le toi-même en gardant les deux
  côtés. Conflit dans du code ou des données : `git merge --abort`, reprise du lot.
- **Migration** : compare le numéro de chaque migration du lot à la plus haute de la branche d'intégration **avant**
  la fusion. S'il n'est pas strictement au-dessus : reprise du lot (« renumérote ta migration au-dessus de <nnn> »).
  Deux lots à migration ne se fusionnent jamais dans le même geste.
- Mets `ETAT.md` à jour dans le même commit de fusion ou juste après : état `fusionné`, commit, correspondance
  étiquette → fichier de migration, ce que le rapport laisse « à relire » ou « à faire » par Oliv. Pousse.
- **Après la fusion d'un lot au régime « seuils »**, et au moins toutes les trois fusions : lance un sous-agent
  vérificateur (type général, arbre de travail) : « Sur `origin/claude/gl-decisions-integration` : `npm ci
  --ignore-scripts`, bases `foretmap_verif_test` et `foretmap_verif_sim`, `npm run db:init`, `npm test`,
  `npm run test:ui`, `npm run test:content`, `npm run build`, puis le banc (`export GL_SIM_DB=foretmap_verif_sim`, `gl:sim:db`, `ensemble-unifie` et
  `multi-appareils`, `--runs 5 --seed 14`). Rends cinq lignes : vert ou non, et pour chaque échec le test ou la
  violation et le lot probable. Ne modifie rien. » Un échec : reprise du lot en cause, et aucun autre lot du même
  couloir tant que ce n'est pas réparé.
- **Reprends `main` au fil de l'eau** : après chaque fusion de lot, `git merge origin/main` dans la même tête détachée
  s'il passe sans conflit (le chantier UI/UX de ForêtMap fusionne sur `main` pendant ce temps), et pousse. S'il y a un
  conflit : `git merge --abort`, note-le dans `ETAT.md`, la clôture de vague le traitera.
- Lance ensuite les lots que cette fusion débloque.

## 7. Porter une vague sur `main`

Quand tous les lots d'une vague sont fusionnés dans l'intégration, **ou quand la vague ne peut plus avancer** (un lot
`bloquée` arrête son couloir : chaque lot attend le précédent) : porte sur `main` ce qui est fusionné et vert, écris
dans `ETAT.md` les lots laissés de côté, puis ouvre la vague suivante pour les seuls lots dont toutes les attentes sont
fusionnées. À la vague 3, `fin-1` se lance sur ce qui est livré et liste le reste.

1. Sous-agent « clôture de vague » (type général, arbre de travail), message :

   > Sur la branche `claude/gl-decisions-integration` du dépôt oliviera999/ForetMap, prépare l'arrivée de la vague
   > <n> sur `main`. Travaille en tête détachée (`git fetch origin && git checkout --detach
   > origin/claude/gl-decisions-integration`) et pousse par `git push origin HEAD:claude/gl-decisions-integration`.
   > (1) `git merge origin/main` : conflit dans `CHANGELOG.md` ou un doc, garde les deux côtés ;
   > conflit dans du code ou des données, arrête-toi et dis lequel. (2) Migrations : chaque fichier ajouté par le
   > chantier doit porter un numéro strictement au-dessus de la plus haute migration de `origin/main` ; sinon
   > renumérote (`git mv`, et les tests, docs et rapports qui citent le nom), dans l'ordre où elles ont été fusionnées.
   > (3) Reporte chaque `changelog.d/gl-decisions-*.md` sous `[Non publié]` de `CHANGELOG.md`, puis supprime ces
   > fragments. (4) Si le chantier a ajouté ou renuméroté une migration : sur une base fraîche, `npm run db:schema-fingerprint -- --write` (le champ `migration` de `sql/schema_fingerprint.json` doit nommer le dernier fichier). (5) Vérifie tout :
   > `npm ci --ignore-scripts`, base propre, `npm run db:init`, `npm run lint && npm run format:check`,
   > `npm run test:ui`, `npm test`, `npm run test:content`, `npm run build && npm run check:runtime`,
   > `npm run check:bundle`, les e2e G&L (`npx playwright test --project=chromium e2e/gl-*.spec.js`), puis le banc
   > (`export GL_SIM_DB=foretmap_vague_sim`, `gl:sim:db`, `ensemble-unifie`, `multi-appareils`, `--runs 5 --seed 14`). (6) Committe, pousse la branche. Ne
   > touche pas au champ `version`. Rends dix lignes : ce qui est vert, ce qui ne l'est pas, les migrations
   > (étiquette → numéro final), et le tableau du banc.

2. Le banc n'est pas vert, ou un conflit de code : reprise du lot en cause, puis recommence ce point.
3. Vérifie le créneau du jeudi (section 1).
4. Ouvre la PR et fusionne-la, par l'API REST :

   ```bash
   gh api repos/oliviera999/ForetMap/pulls -f title="feat(gl): chantier décisions — vague <n>" \
     -f head=claude/gl-decisions-integration -f base=main -f body="<résumé : lots, migrations, banc, à faire par Oliv>"
   gh api -X PUT repos/oliviera999/ForetMap/pulls/<numéro>/merge -f merge_method=merge
   ```

   Si l'API refuse : fusion par `git` (`git fetch origin && git checkout --detach origin/main && git merge --no-ff
   origin/claude/gl-decisions-integration -m "Chantier G&L décisions : vague <n>" && git push origin HEAD:main`). Si la poussée est refusée aussi : arrête-toi, écris la
   raison exacte dans `ETAT.md`, dis-la à Oliv. N'essaie rien d'autre.
5. Après la fusion : `git fetch origin` ; attends le commit `chore(release): v… [skip bump]` sur `origin/main`
   (quelques minutes ; s'il ne vient pas en vingt minutes, note « publication non constatée » : le déploiement
   dépend de GitHub Actions). Si tu peux joindre `https://gl.olution.info/api/health`, note la version servie.
   Puis `git merge origin/main` dans la branche d'intégration, pousse, mets `ETAT.md` à jour (vague sur `main`, PR,
   commit, version), et ouvre la vague suivante.

## 8. États d'un lot

| État du rapport | Ce que tu fais |
| --- | --- |
| `faite`, banc vert | Fusion (section 6) |
| `bloquée` pour une alerte de banc inexpliquée | Pas de fusion ; note l'alerte pour Oliv ; les lots qui en dépendent attendent |
| `partielle` | Reprise sur la même branche |
| `bloquée` | Ne lance plus les lots qui l'attendent ; continue les autres ; dis-le dans le rapport final |
| pas de rapport | Reprise |

## 9. Si tu t'arrêtes, ou si tu es une reprise

Oliv relance la session avec le même prompt. Tu repars de l'état réel, sans rien refaire :

1. `git fetch origin` ; lis `docs/prompts/gl-decisions/ETAT.md` sur `origin/claude/gl-decisions-integration`.
2. `git ls-remote --heads origin 'claude/gl-decisions-*'` : une branche de lot qui n'est pas marquée `fusionné` est un
   lot en cours ou à reprendre ; lis son rapport sur sa branche. Ne relance pas un lot dont la branche a bougé depuis
   moins de trois heures.
3. Reprends à la section 4.

**Budget de contexte.** `ETAT.md` est ta mémoire : écris-y après chaque fusion. Ne lis jamais un diff, un journal de
test ni une fiche de lot en entier. Si ton contexte approche de sa limite : mets `ETAT.md` à jour, pousse, et dis à
Oliv de relancer le même prompt.

## 10. Replis

- **Le sous-agent ne démarre pas, ou n'a pas le droit de pousser** (deux essais) : lance le lot par une session sans
  écran, depuis ton terminal, en arrière-plan :
  `claude -p "<message de lancement>" --model opus --worktree gl-decisions-<id> > /tmp/gl-decisions-<id>.log 2>&1 &`
  (ajoute le mode de permission qu'il faut pour qu'elle puisse écrire et pousser : `claude --help` ; non vérifié)
  puis suis sa branche comme à la section 5.
- **Rien de tout cela ne marche** : écris en tête de `ETAT.md` « relais manuel », avec les messages de lancement des
  lots prêts, pousse, et dis à Oliv de les coller chacun dans une session Claude Code. Tu reprendras l'orchestration
  quand il te relancera.

## 11. Fin du chantier : ton rapport à Oliv

Quand la vague 3 est sur `main` (ou que tout ce qui pouvait l'être l'est), ton dernier message dit, court :

- le tableau des lots : état, commit de fusion ; les trois PR de vague et la version de `main` après chacune ;
- les décisions livrées, et celles écartées avec la raison ;
- les choix faits sans demander (ceux des fiches, ceux des sessions) ;
- « À relire par Oliv » : les textes nouveaux ou changés, rassemblés depuis les rapports ;
- le banc : mesures de départ et mesures finales, côte à côte ;
- les lots `bloquée` ou les alertes de banc laissées ouvertes ;
- ce qu'Oliv doit faire maintenant, dans l'ordre : la section « Après » de `OLIV.md`.
