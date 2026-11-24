# Lot contenu-5 — Lexique du voyage, pages servies, vitrine, « +1 » du journal, traces de passage

> Chantier G&L « décisions » · vague 2 · couloir contenu · charge forte · banc : fumée
> Branche : `claude/gl-decisions-contenu-5` · Attend : contenu-4, ecrans-4, ecrans-6 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- Le lexique du voyage ne montre à un élève que les mots de son monde et des mondes déjà traversés. Les notes
  d'auteur d'une fiche ne se lisent plus que chez le prof.
- La vitrine des invités montre le premier monde, sans message d'administration.
- Dans « Mon journal », un article qui compte fait monter le « +1 regard du loin », avec sa pastille et son son.
- Sur une fiche d'espèce ou une page du carnet, l'élève lit combien de membres de la caravane sont déjà passés.
- « Mon sac » remplace « Le Seuil » dans trois catalogues et dans la page « Les règles du jeu » ; une base neuve
  reçoit la page des règles d'aujourd'hui.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| I4 de l'addendum 2 | 24/11, 11 h 41 (prise avec la décision 39 de l'addendum 4) | Le lexique du voyage ne montre à un élève que les termes de son monde ou des mondes déjà traversés (`chapitre_scope`) : plus de nom de visage avant son plateau. | — |
| I7 de l'addendum 2 | 24/11, 11 h 41 | Les pages servies aux élèves disent le jeu d'aujourd'hui : « Les règles du jeu », l'« Introduction », les grimoires de chapitre. | — |
| I8 de l'addendum 2 | 24/11, 11 h 41 | La vitrine des invités montre le premier monde, aucun message d'administration ; l'écran de connexion montre l'image d'accueil de la marque. | — |
| QV5 de l'addendum 1 | 24/11, 12 h 01 et 12 h 14 | Le lexique lore est réécrit dans les garde-fous (33 fiches, fait en prod). « Le corbeau de Sélène » reste tel quel. Il reste à fermer côté code les notes d'auteur que la fiche sert à tout le monde. | « pas grave pour le corbeau » ; « Ok » |
| Décision 35 de l'addendum 4 | 24/11, 11 h 50 | L'Éclaireuse ou l'Éclaireur fouille ; l'Opératrice ou l'Opérateur répond à la question de case. (Elle corrige une phrase de la page des règles.) | — |
| « +1 » de « Mon journal » | 24/11, 13 h 53 | À l'enregistrement d'un article, si le compte du journal monte, la réponse porte `voyageurGain` ; la pastille et le son suivent. Règle existante, rendue visible. Aucune migration. | « ok » |
| Traces de passage | 24/11, 13 h 53 | Sur une fiche d'espèce ou une page, combien de membres de la caravane sont déjà passés. Comptage sur `gl_learning_acknowledgements`, limité à la classe ; aucune table ; jamais de prénom ni de score ; rien en projection. | « ok » |
| « Mon sac » | 24/11, 14 h 16 | « Mon sac » remplace « Le Seuil » comme nom de l'espace personnel de l'élève (« ton sac » dans une phrase). Le code ne se renomme pas. Un test de vocabulaire refuse « Seuil » comme nom d'écran dans les textes d'élève (le récit garde le nom commun). | « il faut renommer le module de l'app qui s'appelle le seuil. Cela est source de confusion et contredit le passage d'un plateau à un autre » ; « Je valide » |

**Choix par défaut posés par Claude** (Oliv peut les retirer ; liste-les dans ton rapport) :

- Lexique du voyage : visibilité par le plateau le plus avancé des parties de l'élève. Aucun réglage nouveau ; le
  plafond `gameplay.lore_spoiler_max_level` garde son rôle.
- Les notes d'auteur restent en base (le prof en a besoin) ; elles sont seulement retirées de la réponse et de
  l'écran d'un élève. Les variantes des fiches (« le carnet mourant », « la boîte de l'Ancien ») ne sont pas touchées.
- Image d'accueil : cadrage 21/9, hauteur au plus 28 vh, `alt=""`.
- **Ajouts de cette fiche** (à retirer si Oliv le veut) :
  - `chapitre_scope` : `0` se lit comme `tous` ; `fin`, et toute valeur qui n'est ni un nombre ni `tous`, ne se montre
    qu'au prof ; une partie `draft` ne compte pas dans « le plateau le plus avancé » ;
  - traces : le lecteur ne se compte pas lui-même ; la trace ne s'affiche que sur le compte d'un élève ; « une page »
    = une page du carnet (`feuillet`), pas une page de contenu ;
  - le gain du journal garde la forme existante de `voyageurGainFor` : `{ proche: 0, loin: 1 }` ;
  - « Mon sac » : les trois textes de l'étape contenu-5.7 et les deux de la page des règles (étape contenu-5.3).

## 3. Fichiers

**À toi**

- `routes/gl/lore.js` (routes `/glossary`, `/glossary/link-index`, `/glossary/:code`, `loadLoreGlossaryLookupForQcm`
  seulement) : **modifié avant toi par contenu-2, contenu-3 et contenu-4**. Revérifie les lignes par `git grep -n`.
- `lib/glLoreGlossaryMatch.js`
- `routes/gl/learning.js`, `routes/gl/player-journal.js`, `lib/glVoyageur.js` (un compteur exporté, rien d'autre)
- `data/gl/tenir/olu-lignes.json`, `data/gl/tenir/parures.json`, `data/gl/tenir/exemple/parures.json`,
  `data/gl/tenir/reglages-defaut.json`, `data/gl/tenir/README.md`
- `tests/gl-player-journal.test.js`, `tests/gl-voyageur-suite.test.js`, `tests-ui/gl/GLLoreGlossaryPopover.test.jsx`,
  `tests-ui/gl/useGlGameRuntime.test.jsx`, `tests-ui/gl/GLSpeciesCatalog.test.jsx`, `tests-ui/gl/GLAuthView.test.jsx`,
  `tests-ui/gl/GLSpeciesDetailModal.test.jsx`, `tests-ui/gl/GLSeleneCarnetView.test.jsx` (à faire suivre)

**Nouveaux**

- `migrations/<nnn>_gl_pages_servies.sql` (étiquette `mig-pages-servies`)
- `tests/gl-migration-pages-servies.test.js`, `tests/gl-lore-glossary-monde.test.js`,
  `tests/gl-learning-traces.test.js`, `tests/content/gl-lexique-lore.test.js`
- `src/gl/components/GLTracePassage.jsx`, `tests-ui/gl/GLTracePassage.test.jsx`
- `changelog.d/gl-decisions-contenu-5.md`, `docs/prompts/gl-decisions/rapports/contenu-5.md`

**D'un autre couloir, modification minimale permise**

| Fichier | Ce que tu y fais exactement |
| --- | --- |
| `src/gl/components/GLLoreGlossaryPopover.jsx` | Les lignes « Rôle récit : » et « Correspondance réelle : » (l. 116-125) ne s'affichent que pour le staff. |
| `src/gl/hooks/useGlGameRuntime.js` | Choix du chapitre d'un invité (l. 147). |
| `src/gl/components/GLSpeciesCatalog.jsx` | Le message de la l. 199-202. |
| `src/gl/components/GLAuthView.jsx` | Image d'accueil, **seulement si elle manque** (étape contenu-5.4). Modifié avant toi par ecrans-6 (deux chaînes). |
| `src/gl/components/GLSpeciesDetailModal.jsx` | Monter `GLTracePassage` près du bouton « Marquer comme appris » (l. 267). Modifié avant toi par ecrans-4 (lecture seule sur tablette). |
| `src/gl/components/GLSeleneCarnetView.jsx` | Monter `GLTracePassage` près du bloc `GLLearnAndImport` (l. 340). Modifié avant toi par ecrans-6. |
| Le test de vocabulaire posé par ecrans-6 (`tests/content/gl-mots-du-voyage.test.js`, ou celui de « Mon sac ») | Y ajouter `GLTracePassage.jsx` et les champs visibles des trois catalogues. S'il n'existe pas : écris `tests/content/gl-mon-sac-catalogues.test.js` et dis-le. |
| `docs/API.md` | Lexique selon le lecteur ; `GET /api/gl/learning/traces/…` ; `voyageurGain` du journal. |
| `docs/GL_TENIR_A_DEUX_REGLES.md` (§ 1, hors § 0) | Une phrase : les notes d'auteur du lexique sont réservées au prof. |

**Ne touche pas**

| Fichier | Lot qui le modifie |
| --- | --- |
| `src/gl/constants/app-runtime.js`, `src/gl/constants/tenirTextes.js`, `src/gl/components/tenir/GLTeamSessionView.jsx` (libellé de l'onglet, phrase « Le Marché et le Seuil… » des écrans) | ecrans-6 (SAC-1) |
| `src/gl/constants/glDiscoveryTour.js`, `src/gl/context/GLTourContext.jsx`, `src/gl/styles/gl-theme.css` | ecrans-6 |
| `src/gl/components/GLSeuilView.jsx` | contenu-6, puis ecrans-8 (SAC-2) |
| `src/gl/components/GLSpellCatalog.jsx` | personne (section 11) |
| `data/gl/tenir/sorts.json`, `missions.json`, `peripeties.json`, `defis-cases.json` | contenu-1 (déjà passés) |
| `docs/reference/gl/*.md` (« Le Seuil » y reste jusque-là), § 0 des règles | fin-1, fin-2 |

## 4. Étapes (un commit par étape, dans cet ordre)

### contenu-5.1 — Le lexique du voyage filtré par monde (ex-étape V2)

- **Constat vérifié** :
  - `GET /api/gl/lore/glossary` (`routes/gl/lore.js` l. 748) et l'index des liens automatiques ne filtrent que le
    tiers `secret` et le plafond `gameplay.lore_spoiler_max_level`. La colonne `chapitre_scope` n'est appliquée que si
    le client la demande (`req.query.chapitreScope`, l. 766 ; `lib/glLoreGlossaryMatch.js › filterLoreGlossaryList`
    l. 144, test l. 153), et `src/gl/components/GLLoreGlossaryView.jsx` ne la demande jamais. Résultat : dès le
    plateau 1, l'élève lit les noms des quatre visages.
  - La règle unique est `isLoreTermVisibleToAudience(row, { isMj, maxSpoilerLevel })` (l. 134). **Cinq chemins**
    l'appellent : la liste (l. 748) ; l'index `/glossary/link-index` (l. 786) ; la fiche `/glossary/:code` (l. 808) ;
    ses termes liés (l. 833-850) ; les termes joints aux questions de lore (`loadLoreGlossaryLookupForQcm`, l. 1348,
    non cité par l'ancien texte). La liste et la fiche lisent `chapitre_scope` ; l'index, les termes liés et les termes
    joints aux questions ne le lisent pas.
  - `/admin/glossary/terms` (l. 1261) est au staff : il ne change pas.
  - Prod au 24/11 : la Grise = `2`, le Silence = `3`, le Détricotage et l'Effacement = `4`. Autres valeurs : `tous` ;
    `0` (`LR0020`, `LR0025`, `LR0026`, `LR0028`) ; `fin` (`LR0033` « l'étoile fixe du nord », niveau `cle`, non
    secrète) ; `MJ` (fiches secrètes seulement). **La fiche « les quatre visages » (`LR0046`) est de portée `tous`** :
    le filtre ne la masque pas. « Le corbeau de Sélène » (`LR0019`) est accentué, de niveau `recit`, de portée
    `tous` : **il reste tel quel** (décision QV5), il n'y a rien à lister.
  - `requireGlAuth` refuse tout invité (403 `guestBlocked`, `middleware/requireGlAuth.js` l. 149-154) : sur main, une
    tablette d'équipe ne lit aucune de ces routes. Regarde si le lot ecrans-4 (piste sur la tablette) en a ouvert une.
  - Aucune fonction ne donne « le plateau le plus avancé des parties d'un élève » : elle est à écrire
    (`gl_team_members` → `gl_games` → `gl_chapters.plateau_number`).
  - Valeur de `gameplay.lore_spoiler_max_level` en prod : non vérifiée.
- **Changement attendu** :
  1. Pour un lecteur qui n'est pas du staff G&L, un terme n'est visible que si `chapitre_scope` vaut `tous`, `0` ou
     est vide, ou vaut un numéro de plateau **inférieur ou égal au plateau le plus avancé** de ses parties (élève :
     ses parties, hors `draft` ; tablette d'équipe, si une route lui est ouverte : la partie de la session,
     `req.glAuth.gameId`). Sans partie : seuls `tous`, `0` et vide.
  2. Côté serveur, **dans les cinq chemins** : pose la règle dans `isLoreTermVisibleToAudience` (un champ de plus
     dans l'audience) et ajoute `chapitre_scope` aux `SELECT` qui ne le lisent pas. Le prof voit tout.
  3. Aucun réglage nouveau ; le plafond `lore_spoiler_max_level` garde son rôle.
- **Textes** : aucun.
- **Tests** (`tests/gl-lore-glossary-monde.test.js`, sur la route) : élève au plateau 1 → ni « Grise », ni
  « Silence », ni « Détricotage », ni « Effacement » dans la liste, l'index et une fiche liée ; élève au plateau 2 →
  « Grise » seulement ; prof → tous ; une fiche de portée `0` visible de tous ; une fiche de portée `fin` visible du
  prof seul ; élève sans partie → aucun visage.
- **Critère d'acceptation** : tests verts ; capture du lexique d'un élève au plateau 1 ; `docs/API.md` dit le filtre.

### contenu-5.2 — Le lexique ne sert plus les notes d'auteur aux élèves (ex-étape QV5)

- **Constat vérifié** (code de `b8b5344`, base de prod du 24/11 à 12 h 15) : `GET /api/gl/lore/glossary/:code`
  (`routes/gl/lore.js` l. 808-860 ; `SELECT` l. 817-820) renvoie à tout lecteur `role_recit`,
  `correspondance_reelle` et `source` ; `src/gl/components/GLLoreGlossaryPopover.jsx` (l. 116-125) les affiche sous
  « Rôle récit : » et « Correspondance réelle : ». Ce sont des **notes d'auteur pour le prof**, et elles disent ce que
  le jeu tait (« le Souffle » → « Le réchauffement rapide d'origine humaine… » ; « le Passeur » → « garant du
  non-dit » ; « la boîte » → « la clé de la chute »). 38 fiches non secrètes ont ces notes ; les 15 fiches de niveau
  `cle` sont lisibles par les élèves aujourd'hui. La liste et l'index ne servent pas ces colonnes.
- **Changement attendu** :
  1. **Serveur** : dans `GET /glossary/:code`, pour un lecteur qui n'est pas du staff G&L (`isMj(req)` faux), la
     réponse ne contient ni `role_recit`, ni `correspondance_reelle`, ni `source`. Le staff les reçoit toujours.
     Vérifie que la liste et l'index ne les servent pas (au 24/11 : non) ; dis-le.
  2. **Écran** : `GLLoreGlossaryPopover.jsx` n'affiche ces deux lignes que si le lecteur est du staff (prop existante
     ou nouvelle, au plus simple) ; un élève ne voit que le terme, les deux définitions et les termes liés.
  3. **Test de route** : élève (`gl_player`) → réponse sans les trois champs ; prof → avec. Tablette d'équipe
     (`gl_guest`) : si la route la refuse (403 `guestBlocked`, cas de main), le test attend ce refus et ton rapport
     le dit ; si ecrans-4 l'a ouverte, le test attend la fiche sans les trois champs.
  4. **Test de contenu** `tests/content/gl-lexique-lore.test.js` (sur la base quand elle est là, vrai `t.skip`
     sinon), pour chaque fiche active de niveau autre que `secret`, sur `terme`, `definition_courte` et
     `definition_complete` :
     - aucune de ces chaînes (minuscules, sans accents, mots entiers) : « sud », « derriere », « tiede »,
       « tiedeur », « lies », « legs », « grondement », « chute », « terrasser », « eclat de verre »,
       « retournement », « c'est nous », « kra », « kraa » ; aucun « Selene » sans accent (sensible aux accents) ;
       aucun « +1 » ;
     - une fiche de `chapitre_scope` numérique N (ou `tous`, `0`) ne nomme pas un visage dont le monde est après N :
       la Grise (2), le Silence (3), le Détricotage (4), l'Effacement (4), sauf la fiche du visage elle-même ;
     - message d'échec en français : code de la fiche, champ, mot.

     S'il échoue sur une base, ne corrige aucune donnée : écris-le dans ton rapport. (Simulé en prod le 24/11 : il
     passe ; `LR0010` « le cerf des forêts », de portée 3, nomme un visage : admis si c'est le Silence.)
- **Textes** : aucun.
- **Tests** : ci-dessus ; `tests-ui/gl/GLLoreGlossaryPopover.test.jsx` aligné (élève sans les deux lignes, staff avec).
- **Critère d'acceptation** : tests verts ; règles § 1 et `docs/API.md` à jour.

### contenu-5.3 — Les pages servies : base neuve et « Mon sac » (ex-étape V4, retaillée)

L'ancienne étape faisait sept écritures gardées par l'ancien texte. **Elles sont toutes en prod depuis le 24/11**
(aucune garde ne tient), et **les anciens textes ne sont pas dans le dépôt**. La migration change donc de but.

- **Constat vérifié** :
  - `gl_content_pages` (`migrations/080_gl_foundations.sql` l. 51-57) : `slug`, `title`, **`body_markdown`** (pas
    `content`), `updated_by`, `updated_at`.
  - **Ce qu'une base neuve reçoit aujourd'hui** : la migration 080 (l. 59-86) pose `world`, `rules` et `spells`
    (`updated_by = 'seed'`, `ON DUPLICATE KEY UPDATE`) ; la migration 168 (l. 6) pose `deux-peuples`
    (`INSERT IGNORE`). **Aucune autre migration n'écrit cette table.** Sur une base neuve, `rules` vaut donc le titre
    « ## Règles essentielles » et quatre lignes numérotées, dont la première est « Le Maître du Jeu (MJ) pilote la
    partie. » : un texte d'avant, avec « MJ » et « partie ». `world` vaut deux phrases de bienvenue : aucune des deux
    phrases à remplacer n'y est.
  - `gl_chapters` sur une base neuve : le seul chapitre `foret-magique` (migration 081, l. 105). Les chapitres des
    quatre mondes (`tropiques-africains`, `aride-chaud`, `tempere-atlantique`, `eurasie-continentale` ; épilogue
    `toundra-arctique`) viennent d'un import ou d'un instantané : la migration ne les trouve pas.
  - Les phrases de garde de l'ancienne étape (« s'en prendre à lui-même », « À chacun sa voie », « une arme que vous
    n'attendiez pas ») ne sont dans aucun fichier du dépôt ; « un cœur pour les Gnomes » et « Le grimoire complet est
    consultable » ne sont que dans `data/gl/sim/contenu-prod-2026-11-07.json`.
  - Prod au 24/11 : `rules` porte le texte de `sources/pages-servies.md` (I.1), avec la section « ## Le Seuil ». Sa
    phrase des rôles est corrigée par la migration `mig-regles-roles` du lot moteur-2 (vague 1, donc avant toi).
- **À vérifier par toi, avant d'écrire** :
  1. `git grep -n gl_content_pages -- migrations` : toujours 080 et 168 seulement (plus `mig-regles-roles`).
  2. Sur ta base de dev, après `npm run db:init` :
     `SELECT slug, updated_by, LEFT(body_markdown, 80) FROM gl_content_pages` ; note la réponse dans ton rapport.
  3. Ce que `mig-regles-roles` fait sur une base neuve (attendu : rien, sa garde ne tient pas) et son numéro : le
     tien sera plus haut.
  4. Comment la page se rend (`src/gl/components/GLContentPage.jsx`) : un retour à la ligne simple fait-il un saut ?
- **Changement attendu** : migration idempotente `mig-pages-servies`, quatre blocs, dans cet ordre.

  | Bloc | Écriture | Garde | En prod | Base neuve |
  | --- | --- | --- | --- | --- |
  | A | `rules` : `body_markdown` = le texte I.1 de `sources/pages-servies.md` (le contenu de son bloc de code, sans les clôtures) | l'ancien texte contient « Le Maître du Jeu (MJ) pilote la partie » | rien | pose la page |
  | B | `world` : les deux remplacements I.2 (`REPLACE`) | chaque phrase exacte d'avant | rien | rien (la semence n'a pas ces phrases) |
  | C | `gl_chapters.sortileges_markdown` des quatre mondes, **par `slug`** (les ids 3 à 6 sont ceux de la prod) : le gabarit I.3, avec le titre et la phrase du monde ; épilogue (`toundra-arctique`) : retire la ligne « > Le grimoire complet est consultable dans l'onglet \*\*Sortilèges\*\*. » | l'ancien texte contient « un cœur pour les Gnomes » ; épilogue : la ligne est là | rien | rien (chapitres absents) |
  | D | `rules` : `REPLACE` de « ## Le Seuil » par « ## Mon sac », et de « Le Seuil est ton espace à toi » par « Ton sac est ton espace à toi » | le texte contient « ## Le Seuil » | **renomme la section** | renomme la section posée par A |
  - En prod, **seul le bloc D écrit**. Sur une base neuve, A puis D : le dépôt donne la même page que la prod.
  - Pose chaque paragraphe et chaque puce de I.1 sur **une seule ligne** : les retours à la ligne du fichier source
    ne sont que du pliage. Les deux fragments du bloc D tiennent sur une ligne : ils ne dépendent pas du pliage.
  - Les blocs B et C ne servent qu'une base qui porterait encore les textes d'avant le 24/11 (sauvegarde ancienne).
  - **Sans objet, ne les écris pas** : la zone nommée « Zone » (colonne `label` de `gl_kingdom_zones`) devenue
    « Savane africaine », les cases de camp 41 et 76 (colonne `description` de `gl_chapter_markers`), l'ordre des
    chapitres `test` et `foret-magique` (990 et 980), le terme « moor » (`GL0167`) : faits en prod, et leurs lignes
    n'existent pas sur une base neuve.

- **Textes** : `docs/prompts/gl-decisions/sources/pages-servies.md` (lis son encadré de tête : la phrase des rôles y
  est déjà corrigée). Section renommée, mot pour mot : intitulé « ## Mon sac » ; première phrase « Ton sac est ton
  espace à toi : ton expédition, tes défis, tes sortilèges, tes badges, et ce que tu peux faire entre deux séances. »
- **Tests** (`tests/gl-migration-pages-servies.test.js` ; il rejoue le fichier, pose ses propres lignes d'avant et
  remet la table en état) :
  - `rules` à la semence 080 → le texte I.1, avec « l'Éclaireuse ou l'Éclaireur montre l'endroit », la section
    « ## Mon sac », sans « Le Seuil », sans « MJ » ;
  - `rules` comme en prod (I.1 avec « ## Le Seuil ») → seuls l'intitulé et la première phrase changent ;
  - `rules` réécrite à la main (ni semence, ni « ## Le Seuil ») → intacte ;
  - `world` et grimoires avec leurs anciens textes → remplacés ; sans eux → intacts ;
  - deuxième passage sans effet.
- **Critère d'acceptation** : tests verts ; le sous-agent `gl-relecteur-garde-fous` a relu `sources/pages-servies.md`.

### contenu-5.4 — La vitrine des invités et l'accueil (ex-étape V5)

- **Constat vérifié** :
  - `src/gl/hooks/useGlGameRuntime.js` l. 147 : pour un invité, `const first = chaptersData[0]`, le premier chapitre
    de `/api/gl/chapters`, trié par `order_index`. **En prod, l'ordre est déjà corrigé** depuis le 24/11 (10, 20, 30,
    40, 900, 980, 990 : le premier est Tropiques africains) : la vitrine n'affiche plus « ttt ». Le défaut de code
    demeure.
  - `src/gl/components/GLSpeciesCatalog.jsx` l. 199-202 : « Aucun biome du catalogue n'est lié à ce chapitre. Un MJ
    peut en choisir dans Contenus → Chapitres → Biomes (catalogue espèces). », montré à tout le monde.
  - `src/gl/components/GLAuthView.jsx` **monte déjà `GLBrandHub`** (import l. 6, rendu l. 244), qui affiche
    `slots.hero.imageUrl` au-dessus de la carte de connexion (`src/gl/components/GLBrandHub.jsx`, bloc
    `.gl-brand-hub__hero`). Ajouter l'image dans la carte la montrerait **deux fois**.
- **Changement attendu** :
  1. Invité : le chapitre servi est celui qui a le **plus petit `plateau_number` non nul** ; à défaut, le premier de
     la liste.
  2. `GLSpeciesCatalog.jsx` : le message « Un MJ peut en choisir… » n'est montré qu'au staff G&L ; ailleurs, « Les
     espèces de ce monde arrivent bientôt. »
  3. Écran de connexion : regarde d'abord ce que `GLBrandHub` y rend. **Si l'image d'accueil y est déjà, n'ajoute
     rien** et écris « écarté : déjà monté » dans ton rapport. Sinon seulement : l'image
     `platform.brand.slots.hero.imageUrl`, quand elle existe, au-dessus du titre, cadrage 21/9 de la marque, hauteur
     au plus 28 vh, coins du haut arrondis comme la carte, `alt=""` (décorative) ; rien sinon. Jamais deux images. Le
     reste de l'écran ne change pas. Le CSS de l'écran de connexion a un plafond (`npm run check:bundle`).
- **Textes** : « Les espèces de ce monde arrivent bientôt. »
- **Tests** (UI) : invité avec des chapitres d'ordre 0, 10, 10, 20… (jeu d'essai : c'est l'ancien ordre, plus celui
  de la prod) → Tropiques africains ; message du catalogue absent pour un invité, présent pour le staff ; l'image
  d'accueil apparaît une seule fois quand la marque la porte.
- **Critère d'acceptation** : tests verts ; captures de la vitrine `?demo=parents` (« La nature › Écosystèmes » des
  Tropiques africains) et de l'écran de connexion.

### contenu-5.5 — Le « +1 » de « Mon journal » (étape JOURNAL-1, décision du 24/11 à 13 h 53)

- **Constat vérifié** :
  - La règle existe : `lib/glVoyageur.js` l. 30-33 (`JOURNAL_ARTICLES_PER_WEEK = 2`, `JOURNAL_MIN_CHARS = 40`) ; le
    compte du journal (`loadVoyageurCounts`, l. 271-279) additionne, par semaine (`YEARWEEK(created_at, 3)`), au plus
    deux articles d'au moins 40 caractères ; il nourrit le regard `loin` (source `journal`, l. 68).
  - `routes/gl/player-journal.js` : `POST /me/articles` (l. 131-153) et `PUT /me/articles/:articleId` (l. 156-184)
    répondent `{ article }`, sans `voyageurGain` : l'élève ne voit rien.
  - `voyageurGainFor(glAuth, sources)` (`lib/glVoyageur.js` l. 154) existe et sert déjà `routes/gl/learning.js`. Il
    rend `{ proche, loin }` ou `null` (pas un élève, module éteint).
  - Côté écran, **rien à faire** : `apiGL` relaie tout `voyageurGain` (`src/gl/services/apiGL.js` l. 195-203) et
    `src/gl/components/GLVoyageurGainToast.jsx` montre la pastille « +1 regard du loin » et joue le son `gain-loin`.
- **Changement attendu** : dans les deux routes, lis le compte du journal de l'élève **avant** et **après**
  l'écriture (même requête que `loadVoyageurCounts` : sors-la en fonction exportée de `lib/glVoyageur.js`). Si le
  compte monte, la réponse porte `voyageurGain` = `await voyageurGainFor(req.glAuth, ['journal'])`, soit
  `{ proche: 0, loin: 1 }`. Sinon la réponse ne change pas. Aucune migration, aucun réglage, aucune règle nouvelle.
- **Textes** : aucun (la pastille existe).
- **Tests** (`tests/gl-player-journal.test.js`) : article créé vide → pas de gain ; son corps passe à 40 caractères
  → `voyageurGain` ; le réenregistrer → pas de gain ; troisième article de la semaine → pas de gain ; module du
  voyageur éteint → pas de gain ; corps de 39 caractères → pas de gain.
- **Critère d'acceptation** : tests verts ; `docs/API.md` dit le champ.

### contenu-5.6 — Les traces de passage (étape TRACES-1, décision du 24/11 à 13 h 53)

- **Constat vérifié** :
  - `gl_learning_acknowledgements` (`migrations/107_gl_learning_acknowledgements.sql`) : `reader_user_type`,
    `reader_user_id`, `target_type`, `target_code`, `acknowledged_at` ; index `idx_gla_target` sur
    (`target_type`, `target_code`). La classe d'un élève : `gl_players.class_id`.
  - **La route des lectures** est `routes/gl/learning.js` : `GET /me` (l. 159), `POST /species/:code` (l. 297),
    `POST /mark/:resourceType/:ref` (l. 442 ; une page du carnet y passe avec `resourceType = feuillet`). Toutes sont
    sous `requireGlAuth` : **tout invité reçoit 403 `guestBlocked`** (vitrine, tablette d'équipe, projection).
  - **La fiche d'espèce** : `src/gl/components/GLSpeciesDetailModal.jsx` ; le bouton « Marquer comme appris »
    (`GLLearningAcknowledgeButton`, l. 267) n'est rendu que si la prop `learningProgress` est passée.
  - **La page du carnet** : `src/gl/components/GLSeleneCarnetView.jsx`, bloc `GLLearnAndImport` de la page ouverte
    (`resourceType="feuillet"`, l. 340).
- **Changement attendu** :
  1. **Route** `GET /api/gl/learning/traces/:resourceType/:ref` dans `routes/gl/learning.js`, sous `requireGlAuth`.
     Types admis : `species`, `feuillet`. Réponse : `{ count }`, rien d'autre. `count` = nombre d'**élèves de la
     classe du lecteur** (`reader_user_type = 'gl_player'`, jointure `gl_players.class_id`) qui ont un accusé sur
     cette ressource, **sans le lecteur**. Staff, ou élève sans classe : `{ count: 0 }`. Une page que l'élève ne peut
     pas lire répond 404 (même garde que `resourceExists`). Aucune table, aucune écriture, jamais un prénom, un
     identifiant, une date ou un score.
  2. **Composant** `src/gl/components/GLTracePassage.jsx` (props : type, référence), monté dans les deux composants
     ci-dessus, près du bouton. Il n'appelle la route que sur le **compte d'un élève** (là où le bouton existe) : un
     invité ne déclenche aucun appel. À 0, **il ne rend rien** (pas de place réservée, pas de « personne »).
  3. Rien sur la tablette d'équipe, la vitrine, la projection.
- **Textes** (mot pour mot ; « 4 » est le nombre) :

  | Cas | Page du carnet | Fiche d'espèce |
  | --- | --- | --- |
  | 2 ou plus | « 4 de la caravane ont déjà lu cette page. » | « 4 de la caravane ont déjà étudié cette espèce. » |
  | 1 | « Quelqu'un de la caravane a déjà lu cette page. » | « Quelqu'un de la caravane a déjà étudié cette espèce. » |
  | 0 | rien ne s'affiche | rien ne s'affiche |

- **Tests** : route (`tests/gl-learning-traces.test.js`) : 0, 1 et 4 lecteurs ; un élève d'une autre classe ne compte
  pas ; le lecteur ne se compte pas ; le prof ne compte pas ; invité → 403 ; type hors liste → 400 ; la réponse n'a
  que `count`. UI (`tests-ui/gl/GLTracePassage.test.jsx`) : les trois cas, pour les deux types ; aucun appel sans
  compte d'élève.
- **Critère d'acceptation** : tests verts ; `docs/API.md` à jour ; captures d'une fiche d'espèce et d'une page avec
  leur trace.

### contenu-5.7 — « Mon sac » dans les catalogues (étape SAC-3, décision du 24/11 à 14 h 16)

- **Constat vérifié** (`grep -n Seuil data/gl/tenir/*.json` : trois occurrences du nom) :

  | Fichier | Où | Texte d'aujourd'hui | Vu d'un élève |
  | --- | --- | --- | --- |
  | `data/gl/tenir/olu-lignes.json` | `olu-pf-comptes`, `texte` (l. 843) | « Le Marché et le Seuil s'ouvrent depuis le compte de chacun. » | oui |
  | `data/gl/tenir/parures.json` et `exemple/parures.json` | `format` (l. 2) | « … (garde-robe du Seuil) … » | non |
  | `data/gl/tenir/reglages-defaut.json` | `notes.surplus_reserve` (l. 122) | « … remise à zéro au Seuil » | non |
  | `data/gl/tenir/README.md` | l. 207 | « depuis la garde-robe du Seuil » | non |
  - Dans `reglages-defaut.json`, « au Seuil » ne nomme pas l'écran : c'est l'arrivée au camp (`lib/glSeuil.js`
    l. 118). Le passage de fin de chapitre s'appelle « le camp ».
  - Le moment `seuil` des lignes `olu-48` à `olu-50` est un identifiant : il ne change pas ; leurs textes disent déjà
    « camp ».
  - La même phrase d'Olu existe en repli dans `src/gl/constants/tenirTextes.js` (l. 28) et en dur dans
    `src/gl/components/tenir/GLTeamSessionView.jsx` (l. 217) : c'est le lot ecrans-6 qui les change.

- **Changement attendu** :

  | Fichier | Champ | Nouveau texte |
  | --- | --- | --- |
  | `olu-lignes.json` | `olu-pf-comptes`, `texte` | « Le Marché et « Mon sac » s'ouvrent depuis le compte de chacun. » |
  | `parures.json`, `exemple/parures.json` | `format` | « (garde-robe du Seuil) » devient « (garde-robe de « Mon sac ») » |
  | `reglages-defaut.json` | `notes.surplus_reserve` | « remise à zéro au Seuil » devient « remise à zéro au camp » |
  | `README.md` | l. 207 | « depuis la garde-robe de « Mon sac » » |
  - **La phrase d'Olu doit être la même partout.** Lis celle que le lot ecrans-6 a écrite dans `tenirTextes.js` : si
    elle diffère de celle du tableau, **reprends la sienne** dans le catalogue et dis-le dans ton rapport.
  - Test de vocabulaire : aucun champ visible d'un élève des catalogues `data/gl/tenir/*.json` (`texte`,
    `effet_court`, `description`, `consigne`, `titre`, `question`, `feedback_*`, `correction`) ne contient « Seuil »
    (S majuscule) ; le nom commun « seuil » reste permis. Greffe-le sur le test de vocabulaire d'ecrans-6.
  - La section de la page des règles est renommée par le bloc D de l'étape contenu-5.3.

- **Textes** : ceux du tableau.
- **Tests** : test de vocabulaire ci-dessus ; `tests/content/gl-tenir-donnees.test.js` et
  `tests/content/gl-adresse-ecran-equipe.test.js` restent verts.
- **Critère d'acceptation** : `grep -n "Seuil" data/gl/tenir/*.json data/gl/tenir/exemple/*.json` ne rend plus rien.

## 5. Migration

- **Étiquette** : `mig-pages-servies` (remplace l'ancienne migration des pages servies, sans objet en prod).
- **Tables** : `gl_content_pages` (`rules`, `world`), `gl_chapters` (`sortileges_markdown`).
- **Gardes** : A : `rules` contient « Le Maître du Jeu (MJ) pilote la partie » ; B : chaque phrase exacte d'avant ;
  C : « un cœur pour les Gnomes », et la ligne de l'épilogue ; D : `rules` contient « ## Le Seuil ».
- **Prod au 24/11** : les sept écritures de l'ancienne étape y sont (posées par le connecteur le 24/11 à 11 h 15 ; la
  base horodate une heure plus tard). Les gardes A, B et C ne tiennent pas. **Seule la garde D tient** : la migration
  y renomme la section, rien d'autre.
- **Base neuve** : A pose la page des règles, D renomme sa section. B et C ne trouvent rien.
- **Ordre** : après `mig-regles-roles` (moteur-2), qui ne fait rien sur une base neuve et corrige la phrase des rôles
  en prod.

## 6. Données et sources

| Source (`docs/prompts/gl-decisions/sources/`) | Où va son contenu |
| --- | --- |
| `pages-servies.md` | Dans le SQL de la migration (blocs A, B, C). Rien d'autre du dépôt ne le copie. |

## 7. Vérifications propres au lot

- e2e (sous le verrou) : `e2e/gl-guest-discovery.spec.js`, `e2e/gl-player-journal.spec.js`, `e2e/gl-content.spec.js`.
- Banc : régime **fumée**, une passe à la fin.
- Captures (`docs/captures/gl-decisions/contenu-5/`) : lexique du voyage d'un élève au plateau 1 ; vitrine
  `?demo=parents` ; écran de connexion ; fiche d'espèce et page du carnet avec leur trace ; pastille du journal.
- Comptes à rendre : fiches du lexique visibles d'un élève aux plateaux 1, 2, 3, 4 (sur ta base) ; blocs de la
  migration qui ont écrit sur ta base ; occurrences de « Seuil » restantes dans `data/gl/tenir/`.

## 8. Contrats de test changés

- `GET /api/gl/lore/glossary`, `/glossary/link-index`, `/glossary/:code` : filtrés par monde pour un lecteur non
  staff ; `/glossary/:code` sans `role_recit`, `correspondance_reelle`, `source` pour un lecteur non staff.
- Chapitre des invités : le plus petit `plateau_number` non nul.
- `POST` et `PUT /api/gl/player-journal/me/articles…` : `voyageurGain` quand le compte monte.
- `olu-pf-comptes` : « Le Marché et « Mon sac » s'ouvrent depuis le compte de chacun. »
- Page `rules` : section « ## Mon sac ».
- `GLSpeciesCatalog` : « Les espèces de ce monde arrivent bientôt. » pour un lecteur non staff.

## 9. Docs à mettre à jour dans ce lot

- `docs/API.md` : filtre `chapitre_scope` du lexique pour un lecteur non staff ; champs de `GET /glossary/:code`
  selon le lecteur ; `GET /api/gl/learning/traces/:resourceType/:ref` ; `voyageurGain` des articles du journal.
- `docs/GL_TENIR_A_DEUX_REGLES.md` § 1 : les notes d'auteur du lexique sont réservées au prof.
- `data/gl/tenir/README.md` : la ligne de la garde-robe.
- `changelog.d/gl-decisions-contenu-5.md`.

## 10. Hors périmètre

| Quoi | Lot |
| --- | --- |
| Libellés d'onglets, chaînes d'écran, « Mon sac » à l'écran, visite d'Olu, fond du plateau | ecrans-6 |
| « Mon sac » en deux états | ecrans-8 |
| « Les marges du copiste » | contenu-6 |
| « Mon sac » dans les règles et les docs de référence | fin-1, fin-2 |
| 70 questions de lore actives écrivaient encore « Selene » sans accent le 24/11 | la migration du lot contenu-4 pose l'accent sur leurs champs lus par les élèves ; le reste : section 11 |
| Réglages (`gameplay.lore_spoiler_max_level`, modules) | Oliv, par le connecteur |
| Rafraîchir `data/gl/sim/contenu-prod-2026-11-07.json` (il garde les anciens grimoires et « L'aventure du plateau s'achève ») | personne |

## 11. Pour Oliv

**À relire**

- **La page « Les règles du jeu »** dit seulement « Sur une case question, une bonne réponse fait avancer d'une case
  de plus. » : ni le « +3 sous le voile », ni la sonde (décision 37 du prompt). Non changé.
- **Sa section « Mon sac »** : intitulé et première phrase posés par ce lot (étape contenu-5.3).
- **La phrase d'Olu** : « Le Marché et « Mon sac » s'ouvrent depuis le compte de chacun. »
- **Portée `fin`** (`LR0033`, « l'étoile fixe du nord ») : deux lectures, « visible du prof seul » (posée ici : la
  fiche sort du lexique des élèves) ou « visible au dernier monde ».
- **« les quatre visages »** (`LR0046`) garde la portée `tous` : un élève du plateau 1 lit qu'il y en a quatre.
  Changer sa portée est une donnée, à la main d'Oliv.
- Les variantes des fiches (« le carnet mourant », « la boîte de l'Ancien ») servent aux liens automatiques : non
  touchées.
- `GLSpellCatalog.jsx` (l. 146-147) montre aussi un message d'administration à tout le monde (« Aucun sort n'est lié
  à ce chapitre. Un MJ peut en choisir… ») : non cité par la décision, non changé. Proposition : « Les sortilèges de
  ce monde arrivent bientôt. »
- Traces : le lecteur ne se compte pas ; les pages de contenu (« Pages du monde ») n'ont pas de trace.
- Les grimoires écrivent « le Souffle prend le visage de la Grise » : verbe d'agent ou non, à dire (textes en prod).

**À faire après la vague**

- Synchroniser les catalogues `olu-lignes` et `parures` (et les réglages par défaut, s'ils se synchronisent).
- Vitrine `?demo=parents` dans un navigateur privé : « La nature » montre les Tropiques africains, aucun message
  d'administration.
- Compte d'élève de démonstration au plateau 1 : le lexique du voyage ne nomme aucun visage. Ensuite seulement,
  remettre `gameplay.lore_spoiler_max_level` à `recit` si tu l'avais baissé.
- **Ne plus réimporter le lexique lore depuis le tableur** (`data/gl/glossaire-lore-gnomes-et-licornes.xlsx`, import
  `lib/glLoreGlossaryImport.js`) : les textes d'avant reviendraient ; repartir de l'export de l'app.
- Relire « Les règles du jeu » et les grimoires dans l'app.
- Recompter en prod les questions de lore qui écrivent encore « Selene » (colonnes non lues par les élèves :
  `notes_pedagogiques`, `source_lore`, `tags`, `mots_cles` ; questions inactives).
