# Audit — Feuillets (Gnomes & Licornes) : accès & obtention

> Portée : sous-produit **GL** du monorepo ForetMap. Ce document cartographie **qui**
> peut accéder aux feuillets, **par quels chemins** on les obtient, et signale les
> points d'attention relevés à la lecture du code. Rédigé le 2026-07-01.
>
> Références principales : `routes/gl/lore.js`, `routes/gl/games/feuillet-zones.js`,
> `lib/glLoreFeuillets.js`, `lib/glFeuilletZonePresent.js`, `lib/glLoreFeuilletEffects.js`,
> `lib/glLoreFeuilletRetrigger.js`, `lib/gl/demoFeuillets.js`, `middleware/requireGlAuth.js`,
> `lib/rbac.js`, `src/gl/data/zones_feuillets.json`, `docs/GL_FEUILLET_ZONES.md`.

---

## 1. Deux notions de « feuillet » qui coexistent

| Notion                                  | Source de vérité                                    | Nature                                                                                                                                                                                                      |
| --------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Feuillet de lore** (carnet de Sélène) | Table `gl_lore_feuillets` (BDD)                     | Contenu narratif complet : `texte`, `texte_accessible`, incipit, idée-clé, biome, ordre de récit, effets (`cout_gemme`, `gain_coeur`, `effacement`, `tenir`)…                                               |
| **Zone feuillet** (calque carte)        | Fichier statique `src/gl/data/zones_feuillets.json` | Petit polygone sur le plateau ; à la 1ʳᵉ traversée, affiche un `popover` court et applique les effets gemmes/cœurs. Chaque zone porte un `feuillet_code` qui **relie** la zone au feuillet de lore complet. |

Les deux sont liés par le champ `feuillet_code`. Le catalogue de zones compte
**24 zones réparties sur 5 plateaux** (voir §7).

---

## 2. Modèle de données & états

- **`gl_lore_feuillets`** — le catalogue de contenu (colonne `statut` : `actif` / `inactif`).
  Seuls les feuillets `statut = 'actif'` sont servis côté jeu.
- **`gl_game_feuillet_states`** — progression **par équipe et par partie** :
  `status ∈ { discovered, read, held, effaced }`, `effacement_pct`, `unlocked_via`
  (`zone` | `story`), `kingdom_zone_id`, horodatages `discovered_at/read_at/held_at/effaced_at`
  (`lib/glLoreFeuillets.js:79-170`).
- **`gl_game_events`** — journal : `feuillet_zone_presented`, `feuillet_discovered`,
  `feuillet_read`, `feuillet_held`. La « 1ʳᵉ traversée » d'une **zone** est déterminée en
  relisant ces events (`lib/glFeuilletZonePresent.js:39-89`), pas via une table d'état dédiée.

Migrations concernées : `117_gl_lore_carnet`, `118_gl_lore_feuillets_images`,
`119_gl_lore_feuillets_lien_espece`, `120_gl_chapters_plateau_number`.

---

## 3. Rôles, authentification et permissions

Auth GL = **JWT `product:'gl'`** (`middleware/requireGlAuth.js`). Un JWT GL est rejeté
hors `/api/gl/*` (isolement produit). Deux gardes :

- `requireGlAuth` — exige un token GL valide **et bloque les invités** (`gl_guest` → 403
  `guestBlocked`) — `requireGlAuth.js:77-96`.
- `requireGlPermission(perm)` — exige la permission RBAC `perm` dans le token.

Rôles et permissions feuillets (`lib/rbac.js:30-250`) :

| Rôle (`userType` / `roleSlug`)          |     `gl.read`     | `gl.content.manage` | Accès feuillets                                                                                                    |
| --------------------------------------- | :---------------: | :-----------------: | ------------------------------------------------------------------------------------------------------------------ |
| `gl_guest` (Visiteur, `gl_observateur`) | ✅ (token invité) |         ❌          | **Uniquement** `GET /api/gl/lore/demo-feuillets` (4 feuillets curés). Bloqué partout ailleurs par `requireGlAuth`. |
| `gl_player` (Joueur)                    |        ✅         |         ❌          | Lecture carnet + découverte en jeu (rattaché à une équipe).                                                        |
| `gl_mj` (MJ)                            |        ✅         |         ✅          | + gestion contenu (édition/import/export).                                                                         |
| `gl_admin` (MJ Admin)                   |        ✅         |         ✅          | Idem MJ + voit le `texte` intégral (`isMj`).                                                                       |

> Le token invité est émis par `POST /api/gl/auth/guest` avec `permissions: ['gl.read']`
> (`routes/gl/auth.js:186-196`).

---

## 4. Comment on **obtient** un feuillet — les parcours

### 4.1 Découverte par traversée d'une zone (parcours nominal joueur)

1. Le joueur déplace sa mascotte ; le hook `useGLFeuilletZoneArrival`
   (`src/gl/hooks/useGLFeuilletZoneArrival.js`) détecte la traversée d'un polygone de zone
   **non encore présentée** pour l'équipe.
2. Appel `POST /api/gl/games/:id/feuillet-zones/:zoneId/present`
   (`routes/gl/games/feuillet-zones.js:67-167`). Conditions vérifiées côté serveur :
   - `canAccessGlGame` (accès à la partie),
   - partie **`live` ou `paused`** (sinon 409),
   - zone présente dans le **catalogue statique** (`getFeuilletZoneById`),
   - **cohérence plateau** : `zone.plateau === chapitre.plateau_number` (1–5), sinon 404,
   - rattachement d'équipe : un `gl_player` est forcé sur **son** équipe ; un MJ doit passer `teamId`,
   - **unicité** : 409 « Zone feuillet déjà présentée » si un event existe déjà pour l'équipe
     (`presentFeuilletZone` → `canPresentFeuilletZone`).
3. Effets appliqués en transaction (`applyFeuilletVitalityEffects`) : **−`cout_gemme`** (puissance)
   et **+`gain_coeur`** (santé) sur la vitalité de l'équipe, **si** les toggles
   `lore_gemme_costs_enabled` / `lore_heart_rewards_enabled` et `vitalityEnabled` sont actifs.
4. En parallèle, si le module carnet est actif, le front appelle
   `POST /api/gl/lore/games/:id/feuillets/:code/present` pour enregistrer la **découverte du
   feuillet complet** dans le carnet (`useGLFeuilletZoneArrival.js:97-105`).

### 4.2 Cycle de vie côté carnet de Sélène

Routes `routes/gl/lore.js`, toutes sous `requireGlAuth` + module `loreCarnetEnabled` :

- `POST …/feuillets/:code/present` → passe l'état à `discovered` (ou `effaced` si
  `effacement_pct ≥ 100`), applique effets vitalité, journalise `feuillet_discovered`
  (`lore.js:226-338`). Garde-fou **re-déclenchement** (`canPresentFeuillet`) selon le mode.
- `POST …/feuillets/:code/read` → état `read` (`lore.js:340-375`).
- `POST …/feuillets/:code/hold` → état `held`, **seulement si** le feuillet est « tenable »
  (`canHoldFeuillet` : champ `tenir` non vide) sinon 409 (`lore.js:377-421`).

### 4.3 Modes de re-déclenchement & effacement

- **Re-déclenchement** (`lib/glLoreFeuilletRetrigger.js`) : `every_arrival` (toujours),
  `once_per_team` (1×/équipe), `once_per_game` (1×/partie). Réglable **par partie**
  (`lore_feuillet_retrigger`) ou **global** (`loreFeuilletRetrigger`).
- **Effacement** (`lib/glLoreFeuilletEffects.js:11-26,69-76`) : selon `effacement` +
  `vitesse_effacement`, le texte se masque progressivement (`maskFeuilletText`) jusqu'à
  disparition (`effaced`). Activé par `lore_effacement_enabled`.

### 4.4 Liaison zone-du-royaume & candidats

- `GET /api/gl/lore/games/:id/zones/:zoneId/feuillets` — feuillets candidats pour une
  **kingdom zone** (par `kingdom_zone_id`, sinon heuristique `zone_label`/biomes)
  (`lore.js:423-473`).
- `PUT /api/gl/lore/admin/feuillets/:code/kingdom-zone` — associe un feuillet à une zone
  (`gl.content.manage`).

### 4.5 Mode Découverte (visiteur sans compte)

- `GET /api/gl/lore/demo-feuillets` (`requireGlPermission('gl.read')`) sert une **allowlist
  curée de 4 feuillets** de l'arc d'ouverture : `ep-I-01…04` (`lib/gl/demoFeuillets.js`).
  Garde-fous lore documentés dans le fichier (le Souffle jamais personnifié, visage de Sélène
  jamais montré, Krâ jamais nommé, fin non révélée).

---

## 5. Inventaire des routes & contrôle d'accès

| Méthode & route                                                      | Garde                                 | Accès effectif                  |
| -------------------------------------------------------------------- | ------------------------------------- | ------------------------------- |
| `GET /api/gl/lore/demo-feuillets`                                    | `gl.read`                             | Invité, joueur, MJ, admin       |
| `GET /api/gl/lore/feuillets`                                         | `requireGlAuth` + `loreCarnetEnabled` | Tout compte GL (**pas** invité) |
| `GET /api/gl/lore/feuillets/:code`                                   | `requireGlAuth` + `loreCarnetEnabled` | Tout compte GL                  |
| `POST /api/gl/lore/games/:id/feuillets/:code/present\|read\|hold`    | `requireGlAuth` + `canAccessGlGame`   | Joueur (son équipe) / MJ        |
| `GET /api/gl/lore/games/:id/zones/:zoneId/feuillets`                 | `requireGlAuth` + `canAccessGlGame`   | Joueur / MJ                     |
| `GET /api/gl/games/:id/feuillet-zones/presented`                     | `requireGlAuth` + `canAccessGlGame`   | Joueur / MJ                     |
| `POST /api/gl/games/:id/feuillet-zones/:zoneId/present`              | `requireGlAuth` + `canAccessGlGame`   | Joueur (son équipe) / MJ        |
| `GET/PUT/PATCH /api/gl/lore/admin/feuillets…`                        | `gl.content.manage`                   | MJ / admin                      |
| `GET …/admin/feuillets/import/template` · `export` · `POST …/import` | `gl.content.manage`                   | MJ / admin                      |

---

## 6. Ce que voit chaque rôle (différenciation d'affichage)

`formatFeuilletRow` (`lib/glLoreFeuillets.js:21-77`) :

- **`texte` (version intégrale)** n'est exposé **que** si `isMj` (`userType === 'gl_admin'`) ;
  sinon `undefined`.
- **Joueurs** reçoivent `texte_accessible` (version simplifiée) via `displayText`.
- **Effacement** : `displayText` est tronqué selon `effacement_pct` (progression par équipe).
- **`GET /feuillets/:code`** renvoie **403** si l'état de l'équipe est explicitement `locked`
  et que l'appelant n'est pas MJ (`lore.js:213-215`).

---

## 7. Catalogue des zones feuillets (`zones_feuillets.json`)

24 zones, coords normalisées 0–1, déclenchement `traversee_unique`, `cout_gemme`/`gain_coeur`
= 1/1 par défaut (quelques exceptions à 0) :

| Plateau | Zones         | Codes feuillets                                                              |
| :-----: | ------------- | ---------------------------------------------------------------------------- |
|    1    | zf-p1-01 → 04 | ep-I-01, ep-I-02, ep-I-03, ep-I-04                                           |
|    2    | zf-p2-05 → 07 | ep-I-05, ep-I-06, ep-I-08                                                    |
|    3    | zf-p3-08 → 11 | ep-I-07, ep-I-09, ep-I-10, ep-III-05                                         |
|    4    | zf-p4-12 → 16 | ep-I-11, ep-I-12, ep-III-01, ep-III-02, ep-III-03                            |
|    5    | zf-p5-17 → 24 | ep-I-14, ep-III-04, ep-I-16, ep-I-13, ep-I-15, ep-III-06, ep-III-07, ep-I-17 |

Exceptions d'effets : `zf-p5-20` et `zf-p5-22` (0/0), `zf-p5-21` (1/0).
Validation Zod au chargement ; `zone_id` unique ; zone invalide ignorée avec avertissement
console (`docs/GL_FEUILLET_ZONES.md`).

---

## 8. Alimentation & administration (comment un feuillet entre dans le système)

- **Import XLSX** : `POST /api/gl/lore/admin/feuillets/import` (+ `…/import/template` et
  `…/export`), moteur `lib/glLoreFeuilletsImport.js`. Upsert avec `COALESCE` (préserve les
  champs non fournis). `dryRun` possible. Garde `gl.content.manage`.
- **Édition unitaire** : `PUT /api/gl/lore/admin/feuillets/:code` — écrase chaque colonne
  éditable telle quelle (vider un champ le vide en base), normalisation partagée avec l'import
  (`lib/glLoreFeuillets.js:227-237`, `FEUILLET_EDITABLE_COLUMNS`).
- **Archivage / réactivation** : `PATCH …/:code` (bascule `statut`).
- **Zones** : le calque `zones_feuillets.json` s'édite en mode debug
  (`?editFeuilletZones=1`, staff/MJ) ou depuis l'admin **Contenus → Chapitres** ; export
  « Copier/Télécharger JSON » (coords reconverties en 0–1). Fichier statique **versionné**,
  pas en BDD.

---

## 9. Points d'attention (findings)

> Classés par priorité. Le **finding #1** a depuis été traité (voir ci-dessous) ; les autres
> restent des observations à valider avec l'équipe avant tout correctif.

1. **[RÉSOLU] Le carnet exposait tout le contenu narratif à tout compte GL, indépendamment de la
   progression.** Historiquement, `GET /api/gl/lore/feuillets` renvoyait **tous** les feuillets
   `actif` avec leur `displayText` à n'importe quel joueur (verrouillage seulement cosmétique).
   → **Corrigé** : côté joueur, la liste est désormais scopée **côté serveur** aux biomes des
   chapitres joués (∪ feuillets trouvés) et le contenu est masqué (**aperçu verrouillé** : titre +
   champs de `gameplay.lore_feuillet_preview_fields`, défaut `incipit`) tant que le feuillet n'a
   pas été **trouvé** ; `GET /feuillets/:code` répond `404` hors périmètre. MJ/Admin conservent
   l'accès intégral. Voir `lib/glLoreFeuilletPreview.js`, `routes/gl/lore.js`, helpers
   `resolveAccessiblePlayerBiomes` / `loadPlayerFeuilletStates` (`lib/glLoreFeuillets.js`),
   migration `158_gl_lore_feuillet_preview_fields.sql`, tests `gl-lore-feuillet-access` /
   `gl-lore-feuillet-preview`.

2. **[Mineur — granularité rôle] MJ et Admin sont indistinguables pour les feuillets.**
   Les sessions staff GL (MJ **et** admin) portent toutes `userType: 'gl_admin'` ; seul le
   `roleSlug` (`gl_mj` / `gl_admin`) les sépare (`lib/gl/authRouteHelpers.js:105-114`). Or le
   code feuillets teste **`userType === 'gl_admin'`** pour décider `isMj` (accès au `texte`
   intégral) et `actorType = 'mj'` (`lore.js:171,316,332`, `feuillet-zones.js:124`). Conséquence :
   un **MJ simple voit le `texte` intégral au même titre que l'admin**, et il n'existe aucun
   palier de visibilité intermédiaire. À arbitrer si une distinction MJ/admin est souhaitée sur
   le contenu sensible (elle faudrait alors basculer le test sur `roleSlug`).

3. **[Robustesse] Unicité de zone reconstruite depuis `gl_game_events`.** `canPresentFeuilletZone`
   relit tous les events `feuillet_zone_presented` et parse le JSON à chaque appel
   (`glFeuilletZonePresent.js:39-66`). Correct fonctionnellement, mais O(events) et sans
   index métier ; à surveiller si le volume d'events croît. Une contrainte d'unicité en table
   d'état dédiée serait plus robuste.

4. **[Garde-fou éditorial] Allowlist démo = 4 codes en dur.** `GL_DEMO_FEUILLET_CODES`
   (`lib/gl/demoFeuillets.js`) contient les interdits lore en commentaire mais **aucune
   vérification automatique** : ajouter un code ouvre le contenu au public sans contrôle
   programmatique des 4 garde-fous. Process purement humain.

5. **[Cohérence donnée] Codes feuillets non strictement séquentiels dans les zones.** Ex. le
   plateau 2 saute `ep-I-07` (placé en plateau 3), les plateaux 4-5 mêlent arcs `ep-I-*` et
   `ep-III-*`. Volontaire (ordre de voyage ≠ ordre de liasse) mais à documenter pour éviter les
   erreurs d'édition.

---

## 10. Synthèse

- **Accéder** à un feuillet = être un compte GL non-invité (joueur/MJ/admin) ; l'invité est
  cantonné à 4 feuillets de démo.
- **Obtenir** un feuillet en jeu = traverser sa **zone** (1ʳᵉ fois, bon plateau, partie active),
  ce qui coûte des gemmes / rapporte des cœurs et l'inscrit au carnet de l'équipe.
- **Gouvernance** : le contenu s'administre via import/édition XLSX et le calque de zones via
  un fichier JSON versionné, sous permission `gl.content.manage`.
- **Lisibilité (décidée)** : par défaut, un joueur ne peut **pas lire** un feuillet — il n'en voit
  que la liste (biomes des chapitres joués) jusqu'à l'avoir **trouvé** sur la carte ; l'aperçu des
  feuillets verrouillés est configurable au niveau plateforme (`gameplay.lore_feuillet_preview_fields`).
  Cf. finding #1 (résolu). Les autres moyens d'obtention sont explorés en §11.

---

## 11. Acquisition des feuillets — canaux (état + pistes de conception)

> **Objectif métier** : que **tout élément consultable du site** puisse mener à l'acquisition de
> feuillets. La **stratégie ③** a été retenue (§11.3) et son **socle** est implémenté (§11.4) ;
> le câblage de tous les canaux et l'affinage corpus restent à faire (§11.5).

### 11.1 Canaux d'acquisition déjà présents dans le code

| Canal                           | Déclencheur                                                                          | Mécanisme (`unlocked_via`) | État                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------ | -------------------------- | --------------------------------------------------------- |
| **Zone feuillet**               | Traversée d'un polygone (`zones_feuillets.json`)                                     | `zone`                     | **Live** (~24 zones, arcs I & III)                        |
| **Étude d'espèce (directe)**    | 1ʳᵉ étude d'une espèce liée (`lien_canal='espece'`, `lien_ref=SPxxxx`)               | `espece`                   | **Live** (`POST /api/gl/learning/species/:code`)          |
| **Étude d'espèce (route pays)** | Étude d'une espèce d'un biome du pays (`lien_canal='espece_pays'`, `lien_pays=1..5`) | `espece`                   | **Live** — révèle le feuillet suivant de la route du pays |
| **Zone du royaume**             | Association `kingdom_zone_id`                                                        | `story`/`zone`             | Partiel (liaison admin)                                   |
| **Intro / route copiste**       | `lien_canal='intro_pays'` (feuillets `copiste` cop-mov)                              | —                          | Donnée présente, branchement à confirmer                  |

`lien_canal` est un **champ générique** (valeurs actuelles : `espece`, `espece_pays`, `intro_pays`) :
c'est le point d'extension naturel pour de nouveaux canaux. `BIOME_TO_PAYS`
(`lib/glLoreFeuilletSpeciesReveal.js`) mappe les 9 biomes → **5 pays** (ordre équateur→pôle),
alignés sur les 5 plateaux/chapitres.

### 11.2 Types de feuillets ↔ élément consultable naturel (proposition de mapping)

| `type` / `mode_apparition`                 | Élément consultable naturel          | Déclencheur d'acquisition proposé                                        |
| ------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------ |
| `feuillet` (biome, ancre_biome)            | Carte / zones / fiches espèces       | Traversée de zone **ou** étude d'espèce du biome                         |
| `copiste` (cop-mov, carnet_route)          | Intro / progression de route         | Entrée dans un nouveau pays/plateau                                      |
| `message` (corbeau)                        | Repères « événement » / le corbeau   | Arrivée sur un repère à effet / événement                                |
| `reponse`                                  | QCM (biome ou lore)                  | **Bonne réponse** à la question liée (`lien_qcm_biome` / learning-links) |
| `scene`                                    | Récit du chapitre (onglet Histoire)  | Lecture / atteinte d'une scène de récit                                  |
| `vierge` (page blanche)                    | Effacement / carnet                  | Récupérée en fin de parcours (filet), ou via effacement                  |
| `feuillet` (cover, preface, cloture, pole) | Ouverture / clôture de chapitre, fin | Début/fin de chapitre, feuillets de pôle en chapitre 5                   |

### 11.3 Décisions retenues (stratégie ③)

- **Stratégie ③ — exploration libre.** Toute **première consultation** d'un élément consultable
  puise dans le **pool du chapitre** et peut attribuer un feuillet.
- **Granularité** : acquisition **au niveau équipe** (le feuillet gagné est partagé par l'équipe).
- **Attribution** : le **nom du joueur** qui a découvert le feuillet est mémorisé et affiché.
- **Carnet cumulatif par joueur** : chacun repart avec ses feuillets gagnés et en collecte de
  nouveaux au chapitre suivant.
- **Gate QCM** : sauf exception, il faut **réussir le QCM lié** (assuré par le flux d'acquittement
  gaté `learning`). Un feuillet sans QCM lié est acquis directement.
- **Pas de filet de clôture** : l'exhaustivité n'est **pas** garantie (choix produit assumé).
- **Coût/récompense** : laissés de côté pour l'instant.

### 11.4 Socle implémenté (le « dur »)

- **Attribution** : colonnes `discovered_by_player_id` / `discovered_by_name` / `discovered_source`
  sur `gl_game_feuillet_states` (migration `157_gl_feuillet_attribution.sql`), posées une seule fois
  (premier découvreur) ; surfacées en `discoveredBy` dans le carnet (« Découvert par … »).
- **Moteur générique** `lib/glFeuilletAcquisition.js` : `awardFeuilletFromConsultation` (pick +
  commit) ; picking = lien direct (`lien_canal`/`lien_ref`) puis **pool du chapitre**
  (`lib/glFeuilletChapterPool.js` : biome ∈ chapitre **ou** `plateau_number` **ou** `lien_pays`).
  Chemin d'écriture unique `commitFeuilletDiscovery` (effets + état + événement + attribution).
- **Branchement** sur le flux d'acquittement gaté (`routes/gl/learning.js` : `mark/:type/:ref` +
  glossaire/tutoriel) → à la **première** consultation réussie, tente une attribution ; réponse
  enrichie de `feuilletRevealed`. Le canal **espèce** existant gagne l'attribution.
- **Config plateforme** (pilotage MJ, `gameplay.*`) : `lore_feuillet_acquisition_enabled`
  (défaut **off**) et `lore_feuillet_acquisition_channels` (liste, défaut = tous). Réglages GL →
  Carnet de Sélène.
- **Flexibilité** : `discovered_source` en **texte libre** (pas d'ENUM) ; canaux et mapping fin
  pilotés par la **donnée** (`lien_*`, `biome_slug`, `plateau_number`) — affinables via le corpus
  sans toucher au code.

### 11.4bis Acquisition rendue visible côté joueur (étape §1)

- **Popover générique** : le contrôle partagé `GLLearnAndImport` (lore, écosystème, page de
  contenu, tutoriel) affiche le popover `GLFeuilletDiscoveryPopover` dès que la réponse
  `mark/:type/:ref` contient `feuilletRevealed` — auparavant seuls les canaux **zone** et
  **espèce** le faisaient. `GLLearnAndImport` transmet `gameId`/`teamId` (corps de requête) quand
  ils sont connus ; sinon le backend retombe sur le contexte JWT.
- **Progression du carnet** (`GLSeleneCarnetView`) : indicateur « **N trouvés / M du chapitre** »
  - filtres **Tous / Trouvés / Verrouillés** (dérivés de `progressStatus`). Masqués pour le MJ.
- **Tests** : `tests-ui/gl/GLLearnAndImport.test.jsx` + compléments carnet.

### 11.5 Reste à faire (affinage)

- **Câbler les canaux restants** au moteur (récit/`scene`, QCM `reponse`, corbeau `message`,
  copiste route) au-delà de l'entrée générique déjà en place.
- **Affiner le gate** (« sauf exception ») et, plus tard, décider du coût/récompense hors-zone.
- **Arbitrage éditorial des ~32 orphelins** (canal QCM `reponse` / progression, ou statut « hors
  collecte ») : en attente de décision utilisateur.

### 11.6 Cartographie du corpus (snapshot 2026-07-01)

> ⚠️ **Le corpus XLSX est périmé.** `scripts/gl-audit-feuillet-coverage.py` lit
> `data/gl/corpus-feuillets-selene.xlsx` (**157 feuillets, sans colonnes `lien_*`**), mais la
> **base de production** contient **201 feuillets** avec les colonnes `lien_canal`/`lien_ref`/
> `lien_pays` **renseignées**. **La BDD fait autorité.** Chiffres ci-dessous = production.

**Production : 201 feuillets (tous `actif`)** — par type : `feuillet` 75, `scene` 70, `copiste` 40,
`reponse` 9, `vierge` 6, `message` 1.

**Couverture des champs** : `biome_slug` 136/201 · `plateau_number` 155/201 · `zone_label` 143/201 ·
`lien_canal` 51/201 (`espece_pays` 44, `intro_pays` 6, `espece` 1) · `lien_qcm_biome` 66/201 ·
`kingdom_zone_id` **0** · `image_url` 22.

**Couverture par canal** (zone traversée + `lien_canal` espèce/route + pool `biome`/`plateau`/`pays`) :
zone **24** · `lien_canal` **51** · biome **69** · plateau **17** → **orphelins 40 / 201 (20 %)**.

**Les 40 orphelins** (ni zone, ni biome, ni plateau, ni `lien_*`) sont **quasi tous `copiste`** :
9 `cop-marg` (marginalia), 8 `cop-bio-<biome>`, 6 `cop-insert`, 3 `cop-acte`, 8 autres `cop-*`
(cover, preface, finale, close, confession, doute, origine, trame) — **+ 5 `ep-echo-0N`** (feuillet
« Écho ») et **1 `message-boite`** (le corbeau, « À la classe qui vient »). **Aucune `scene`
orpheline.**

**Ce que ça change (vs analyse XLSX) :**

1. Le canal **espèce/route est déjà alimenté** (`lien_canal` sur 51 feuillets) → beaucoup plus de
   couverture que ne le laissait croire le XLSX.
2. **Le canal récit `scene` n'est PAS nécessaire** : les 70 `scene` sont déjà atteignables (biome/
   plateau). ⟵ corrige la reco précédente.
3. Le vrai trou = **l'arc `copiste` (34 orphelins) + 5 échos + 1 message**, tous sans biome/plateau.

**Chantiers révisés :**

- **(A) Enrichir la donnée** — quick win déterministe **✅ fait** (migration
  `159_gl_feuillet_copbio_biome_backfill.sql`) : les **8 `cop-bio-<biome>`** reçoivent leur
  `biome_slug` d'après le suffixe du code (idempotent) → **40 → 32 orphelins**, atteignables via le
  pool du chapitre. Le reste (marg/insert/acte/cover/preface/finale, échos, message) demande un
  **arbitrage éditorial** : plateau/pays d'appartenance, ou statut « hors collecte carte »
  (feuillets de cadre : couverture, préface, finale) — **à traiter plus tard**.
- **(B) Canal(aux) dédié(s)** — pour les copiste/échos non ancrables à un biome : soit un canal
  **QCM `reponse`** (échos = récompenses de bonne réponse), soit un déblocage **par progression**
  (cover/preface au début, finale/close en fin de chapitre 5).
