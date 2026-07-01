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

| Notion | Source de vérité | Nature |
| --- | --- | --- |
| **Feuillet de lore** (carnet de Sélène) | Table `gl_lore_feuillets` (BDD) | Contenu narratif complet : `texte`, `texte_accessible`, incipit, idée-clé, biome, ordre de récit, effets (`cout_gemme`, `gain_coeur`, `effacement`, `tenir`)… |
| **Zone feuillet** (calque carte) | Fichier statique `src/gl/data/zones_feuillets.json` | Petit polygone sur le plateau ; à la 1ʳᵉ traversée, affiche un `popover` court et applique les effets gemmes/cœurs. Chaque zone porte un `feuillet_code` qui **relie** la zone au feuillet de lore complet. |

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

| Rôle (`userType` / `roleSlug`) | `gl.read` | `gl.content.manage` | Accès feuillets |
| --- | :---: | :---: | --- |
| `gl_guest` (Visiteur, `gl_observateur`) | ✅ (token invité) | ❌ | **Uniquement** `GET /api/gl/lore/demo-feuillets` (4 feuillets curés). Bloqué partout ailleurs par `requireGlAuth`. |
| `gl_player` (Joueur) | ✅ | ❌ | Lecture carnet + découverte en jeu (rattaché à une équipe). |
| `gl_mj` (MJ) | ✅ | ✅ | + gestion contenu (édition/import/export). |
| `gl_admin` (MJ Admin) | ✅ | ✅ | Idem MJ + voit le `texte` intégral (`isMj`). |

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

| Méthode & route | Garde | Accès effectif |
| --- | --- | --- |
| `GET /api/gl/lore/demo-feuillets` | `gl.read` | Invité, joueur, MJ, admin |
| `GET /api/gl/lore/feuillets` | `requireGlAuth` + `loreCarnetEnabled` | Tout compte GL (**pas** invité) |
| `GET /api/gl/lore/feuillets/:code` | `requireGlAuth` + `loreCarnetEnabled` | Tout compte GL |
| `POST /api/gl/lore/games/:id/feuillets/:code/present\|read\|hold` | `requireGlAuth` + `canAccessGlGame` | Joueur (son équipe) / MJ |
| `GET /api/gl/lore/games/:id/zones/:zoneId/feuillets` | `requireGlAuth` + `canAccessGlGame` | Joueur / MJ |
| `GET /api/gl/games/:id/feuillet-zones/presented` | `requireGlAuth` + `canAccessGlGame` | Joueur / MJ |
| `POST /api/gl/games/:id/feuillet-zones/:zoneId/present` | `requireGlAuth` + `canAccessGlGame` | Joueur (son équipe) / MJ |
| `GET/PUT/PATCH /api/gl/lore/admin/feuillets…` | `gl.content.manage` | MJ / admin |
| `GET …/admin/feuillets/import/template` · `export` · `POST …/import` | `gl.content.manage` | MJ / admin |

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

| Plateau | Zones | Codes feuillets |
| :---: | --- | --- |
| 1 | zf-p1-01 → 04 | ep-I-01, ep-I-02, ep-I-03, ep-I-04 |
| 2 | zf-p2-05 → 07 | ep-I-05, ep-I-06, ep-I-08 |
| 3 | zf-p3-08 → 11 | ep-I-07, ep-I-09, ep-I-10, ep-III-05 |
| 4 | zf-p4-12 → 16 | ep-I-11, ep-I-12, ep-III-01, ep-III-02, ep-III-03 |
| 5 | zf-p5-17 → 24 | ep-I-14, ep-III-04, ep-I-16, ep-I-13, ep-I-15, ep-III-06, ep-III-07, ep-I-17 |

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

> Classés par priorité. À valider avec l'équipe avant tout correctif — ce document n'apporte
> **aucune** modification de comportement.

1. **[À confirmer — accès contenu] Le carnet expose tout le contenu narratif à tout compte GL,
   indépendamment de la progression.** `GET /api/gl/lore/feuillets` (`lore.js:138-182`) renvoie
   **tous** les feuillets `actif` avec leur `displayText` (= `texte_accessible`) à n'importe quel
   utilisateur authentifié (y compris un joueur), sans exiger `gameId/teamId` ni découverte
   préalable. Le champ `progressStatus` vaut `locked` mais **le texte est quand même renvoyé**.
   De même, `GET /feuillets/:code` ne renvoie 403 que si une **ligne d'état `locked` existe** ;
   sans `gameId/teamId`, `progress` est `null` et le feuillet est servi librement. → Le
   verrouillage « découverte » est **cosmétique côté affichage**, pas appliqué au serveur.
   Impact : un joueur curieux peut énumérer tout le récit (spoilers) via l'API. À arbitrer :
   est-ce voulu (le carnet est une bibliothèque ouverte) ou faut-il gater par progression ?
   Seul garde-fou actuel : le module `loreCarnetEnabled`.

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
- **Principal arbitrage** : décider si le carnet doit rester une **bibliothèque ouverte** (état
  actuel) ou **gater le contenu par progression** côté serveur (finding #1).
