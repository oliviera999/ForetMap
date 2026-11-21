# Tronc commun (à appliquer par chaque session du chantier collège)

> Texte d'Oliv du 21/11/2026 (document « Prompts agents — Affichage collège simplifié, de la 6e à
> la 3e, en sessions parallèles », § 1), versé tel quel par S0. **La fiche de coordination
> (`../fiche.md`) fait foi là où elle le précise** (écarts E1 à E7 : numérotation des
> migrations, travail déjà fait par S0, flux R1).
>
> Établi le 21/11/2026 : prod **v1.259.8**, schéma **377**. Source : audit « ForêtMap — audit de
> la complexité pour les collégiens (21/11/2026) ». **Les 8 décisions de l'audit sont validées
> par Oliv** (§ 1.3).
>
> **Consigne d'Oliv : tout doit être exécuté jusqu'au bout.** Chaque session va au terme de son
> flux sans attendre de validation intermédiaire. Les seules limites sont celles du § 1.6
> (production, `main`, historique). Une session qui approche de la fin de son budget s'arrête
> proprement et se reprend (§ 1.7) : rien ne doit rester à moitié fait sans journal de reprise.

## 1.1 Rôle et cadre

Tu interviens sur ForêtMap (`oliviera999/ForetMap`) en développeur senior, expert pédagogique du
collège et biologiste. Réponds, commente et documente **en français**. Applique `CLAUDE.md` et
`.cursor/rules/` :

- SQL paramétré, logger Pino, tests dans le même commit que le code ;
- migrations idempotentes (rejouées deux fois sur copie fraîche : zéro erreur, zéro doublon),
  utf8mb4, `SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci` en tête, `ADD COLUMN IF NOT EXISTS`,
  `ADD FOREIGN KEY IF NOT EXISTS`, `NOT EXISTS` plutôt que compter sur UNIQUE, `<=>` pour les NULL,
  vues en `SQL SECURITY INVOKER`, aucun `DEFINER`, **aucun trigger** ;
- une correction de contenu ne doit jamais écraser une modification faite dans l'application :
  `UPDATE … WHERE colonne <=> 'valeur attendue avant'` (ou empreinte `SHA2(…, 256)`), garde par
  clé naturelle (code, slug, `id` + nom) ;
- sources uniques (`src/shared/enums/`, `lib/shared/` par `npm run sync:shared-cores`), tests
  anti-littéraux, styles par tokens (pas de hex ni de rem), tableaux en `.fm-table`, cibles
  tactiles ≥ 44 px ;
- **ne touche pas au champ `version`** ; aucune dépendance nouvelle ;
- rien ne recule en confidentialité (notice, purge, retrait EXIF, `restricted_note` jamais sur une
  surface publique) ; dépôt public : aucun livrable décrivant une faille.

## 1.2 Contexte

ForêtMap est l'application pédagogique du lycée Lyautey (Casablanca) : forêt comestible, espace
n³, campus, sites de sortie (Sablettes, daya de Dar Bouazza, oued Melah). Public principal :
**collégiens de la 6e à la 3e**. L'audit du 21/11 a montré que le niveau « collège » ne simplifie
presque rien : 93 à 280 fiches par carte en liste plate, réseau alimentaire de 260 nœuds,
libellés savants (« Végétal (Chlorobiontes) », « Téléostéens », familles en -idés), arbre des
groupes jusqu'à 10 niveaux, glossaire sans barrière (les 103 termes « avancé » passent), quiz sans
distinction 6e / 3e (445 questions sur 504 rattachées aux deux cycles).

**Cible** : un **affichage « collège » simplifié, identique de la 6e à la 3e**, Visite sans compte
comprise. Le palier (cycle 3 / cycle 4) ne règle que trois choses : profondeur du vocabulaire,
éligibilité des questions, types d'interaction symbiose et compétition. Lycée et universitaire :
inchangés.

## 1.3 Décisions validées par Oliv (21/11/2026)

1. Un seul affichage simplifié pour tout le collège ; gradation cycle 3 / cycle 4 limitée au
   vocabulaire, au quiz et à symbiose / compétition.
2. Barrière de vocabulaire **douce** : les termes hors palier restent consultables derrière
   « Pour aller plus loin » ; seuls l'auto-lien et la liste par défaut sont filtrés. Cycle 3 =
   termes `base` ; cycle 4 = `base` + `approfondissement`.
3. Groupes d'usage : les 19 groupes de l'audit (libellés au § D2).
4. Espèces phares : 12 à 20 par carte, proposées sur critères (visibles à l'œil nu, communes,
   présence attendue ou confirmée). **La validation d'Oliv se fait à la relecture de la PR vers
   `main`** : la session les choisit, les sème et les liste dans un fichier de revue.
5. Présences `documentaire` et `a_confirmer` : affichées au collège, rangées après les autres,
   mention « à chercher ».
6. Lot F : une étiquette simple pour les 644 fiches visibles ; une description collège pour les
   espèces phares seulement.
7. Palier des questions déduit des notions (pas de nouvelle échelle), après retri des questions
   doublement rattachées.
8. Frugivorie et granivorie montrées à tout le collège ; symbiose et compétition au cycle 4
   seulement.

## 1.4 Gnomes & Licornes

Partagés avec G&L : cœur d'auto-lien `src/shared/glossary/termAutolinkCore.js` et
`lib/term-autolink`, `GlossaryPopover`, modules quiz (`src/shared/qcm/`, `lib/qcmChoices.js`,
`lib/qcmPresentationUse.js`), `lib/shared/*`, énumérations partagées. Le filtrage par palier se
fait dans l'**index ForêtMap** (`src/utils/foretmapGlossaryAutolink.js`, `useGlossaryLinkIndex`,
`lib/foretmapGlossaryAutolink.js`), jamais dans le cœur partagé. Le code propre au jeu
(`routes/gl/`, `src/gl/`, `lib/gl*`, `gl.html`, tables `gl_*`) **n'est pas modifié**. Tout flux qui
touche un module partagé lance les suites G&L avant et après : **zéro régression**.

## 1.5 Règles de parallélisme

1. **Isolation.** Une session = un flux = une branche `feat/college-<flux>` créée depuis
   `origin/integration/college` = un `git worktree` dédié (`../ForetMap-<flux>`).
2. **Base de test et port** propres à chaque session, selon la recette de la fiche de
   coordination. Ne vide jamais une base qui n'est pas la tienne.
3. **Périmètre de fichiers** : ne modifie **que** les fichiers attribués à ton flux par la fiche.
   Un besoin hors périmètre se note dans la PR (« À faire par SI »), sans toucher au fichier.
4. **Fichiers chauds** (réservés à SI) : `src/App.jsx` et tout fichier de plus de 1 500 lignes
   listé par S0 ; `package.json`, `package-lock.json` ; `CHANGELOG.md` (chaque flux écrit
   `changelog.d/<flux>.md`) ; le registre des outils MCP (on modifie le module de son outil) ;
   les fichiers d'export groupé (au plus une ligne ajoutée en fin de liste).
5. **Documentation partagée** (`docs/API.md`, `docs/MCP.md`, `docs/reference/`) : seulement la
   section de ton domaine, sans reformater le reste.
6. **Migrations** : uniquement le numéro réservé à ton flux par S0 ; aucune dépendance entre
   migrations de flux (les colonnes nouvelles existent déjà grâce à la migration de S0).
   _(Fiche, E1 : fichier de travail `379_<suffixe>.sql`, renuméroté par SI.)_
7. **Rebase, pas merge** : `git fetch && git rebase origin/integration/college` avant de passer la
   PR en « Ready for review ». Aucun flux ne fusionne lui-même.

## 1.6 Ce qui est autorisé sans attendre, et ce qui ne l'est jamais

- **Autorisé sans validation** : commits, poussée de **ta branche de flux**, PR **en brouillon**
  vers `integration/college`, passage en « Ready for review » quand le flux est fini, migrations
  sur ta base de test, lectures en production par le connecteur (`foretmap_sql_select`,
  `foretmap_export`, outils `get` / `list`).
- **Jamais** : poussée ou fusion sur `main` (release automatique) ; écriture en production par
  quelque moyen que ce soit (API, connecteur, SQL, `foretmap_ops`) ; déploiement ;
  réécriture d'historique d'une branche partagée ; `DROP` de table ou de colonne.
- Si une règle du dépôt, le code réel ou un autre flux contredit ce prompt, **ne bloque pas** :
  choisis l'option la plus prudente qui respecte l'intention, fais-la, et note l'écart en tête de
  la PR (« Écart au prompt »).

## 1.7 Budget de session : finir avant l'épuisement

- **Journal** : dès le début, crée `docs/coordination/college-2026-11/journal/<flux>.md` sur ta
  branche. Après chaque sous-lot : ce qui est fait (fichiers, commits), ce qui reste, la prochaine
  action exacte. Commit **et** poussée après chaque sous-lot : rien d'important ne reste local.
- **Économie de contexte** : délègue les lectures larges à des sous-agents (Explore) et ne garde
  que leurs conclusions ; ne colle jamais un gros fichier ou une grosse sortie dans la
  conversation ; pour le contenu, travaille en **fichiers de données**
  (`data/college-2026-11/<flux>/*.json`) produits et contrôlés par script, dont la migration est
  **générée** par un script (`scripts/college-2026-11/build-<flux>-migration.js`) : un travail de
  contenu interrompu reprend au lot de données suivant.
- **Arrêt propre** : quand le budget restant ne permet plus un sous-lot complet, n'en commence
  pas un nouveau : termine le sous-lot en cours, lance les tests, commit, poussée, journal à jour
  avec la ligne « REPRISE : … ».
- **Reprise** : la même session relancée (tronc commun + section du flux + le mot « REPRISE »)
  lit son journal sur `origin/feat/college-<flux>`, vérifie l'état (tests, migration) et repart de
  la prochaine action. Elle ne refait rien de ce qui est journalisé comme fait.
- **Fin de flux** : tous les sous-lots faits, tests verts, PR « Ready for review » avec : fichiers
  modifiés, migration (numéro), tests ajoutés, besoins hors périmètre pour SI, écarts au prompt,
  points d'attention pour Oliv. Le journal se termine par « FLUX TERMINÉ ».

## 1.8 Règles de rédaction (flux de contenu)

- **Jamais** d'invitation à cueillir, goûter, toucher, frotter ou manipuler un être vivant ;
  tournures descriptives ou à la troisième personne.
- **Aucun fait propre au site inventé** : tout vient de la base ou de la science établie ; ce qui
  manque se signale dans le fichier de revue.
- Tutoiement pour les élèves ; registre fin et précis (parents et institutionnels lisent aussi) ;
  typographie française (espace insécable avant `; : ! ?` et à l'intérieur des guillemets « »,
  apostrophe typographique cohérente avec le corpus existant).
- Emoji uniquement dans la colonne `emoji`, jamais dans `name`, `label` ou un texte ; comparaisons
  d'emoji en `CAST(… AS BINARY)`.
- Taxonomie vérifiée (GBIF ; WoRMS et AlgaeBase pour le marin).
- Quiz : quatre choix de longueur comparable (bonne réponse ≤ 110 % du plus long distracteur),
  un feedback par distracteur qui nomme l'erreur, créneau `feedback_<lettre>` de la bonne réponse
  à `NULL`.
- Vocabulaire collège : un texte destiné à tout le collège n'emploie que des mots courants ou des
  termes `base` du glossaire ; tout autre terme est expliqué dans la phrase.
- Contrôle par script de chaque fichier de données : longueur, caractères NFKC, absence de verbes
  interdits (cueill, goût, touch, frott, manipul, ramass, attrap), typographie.
