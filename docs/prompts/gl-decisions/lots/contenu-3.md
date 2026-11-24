# Lot contenu-3 — Page Histoire : lue par une question, délai annoncé, textes, illustrations

> Chantier G&L « décisions » · vague 1 · couloir contenu · charge forte, reprise prévue · banc : fumée
> Branche : `claude/gl-decisions-contenu-3` · Attend : contenu-2 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- Sous l'Histoire d'un chapitre, chaque élève trouve « Marquer comme lu », depuis son compte ; une question sur le
  texte valide la lecture. Ni la tablette d'équipe ni le prof ne valident à sa place.
- Avant de répondre, puis après une erreur, l'élève lit clairement qu'il pourra réessayer dans une heure ; après ce
  délai, une autre question lui est posée.
- Les quatre récits sont réécrits dans les garde-fous ; les images ont une légende et une place dans le texte.
- L'épilogue, réservé à la lecture du prof en juin, n'est plus servi aux élèves.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| H1 du prompt | 23/11 soir | Page Histoire : « Marquer comme lu », soumis à une question. Chaque élève valide lui-même, depuis son compte, même si l'histoire a été lue en classe. | |
| H2 du prompt | 23/11 soir, redite à 20 h | Le délai d'une heure avant de réessayer est gardé, mais annoncé avant de répondre et après une erreur. Aucune erreur tolérée. | « Je reste sur ma décision d'1 h » |
| H3 du prompt | 23/11 soir | Questions nouvelles, tirées du texte de l'Histoire. | |
| H4 du prompt | 23/11 soir | Les illustrations de l'Histoire ont des légendes et sont mieux placées. | |
| H5 du prompt | 23/11, 20 h | Textes réécrits sans renversement spatial, sans amorce de la révélation, sans visage en acteur ni avant son plateau ; l'épilogue n'est plus servi aux élèves. | « N'enfreins pas les garde-fous du récit. » |
| « La question tourne » | 24/11, vers 14 h 40 | Après le délai d'une heure, jamais deux fois la même question de suite : une rotation, pas un tirage par graine. | (choix sur carte) |

**Choix par défaut posés par Claude** (Oliv peut les retirer) :

- Bouton réservé au compte d'élève (`gl_player`), jamais sur la tablette d'équipe ni chez le prof ; aucune récompense.
- Textes d'avertissement communs à toutes les ressources conditionnées de G&L (option `voix: 'gl'`) ; ton du verrou
  « Pas encore » ; bouton absent (pas grisé) pendant le délai ; heure du jour de l'appareil.
- Une question parmi trois par plateau ; l'ordre de départ change d'un élève à l'autre, pour toutes les ressources
  de G&L ; ForêtMap garde son ordre.
- Référence de la ressource = numéro du plateau, en texte. Liste `CHAPITRES_RECIT_PROF_SEUL`.
- Les quatre récits et les douze questions sont rédigés par Claude ; légendes écrites d'après les images.
- Scènes citées par nom ; galerie de fin seulement pour un texte sans scène citée ; toutes les valeurs de mise en
  page de l'étape contenu-3.2.
- Catégorie « Histoire des chapitres », rang 90 ; codes `LQCM0358` à `LQCM0369`.
- La migration crée aussi les scopes `ch1` à `ch4` s'ils manquent (section 5).
- Rotation : si le compte d'erreurs ne survit pas au délai, le repère est la dernière question manquée.
- Lire l'Histoire ne nourrit pas le regard du voyageur (pas d'entrée dans `REGARD_SOURCES`).

## 3. Fichiers

- **À toi** :
  - écran : `src/gl/components/GLHistoryView.jsx`, `src/gl/components/GLChapterIllustration.jsx`
    (`GLChapterScenes`), `src/gl/components/GLLearningAcknowledgeButton.jsx`, `src/gl/utils/glStorySceneRefs.js`,
    `src/gl/utils/glMarkdownEditorDisplay.js`, `src/gl/utils/glLearningFields.js`,
    `src/gl/hooks/useGlLearningProgress.js`, `src/gl/components/settings/GLGatingSettings.jsx`,
    `src/gl/components/admin/GLLearningLinksPanel.jsx`, `src/gl/components/GLChaptersAdminView.jsx` et
    `src/gl/components/admin/GLChapterScenesAdminPanel.jsx` (l'astuce « scene:N » affichée au prof) ;
  - serveur : `routes/gl/learning.js`, `routes/gl/chapters.js`, `lib/learningGatingAcknowledge.js`,
    `lib/glLearnableResources.js`, `lib/pedago/gatingProductCatalog.js`, `lib/glMarkerLoreQuestionPool.js`,
    `lib/glPlayerJournal.js` ;
  - quatre cœurs **sans source dans `src/shared`** : `lib/shared/learningAckCore.js`,
    `lib/shared/resourceQuestionGatingCore.js`, `lib/shared/gatingSettingsCore.js`,
    `lib/shared/cooldownDurationCore.js`. Ils ne vivent que dans `lib/shared/` : ils se modifient là. C'est
    l'exception à la règle du miroir ;
  - tests : `tests-ui/gl/glStorySceneRefs.test.js`, `tests-ui/gl/glMarkdownEditorDisplay.test.js`,
    `tests-ui/shared/LearningAcknowledgeButton.test.jsx`, `tests-ui/shared/learningGatingChallengeClient.test.js`,
    `tests-ui/shared/LearningGatingQuestionPanel.test.jsx`, `tests/gating-products.test.js`,
    `tests/learning-gating-products-characterization.test.js` et son relevé
    `tests/fixtures/learning-gating-products.golden.json` (ils figent la liste des types) ;
  - `docs/API.md`.
- **Nouveaux** : `data/gl/histoire/histoire-chapitres.json` ; `migrations/<numéro>_gl_histoire_chapitres.sql`
  (étiquette `mig-histoire`) ; `tests/content/gl-histoire-chapitres.test.js` ; `tests/gl-histoire-migration.test.js` ;
  `tests/gl-learning-chapter-story.test.js` ; `tests-ui/gl/GLHistoryView.test.jsx` ; `e2e/gl-histoire.spec.js`.
- **D'un autre couloir, modification minimale permise** :
  - `src/shared/components/LearningAcknowledgeButton.jsx`, `src/shared/components/LearningGatingQuestionPanel.jsx`,
    `src/shared/utils/learningGatingChallengeClient.js` (servent aussi ForêtMap) : l'option `voix: 'gl'` et les textes
    G&L ; les textes de ForêtMap ne changent pas ;
  - `routes/gl/lore.js` : **un** filtre, dans `GET /qcm/questions` (étape contenu-3.3, point 7). Le lot contenu-2 y a
    touché `discoveredBy` avant toi ; les lots contenu-4, contenu-5 et contenu-6 y passent après ;
  - `lib/gl/gamesRuntime.js` : le champ `story_markdown` de l'état de partie, pour l'épilogue seulement ;
  - `src/gl/assets/index.js` : une fonction de plus, pour trouver une scène `recit_0N-chapN_<nom>` hors du chapitre ;
  - `src/gl/styles/gl-theme.css` (couloir écrans) : un bloc `.gl-history…`, posé juste après `.gl-chapter-scenes`
    (lignes 6632 à 6638). Rien d'autre dans cette feuille.
- **Ne touche pas** :
  - `lib/glFeuilletAcquisition.js`, `lib/glFeuilletAcquisitionChannels.js` et
    `src/gl/utils/glSettingsForm.js` (ligne 339, canaux d'acquisition) : lire l'histoire ne révèle aucune page ;
  - `lib/glVoyageur.js` : ni `REGARD_SOURCES` (ligne 66), ni la Loupe (ligne 760, lecture par code, pas un tirage) ;
  - `src/gl/utils/glJournalImportMeta.js`, `src/gl/components/GLJournalImportButton.jsx` (import au journal) ;
  - `lib/glQcmLoreQuestionQuery.js`, `lib/gl/loreRouteHelpers.js` (lecture par code ou simple `SELECT`) ;
  - les réglages du conditionnement ; le texte de l'épilogue et du prologue ; la médiathèque.

## 4. Étapes (dans cet ordre ; une reprise peut s'arrêter après chaque commit)

Points d'arrêt propres : après contenu-3.1 (les données seules ne changent aucun écran, sauf les références de scènes
par nom, retirées de l'affichage jusqu'à contenu-3.2) ; après contenu-3.2 ; après chacun des cinq commits de
contenu-3.3 ; après contenu-3.4. Écris dans ton rapport le dernier commit vert et ce qui reste.

### contenu-3.1 — Textes d'Histoire et questions : les données (ex-étape H3)

- **Constat vérifié** (prod, 24/11) : rien de ce lot n'est en prod (0 question de catégorie `histoire`, 0 lien
  `chapter_story`). `gl_qcm_lore_questions.categorie_slug` a une clé étrangère vers `gl_qcm_lore_categories(slug)` ;
  la catégorie `histoire` n'existe pas (huit catégories, de `cosmologie` à `sortileges`). `chapitre_slug` a une clé
  étrangère vers `gl_qcm_lore_scopes(slug)`. Le plus haut code de question de lore est `LQCM0405` ; `LQCM0358` à
  `LQCM0369` sont libres. Aucun changement de schéma (`resource_type` : `VARCHAR(32)` ; `target_type` :
  `VARCHAR(16)`).
- **Changement attendu** :
  1. Copie `docs/prompts/gl-decisions/sources/histoire-chapitres.json` en
     `data/gl/histoire/histoire-chapitres.json` : il fait foi pour les textes des plateaux 1 à 4, les 12 questions et
     leurs liens. Son champ `changements` est un journal de la réécriture : il ne s'importe nulle part.
  2. Écris la migration `mig-histoire` (section 5).
  3. Garde-fous du récit : n'ajoute ni ne rétablis rien de ce que le fichier retire (direction d'où vient le
     grondement, « Et si le Souffle venait de chez nous ? », « les deux mondes sont liés », « arme », visages en
     acteurs, lignes `*Tonalité*`).
- **Tests** :
  - `tests/gl-histoire-migration.test.js` (base locale après `npm run db:init`) : 12 questions de catégorie
    `histoire`, 12 liens, chaque lien mène à une question existante ; deux passages de la migration donnent le même
    état. Vérifie qu'aucun test ne fige le nombre de catégories ni de questions de lore
    (`git grep -n "gl_qcm_lore_categories\|gl_qcm_lore_questions" -- tests`).
  - `tests/content/gl-histoire-chapitres.test.js`, sur le JSON (et sur la base quand elle est là, vrai `t.skip`
    sinon) :
    - 5 choix, une bonne réponse, un retour par mauvais choix, aucun retour sur la bonne lettre ;
    - la bonne réponse n'est jamais la plus longue (0 sur 12 au 23/11) ;
    - aucun mot de 5 lettres ou plus de la bonne réponse dans ses pistes, **comparé en mots entiers** (minuscules,
      sans accents) : pour `LQCM0360`, « peuple » est dans la réponse et « peuples » dans trois pistes ; une
      comparaison par sous-chaîne échouerait à tort ;
    - `findForbiddenString` nul sur les questions, les retours et les légendes (le texte des chapitres garde le nom
      « Grise » au plateau 2, qui est le sien) ; aucun « Krâ », « Kraa », « krâ » ;
    - aucun « Selene » sans accent, aucune ligne qui commence par `*Tonalité`, aucun `<img src="scene:` ;
    - sur les quatre textes : aucun « sud », « derrière vous », « chute », « liés », « Tonalité », « s'annonce »,
      « brisez » ;
    - chaque `scene:<nom>` figure dans la liste des 22 scènes connues de la médiathèque de prod (relevée le 23/11 ;
      une session ne peut pas la relire) : `recit_01-chap1_` + `le-carnet-dans-la-savane`, `le-carnet-et-le-monde`,
      `lecture-du-carnet-nuit`, `page-se-recolore`, `point-d-eau-tari`, `savane-emerveillement` ; `recit_02-chap2_` +
      `campement-abandonne-selene`, `la-grise-mediterranee`, `reconnaissance-pays-mediterraneen`,
      `traversee-du-sahara` ; `recit_03-chap3_` + `foret-automne-le-silence`, `landes-nommer-ensemble`,
      `menace-grise-horizon` ; `recit_04-chap4_` + `dernier-campement-carnet`, `lac-gele-taiga`,
      `miroir-du-retour-se-trouble`, `taiga-marche-neige` ; `recit_05-chap5_` + `abri-de-glace-lecture-carnet`,
      `bout-du-monde-etoile-fixe`, `retour-par-le-miroir`, `toundra-ete-ouverture`, `toundra-hiver-aurores`. Le
      fichier en cite 17.
- **Relecture** : `gl-relecteur-garde-fous` et `gl-relecteur-science` sur le JSON avant de clore l'étape.
- **Critère d'acceptation** : tests verts ; le JSON du dépôt est identique à la source.

### contenu-3.2 — Illustrations de l'Histoire : légendes et agencement (ex-étape H4)

- **Constat** (code lu ; affichage non vu à l'écran) :
  - En prod, les textes des plateaux 1 et 2 portent l'image sous la forme `<img src="scene:1" …>`, celle qu'écrit
    l'éditeur riche. `src/gl/utils/glStorySceneRefs.js › applyStorySceneRefs` (page élève) ne résout que la forme
    markdown `![…](scene:N)` ; seul l'aperçu de l'éditeur (`src/gl/utils/glMarkdownEditorDisplay.js`) résout les
    deux. L'image d'ouverture de ces deux plateaux est donc probablement cassée côté élève.
  - `scene:N` est le rang dans l'ordre alphabétique des clés : au plateau 1, `scene:1` = « le carnet dans la
    savane », sous la légende « Le point d'eau tari ».
  - Les scènes non citées s'empilent en fin de page (`GLChapterScenes`, dans `GLChapterIllustration.jsx`), sans
    légende. Aucune scène de la médiathèque n'a de légende (`recitCaption` vide).
  - Le plateau 4 a fusionné les anciens chapitres 4 et 5, mais `chapterIllustrations(4)` (`src/gl/assets/index.js`)
    ne lit que `recit_04-chap4_*` : les deux scènes de la toundra (`recit_05-chap5_toundra-*`) ne s'affichent nulle
    part.
  - La classe `gl-history` n'existe pas ; les styles voisins sont dans `src/gl/styles/gl-theme.css`.
- **Changement attendu** :
  1. **Références par nom** : `scene:<nom>`, où `<nom>` est la clé sans le préfixe `recit_0N-chapN_`
     (`scene:point-d-eau-tari`). Résolution d'abord parmi les scènes du chapitre, puis parmi toutes les scènes
     `recit_0N-chapN_<nom>` de la médiathèque (le plateau 4 cite ainsi la toundra). `scene:N` reste compris. Les deux
     formes, markdown et `<img src="scene:…">`, sont résolues par **un seul** utilitaire de `src/gl/utils/`, partagé
     par la page élève et l'aperçu de l'éditeur. Une référence introuvable est retirée, comme aujourd'hui.
  2. **Vraies figures** : `GLHistoryView` coupe le texte aux références de scènes et rend un `GLIllustrationFigure`
     (`src/gl/components/GLFeuilletIllustration.jsx`) entre deux morceaux de texte (pas d'image brute dans le
     markdown). Légende (`figcaption`) = le texte entre crochets de la référence, sinon `recitCaption`, sinon rien ;
     `alt` = la même phrase.
  3. **Mise en page** (classe `gl-history`, bloc de `src/gl/styles/gl-theme.css`) :
     - colonne de texte de 68 caractères au plus, centrée ;
     - figure sur toute la largeur de la colonne, image entière (`object-fit: contain`, jamais rognée), coins
       arrondis 12 px, marge verticale 1,25 rem ; hauteur au plus 55 vh, et 40 vh pour la première figure, pour que
       le titre du chapitre se voie sans défiler sur une tablette 1024 × 768 ;
     - image en portrait (`toundra-hiver-aurores`) centrée, largeur au plus 60 % ;
     - légende centrée, en italique, 0,9 rem, couleur atténuée, 0,4 rem sous l'image ;
     - deux figures qui se suivent (plateau 4) côte à côte à partir de 900 px de large, l'une sous l'autre en
       dessous ; aucun flottant ;
     - `loading="lazy"`, dimensions réservées pour que le texte ne saute pas au chargement.
  4. **Galerie de fin** : si le texte cite au moins une scène, les scènes non citées ne s'affichent pas. S'il n'en
     cite aucune, la galerie reste, en grille de deux colonnes, avec les légendes `recitCaption` et le titre « Images
     du chapitre ».
  5. **Éditeur** : `![…](scene:<nom>)` survit à un enregistrement par l'éditeur riche (qui le réécrit en
     `<img src="scene:<nom>">`) et son aperçu le résout ; test à l'appui. Les deux astuces affichées au prof
     (`GLChaptersAdminView.jsx`, ligne 563 ; `GLChapterScenesAdminPanel.jsx`, ligne 89) disent aussi la forme par nom.
  6. Aucune donnée de la médiathèque ne change : les légendes vivent dans le texte ; le panneau
     `GLChapterScenesAdminPanel` reste le repli.
- **Tests** : utilitaire (`tests-ui/gl/glStorySceneRefs.test.js` : nom, rang, forme HTML, nom inconnu retiré, scène
  `chap5` citée au plateau 4) ; éditeur (`tests-ui/gl/glMarkdownEditorDisplay.test.js`) ;
  `tests-ui/gl/GLHistoryView.test.jsx` (figure et légende ; pas de galerie quand le texte cite des scènes).
- **Critère d'acceptation** : tests verts. Aucune image n'est versionnée : en local, la médiathèque est vide et les
  références sont retirées. Pour les tests d'écran, l'e2e et les captures, fournis des scènes d'essai (fausses clés) ;
  dis-le dans ton rapport.

### contenu-3.3 — « Marquer comme lu », soumis à une question (ex-étape H1 ; cinq commits a à e)

- **Constat vérifié** :
  - `GLHistoryView.jsx` (sous-onglet « Histoire » de « L'aventure ») affiche `gameState.game.story_markdown` et les
    scènes. Aucun bouton. Le plateau vient de `gameState.game.chapter_plateau_number`.
  - Le conditionnement « marquer comme lu par une question » existe pour les espèces, le glossaire, les tutoriels,
    les feuillets, les pages de contenu et les écosystèmes ; liens dans `gl_resource_question_links`, accusés dans
    `gl_learning_acknowledgements`, bouton `src/gl/components/GLLearningAcknowledgeButton.jsx`.
  - Réglages de prod au 23/11 (groupe `gating` ; non relisibles par requête) : `enabled` = true, `default_mode` =
    any, `default_required_correct` = 1, `granularity` = player, `allowed_wrong_attempts` = 0,
    `retry_cooldown_hours` = 1, `cooldown_scope` = resource, `lock_mode` = flow, `announce_on_button` = true,
    `max_questions_per_session` = 3.
  - Lecteurs : un élève sur son compte est `gl_player` ; la tablette d'équipe est un `gl_guest` à session d'équipe
    (`lib/glGameAccess.js`) ; le prof est `teacher`.
  - La question posée est toujours la première par `ORDER BY l.weight DESC, l.question_code ASC`
    (`lib/learningGatingAcknowledge.js`, lignes 88 et 120) : la même pour tous les élèves.
- **Changement attendu** :
  1. **(a) Type** `chapter_story`, référence = numéro du plateau en texte (« 1 » à « 4 »). Liste fermée par
     recherche de `content_page` :

| Fichier › symbole | À faire |
| --- | --- |
| `lib/shared/resourceQuestionGatingCore.js › GL_RESOURCE_TYPES` (ligne 20) | Ajouter `chapter_story` |
| `lib/pedago/gatingProductCatalog.js › GL_MARKABLE` (ligne 29) | Ajouter |
| `lib/shared/learningAckCore.js › LEARNING_TARGET_TYPES` (ligne 32) et `groupLearningAcksByType` (ligne 166) | Ajouter ; `chapter_story_plateaux` |
| `lib/glLearnableResources.js › LEARNABLE_RESOURCE_TYPES` et son résolveur | Ajouter (un chapitre de ce plateau, au récit non vide) |
| `src/gl/components/settings/GLGatingSettings.jsx` (ligne 18) | `{ type: 'chapter_story', label: 'Histoire des chapitres' }` |
| `src/gl/components/admin/GLLearningLinksPanel.jsx › RESOURCE_TYPE_LABELS` | `chapter_story: 'Histoire des chapitres'` |
| `src/gl/utils/glLearningFields.js`, `src/gl/hooks/useGlLearningProgress.js` | `chapter_story` → `chapter_story_plateaux` |

  2. **(a) Route** `POST /api/gl/learning/chapter-story/:plateau` dans `routes/gl/learning.js`, sur le modèle de
     `/glossary/:code` (ligne 381) : `requireGlAuth`, corps `{ confirm: true }`, `handleAcknowledge` avec
     `targetType: 'chapter_story'`, `skipGating` si déjà lu, `resolveTarget` = un chapitre de `gl_chapters` avec ce
     `plateau_number` et un `story_markdown` non vide.
     - **Seul un `gl_player` valide** : tout autre lecteur reçoit 403 « Chacune et chacun valide l'histoire depuis
       son compte. ». Lire l'histoire en classe ne valide rien.
     - **Aucune récompense** : ni gemme, ni badge, ni Lumière, ni regard, ni évènement de partie visible des autres
       équipes.
  3. **(a) État « déjà lu »** : `GET /api/gl/learning/me` renvoie aussi `chapter_story_plateaux: ['1', …]`. Pas
     d'autre route de lecture.
  4. **(b) Écran** (`GLHistoryView.jsx`), sous le texte et les illustrations :
     - compte `gl_player` et plateau connu : `GLLearningAcknowledgeButton` (`acknowledgePath` de la route,
       `resourceType: 'chapter_story'`, `resourceRef` = plateau, `itemTitle` = « l'histoire de ce chapitre », libellé
       « Marquer comme lu », état fait « Histoire lue ✓ »), avec l'avertissement visible de l'étape contenu-3.4 ;
     - tablette d'équipe ou invité : une ligne « Chacune et chacun valide l'histoire depuis son compte. », sans
       bouton ;
     - prof : rien ; chapitre sans plateau (prologue, chapitres de test) : rien.
  5. **Questions** : celles du JSON, liées à l'étape contenu-3.1 (trois par plateau). Un plateau sans lien approuvé
     se valide sans question (comportement actuel du bouton) : garde-le, et teste-le.
  6. **(c) La question tourne.** À poids égal, chaque lecteur a son ordre de départ, mélangé par une graine = lecteur
     + ressource : le même d'un appel à l'autre, différent d'un élève à l'autre. La question posée avance d'un rang
     dans cet ordre à chaque erreur comptée pour la ressource : après une erreur et le délai d'une heure, c'est la
     **suivante**, jamais celle qui vient d'être manquée (avec au moins deux questions posables). Pas de nouveau
     mélange après une erreur : il redonnerait la même question une fois sur trois. Le compte d'erreurs
     (`wrong_attempts`, `lib/learningGatingAcknowledge.js`, vers les lignes 340 et 419) doit survivre à la fin du
     délai : vérifie-le ; sinon, prends pour repère la dernière question manquée (ligne la plus récente du verrou de
     ce lecteur pour cette ressource) et dis-le. Un poids plus fort passe toujours devant. Le client garde son
     `slice` sur l'ordre reçu. Cela vaut pour toutes les ressources de G&L ; ForêtMap garde son ordre.
     `lib/glGatingChapterGranularity.js` (ligne 32) trie de la même façon pour lire une granularité : n'y touche que
     si ton changement d'ordre le fausse, et dis-le.
  7. **(d) Tirages** : une question de catégorie `histoire` ne sert **qu'au** contrôle de l'Histoire. Liste fermée
     par recherche de `gl_qcm_lore_questions` dans `lib` et `routes` :
     - `lib/glMarkerLoreQuestionPool.js › buildLorePoolQueryFilters` (pool des cases, mélangé) : exclure ;
     - `routes/gl/lore.js`, `GET /qcm/questions` (ligne 1397, liste servie aux élèves, où le client pioche) :
       exclure pour un lecteur qui n'est pas du staff G&L ;
     - les autres lecteurs de la table lisent par code, comptent, importent ou administrent : rien à faire
       (`lib/glQcmLoreQuestionQuery.js`, `lib/gl/loreRouteHelpers.js`, `lib/glVoyageur.js`, `lib/glQcmLoreCrud.js`,
       `lib/glQcmLoreImport.js`, `lib/quizQuestionStats.js`, `routes/gl/learning-links.js`, `lib/mcp/*`).
       La présentation par code (`/api/gl/lore/qcm/questions/:code/present`) ne change pas.
  8. **Suivi du prof** : `lib/learningGatingProgress.js` ne compte les lectures que pour ForêtMap (`countFmRead`).
     N'ajoute pas de vue ; dis-le dans ton rapport.
  9. **(e) Épilogue réservé au prof** : le chapitre `toundra-arctique` (« Épilogue — Le bout du monde », id 7 en
     prod, sans plateau) se lit en classe par le prof en juin. Son `story_markdown` n'est **jamais servi à un lecteur
     qui n'est pas du staff G&L** : vide dans `routes/gl/chapters.js › readChapterFull` (ligne 247) et dans l'état de
     partie (`lib/gl/gamesRuntime.js`, ligne 251) pour un `gl_player` ou un `gl_guest`. Liste nommée
     `CHAPITRES_RECIT_PROF_SEUL = ['toundra-arctique']`, commentée « garde-fou : chute sans bataille et renversement
     spatial jamais révélés aux élèves ». Ne change pas son texte. Ferme de même `lib/glPlayerJournal.js` (ligne
     288 : la carte « chapitre » du journal d'un élève montre un extrait du récit ; pour ce chapitre, pas d'extrait).
     Les autres lecteurs de `story_markdown` dans `lib` et `routes` sont des imports ou l'administration
     (`lib/glChaptersImport.js`, `lib/glChapterCharteImport.js`, `lib/mediaLibraryUsage.js`) : rien à faire.
- **Tests** :
  - `tests/gl-learning-chapter-story.test.js` : `gl_player` après bonne réponse → accusé ; `gl_guest` d'équipe → 403 ;
    `teacher` → 403 ; déjà lu → aucune question ; plateau inconnu → 404 ; plateau sans lien → validé sans question ;
    `GET /me` renvoie `chapter_story_plateaux` ;
  - rotation : même question pour un même lecteur sur deux appels ; deux lecteurs → questions différentes sur un
    échantillon ; un poids 2 sort avant un poids 1 ; après une erreur et le délai, la question posée n'est pas celle
    qui vient d'être manquée ; trois erreurs de suite → trois questions différentes ;
  - `tests-ui/gl/GLHistoryView.test.jsx` : bouton pour un élève, ligne pour la tablette, rien pour le prof ;
  - tirages : une question `histoire` n'est jamais tirée par le pool des cases ni servie par la liste aux élèves ;
  - épilogue : `gl_player` et `gl_guest` reçoivent un récit vide, le prof le texte entier ;
  - `tests/gating-products.test.js`, `tests/learning-gating-products-characterization.test.js` et son relevé : le
    nouveau type.
- **Critère d'acceptation** : tests verts des deux côtés (G&L et ForêtMap) ; `docs/API.md` décrit la route et
  `chapter_story_plateaux`.

### contenu-3.4 — Le délai d'une heure, annoncé avant et après (ex-étape H2)

- **Constat vérifié** :
  - Avant le clic : `src/shared/components/LearningAcknowledgeButton.jsx › buildButtonAnnounce` (ligne 30) pose une
    pastille « 1 question » ; l'avertissement n'est que dans l'attribut `title` (infobulle), invisible sur une
    tablette. Bloqué : pastille 🔒, l'explication encore en infobulle.
  - Introduction du contrôle (`src/shared/utils/learningGatingChallengeClient.js › buildGatingQuizIntroMessage`,
    ligne 187) : « Attention : une erreur bloquera la validation pendant 1 h. »
  - Après une erreur : le serveur répond « Une erreur a été commise : réessaie dans 1 h pour valider cette
    ressource. » (`lib/learningGatingAcknowledge.js`, vers la ligne 420 ; repris comme retour par
    `LearningGatingQuestionPanel`, ligne 119) ; puis `buildCooldownLockMessage` (ligne 100), sous le titre « Réessaie
    plus tard » (`LearningAcknowledgeButton.jsx`, ligne 431).
- **Changement attendu, côté G&L seulement** : une option `voix: 'gl'` portée par `GLLearningAcknowledgeButton` et
  `createGlGatingHandlers` (ligne 63), lue par les fabriques de textes ; côté serveur, le message du verrou suit le
  produit (`gl`). Elle vaut pour **toutes** les ressources conditionnées de G&L (glossaire, espèces, tutoriels,
  feuillets, pages de biome, Histoire).
  1. **Avant de répondre**, sous le bouton, en texte visible (pas en infobulle), petit et discret :
     - Histoire : « 1 question sur ce que tu viens de lire. Si tu te trompes, tu pourras réessayer dans 1 heure. » ;
       ailleurs : « 1 question avant de valider. Si tu te trompes, tu pourras réessayer dans 1 heure. » ;
     - le délai vient du serveur (`retry_cooldown_hours`), écrit en toutes lettres (« 1 heure », « 2 heures »,
       « 30 minutes ») ; délai 0 : « Si tu te trompes, tu peux réessayer tout de suite. »
  2. **Introduction du contrôle** : « Prends ton temps : si tu te trompes, tu pourras réessayer dans 1 heure. » à la
     place de « Attention : une erreur bloquera la validation pendant 1 h. » La phrase d'annonce d'Olu reste.
  3. **Après une mauvaise réponse** : le verdict « Pas encore » (déjà affiché à part), puis le retour de la question
     (sa piste), puis « Relis le texte : tu pourras réessayer à 15 h 42. » (heure du jour de l'appareil, calculée
     depuis l'échéance renvoyée par le serveur). Message serveur en G&L : « Pas encore. Relis la page : tu pourras
     réessayer dans 1 heure. » (portée ressource) ou « Pas encore. Cette question reviendra plus tard. » (portée
     question). Le titre « Réessaie plus tard » devient « Pas encore ». Plus jamais « Une erreur a été commise ».
  4. **Pendant le délai**, sur la page : le bouton est **absent** (pas grisé), remplacé par « Pas encore validé. Tu
     pourras réessayer à 15 h 42. » Le bouton revient seul à l'échéance (minuterie, sans rechargement).
  5. **Aucun réglage ne change** : `retry_cooldown_hours` reste 1 et `allowed_wrong_attempts` reste 0. Le délai ne
     coûte rien en jeu : ni gemme, ni case, ni page.
- **Tests** : fabriques de textes en voix G&L et en voix ForêtMap (ForêtMap inchangé, des deux côtés) ;
  avertissement visible dans le DOM ; message serveur G&L sans « erreur » ; heure affichée après une erreur ; retour
  du bouton à l'échéance (minuteries simulées) ; délai 0 et tolérance 2.
- **Critère d'acceptation** : `tests-ui/shared/*` et `tests/learning-gating-*.test.js` (ForêtMap) verts sans avoir
  changé un attendu ForêtMap ; e2e de la section 7 vert.

## 5. Migration

**Étiquette `mig-histoire`**, idempotente, données seulement. Tables : `gl_chapters`,
`gl_qcm_lore_scopes`, `gl_qcm_lore_categories`, `gl_qcm_lore_questions`, `gl_resource_question_links`.

1. `UPDATE gl_chapters SET story_markdown = <texte du JSON> WHERE plateau_number = N AND story_markdown LIKE
   '%<garde_ancien_texte>%'`, pour N = 1 à 4. Les gardes sont dans le JSON : « votre première arme contre
   l'Effacement » (1), « Premier soupçon que les deux mondes sont liés » (2), `il vient du *sud*` (3, avec ses astérisques), « fuyant
   quoi ? » (4). Si une garde ne trouve rien, la migration n'écrit pas : c'est voulu.
2. `INSERT IGNORE` des scopes `ch1` à `ch4` dans `gl_qcm_lore_scopes` (`slug`, `nom`, `plateau`, `order_index` ;
   noms du classeur de lore du dépôt : « Tropiques africains », « Aride chaud », « Tempéré atlantique », « Eurasie
   continentale » ; `description` vide).
3. **Catégorie d'abord** : `INSERT IGNORE INTO gl_qcm_lore_categories (slug, nom, emoji, description, order_index)
   VALUES ('histoire', 'Histoire des chapitres', NULL, 'Questions du contrôle « Marquer comme lu » de la page
   Histoire ; jamais tirées au hasard', 90)`.
4. Les 12 questions dans `gl_qcm_lore_questions` (`LQCM0358` à `LQCM0369`), avec les champs de `questions_communes`,
   `numero_dans_categorie` = rang dans le plateau (1 à 3) et `reponse_texte` = texte du bon choix. **Pas
   d'`INSERT IGNORE` ici** : il avale aussi les violations de clé étrangère, et une question perdue en silence
   laisserait un lien vers rien. Écris `INSERT … ON DUPLICATE KEY UPDATE question_code = question_code`.
5. `INSERT IGNORE` des 12 liens dans `gl_resource_question_links` (gabarit `liens` du JSON : `qcm_lore`,
   `chapter_story`, plateau en texte, `is_gating` 1, poids 1, `origin` `manual`, `status` `approved` ; clé unique
   `uq_glrql`).

| | État |
| --- | --- |
| Prod au 24/11 | Les quatre gardes tiennent (chapitres 3, 4, 5, 6, une phrase chacun, nulle part ailleurs). Catégorie `histoire` absente. Scopes `ch1` à `ch4` présents (le point 2 n'y écrit rien). `LQCM0358` à `LQCM0369` libres, aucun lien vers eux. Si un code est pris d'ici la fusion : les suivants libres **après `LQCM0405`**, et aligne le JSON. |
| Base neuve | `gl_qcm_lore_scopes` est vide (les scopes ne viennent que de l'import du classeur de lore) : sans le point 2, l'insertion des questions échouerait sur la clé étrangère et arrêterait le démarrage. Les quatre `UPDATE` n'y écrivent rien (pas d'ancien texte) : les récits n'y sont pas posés, dis-le dans ton rapport. |

Rien d'autre de ce lot n'est passé en prod par le connecteur : pas de donnée à ne pas refaire. Le numéro de fichier se
prend à la fin (règles communes, section 6).

## 6. Données et sources

| Fichier de `docs/prompts/gl-decisions/sources/` | Où va son contenu |
| --- | --- |
| `histoire-chapitres.json` | Copie mot pour mot en `data/gl/histoire/histoire-chapitres.json` ; textes, questions et liens repris par la migration `mig-histoire` |

## 7. Vérifications propres au lot

- E2E `e2e/gl-histoire.spec.js`, sous le verrou, avec un compte d'élève : figures légendées et avertissement au
  plateau 1 ; une mauvaise réponse affiche « Pas encore », la piste et l'heure ; une heure plus tard (horloge
  simulée), une **autre** question, et une bonne réponse donne « Histoire lue ✓ » ; la tablette d'équipe voit la
  ligne, pas le bouton.
- Tests ForêtMap du conditionnement : verts, attendus inchangés.
- Banc, régime fumée, une passe à la fin.
- Relecteurs : `gl-relecteur-garde-fous` et `gl-relecteur-science` sur le JSON et sur les textes d'écran.
- Captures (`docs/captures/gl-decisions/contenu-3/`) : Histoire des plateaux 1 et 4 à 1024 × 768 et à 390 px ;
  l'avertissement sous le bouton ; l'écran après une mauvaise réponse ; la page pendant le délai.

## 8. Contrats de test changés

- Textes d'avertissement et de délai du conditionnement en voix G&L ; message serveur du verrou en G&L ; titre « Pas
  encore » au lieu de « Réessaie plus tard ».
- Ordre des questions à poids égal : propre à chaque lecteur, et qui tourne après une erreur (G&L).
- Réponse de `GET /api/gl/learning/me` (`chapter_story_plateaux`) ; liste des types de ressource (relevé
  `learning-gating-products.golden.json`).
- Rendu des scènes de l'Histoire : figures, légendes, plus de galerie quand le texte cite des scènes.
- `story_markdown` vide pour un élève sur le chapitre `toundra-arctique`.
- La liste `GET /api/gl/lore/qcm/questions` ne sert plus la catégorie `histoire` aux élèves.

## 9. Docs à mettre à jour dans ce lot

- `docs/API.md` : `POST /api/gl/learning/chapter-story/:plateau` ; `chapter_story_plateaux` dans
  `GET /api/gl/learning/me` ; `story_markdown` de l'épilogue selon le lecteur.
- `changelog.d/gl-decisions-contenu-3.md`.
- Pour le § 0 des règles (à recopier dans ton rapport) : « 23/11 : l'Histoire de chaque chapitre se valide par chaque
  élève, depuis son compte, avec une question ; le délai d'une heure après une erreur est annoncé » ; « 24/11 : après
  le délai, la question change ».
- Dans « Ce que les lots suivants doivent savoir », ce que le lot fin-2 doit écrire : élève seul, une question, délai
  annoncé, question qui tourne, épilogue réservé au prof, `scene:<nom>` pour qui édite un récit. Ne réécris pas les
  docs de référence.

## 10. Hors périmètre

- Le texte de l'épilogue (`gl_chapters` id 7 en prod) et du prologue (id 1) : ils restent ceux d'Oliv.
- Les réglages du conditionnement (délai, tolérance, mode) et les légendes de la médiathèque.
- « Selene » sans accent dans le carnet et dans les questions de lore : lot contenu-4.
- Le filtre du lexique et les notes d'auteur dans `routes/gl/lore.js` : lot contenu-5. Les marges du copiste : lot
  contenu-6.
- Une vue de suivi des lectures côté G&L.
- Les docs de référence : lot fin-2.

## 11. Pour Oliv

**À relire**

- Les quatre récits et les douze questions (`data/gl/histoire/histoire-chapitres.json`), dans l'éditeur, après le
  déploiement. L'ancien texte disait qu'un point était « laissé à Oliv » sans dire lequel (phrase coupée) : relis en
  priorité les légendes et la liste `changements` de chaque chapitre.
- Les textes d'avertissement et de délai (étape contenu-3.4), qui valent pour toutes les ressources de G&L.
- Lire l'Histoire ne donne rien, pas même au regard du voyageur : à confirmer.
- La migration crée les scopes `ch1` à `ch4` sur une base neuve, avec les noms du classeur de lore.

**À faire après la vague**

- Aucune synchronisation : la migration suffit. Si une garde n'a rien trouvé (texte déjà changé dans l'éditeur), le
  récit de ce plateau est à recoller à la main depuis le JSON.
- Ouvrir l'Histoire du plateau 1 avec un compte d'élève de la classe de démonstration : images et légendes,
  avertissement, une mauvaise réponse (« Pas encore », l'heure), puis une bonne réponse une heure plus tard (une
  autre question que la première) ; la même page depuis la tablette d'équipe.
- **Ne plus réimporter les chapitres depuis un tableur avec une colonne « histoire » remplie**
  (`lib/glChaptersImport.js` réécrit `story_markdown`) : les textes d'avant reviendraient, avec leurs fautes de
  garde-fou. Un réimport du classeur de lore, lui, ne supprime aucune question.
