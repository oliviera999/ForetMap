# Audit de la base de données (août 2026)

> **Statut : audit, puis exécution.** Le relevé (§1 à §6) a été établi sans rien modifier ;
> le plan d'action (§7) a ensuite été appliqué, points 2 à 12 — état détaillé et écarts
> assumés en **§8**. Les constats révisés en cours d'exécution sont signalés comme tels au
> fil du texte (§3.2, §4.4, §5.4) : l'audit initial sous-estimait trois d'entre eux et se
> trompait sur un quatrième.
> Périmètre : la base de production **`oliviera_foretmap`** (cf. `.env.example:7`,
> `README.md:172`), auditée à travers une **copie** exportée le 18 août 2026 à 17:10 sous
> le nom `oliviera_foretmap5` — export phpMyAdmin 5.2.3, MariaDB 11.4.12, 5,8 Mo,
> 24 726 lignes SQL. La copie est **fraîche** : sa dernière écriture datée
> (`audit_log`, `2026-08-18T14:56:14Z`) précède l'export de quatorze minutes, donc les
> constats sur les données valent pour la production.
> Confrontation au dépôt : `sql/schema_foretmap.sql`, 171 migrations, `routes/`, `lib/`,
> `src/`. Tête de dépôt : `d8c1047` (merge PR #309), `package.json` **1.97.0**.
>
> Chaque constat est **vérifiable** : requête SQL de contrôle fournie, référence
> `fichier:ligne` pour le code. Les constats mesurés sur les données sont chiffrés.
> Ce que la base fait bien est signalé aussi — et il y en a beaucoup.

---

## 1. En une page

La base est **saine sur le fond** : 176 clés étrangères, 418 index, aucun encodage cassé,
aucune image en base64, **zéro référence polymorphe orpheline** sur les 5 212 liens
ressource↔question, mots de passe en bcrypt coût 10 partout, dérive schéma/migrations quasi
nulle. Le mécanisme de migration versionné fonctionne. C'est au-dessus de la moyenne des
projets de cette taille.

**Trois défauts sérieux existent malgré tout.**

1. **Le calage GPS de la carte « forêt comestible » est géométriquement impossible** :
   deux ancres distantes de 85 % du plan sont à 3,7 m l'une de l'autre, contre 55,2 m pour
   deux ancres distantes de 48 %. Facteur 26 entre les échelles implicites — la
   fonctionnalité « Suivre ma position » ne peut pas fonctionner sur cette carte. **§3.1**

2. **Deux colonnes de date mélangent deux formats incompatibles**, et le tri en est faux
   à l'écran : **15 paires de marqueurs et 30 paires de tutoriels** sont affichées dans le
   désordre. Symptôme d'un fond plus large — 29 colonnes temporelles typées
   `VARCHAR(32)`. **§3.2**

3. **Deux tables supprimées ressuscitent à chaque démarrage.** La migration 164 supprime
   `role_pin_secrets` et `elevation_audit` ; `initSchema()` les recrée juste avant, à
   chaque boot, parce que `sql/schema_foretmap.sql` les déclare encore. **§3.3**

S'y ajoute un piège qui n'affecte pas la production mais **compromet toute copie** de la
base : les deux vues SQL portent le nom de la base en dur dans leur définition. C'est
visible dans la copie auditée, dont les vues lisent la production. **§4.1**

**Priorité : §3.1 et §3.2** (visibles par l'utilisateur), puis §3.3 et §4.1 (structurels,
peu coûteux à corriger).

---

## 2. Méthode et volumétrie

L'export a été analysé hors ligne (aucun serveur MySQL disponible ici) : le DDL, les
contraintes, les index et les **19 460 lignes de données** ont été reparsés, puis
confrontés au dépôt — schéma initial, 171 migrations, requêtes SQL du code applicatif.

| Mesure                        | Valeur                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Tables                        | **135** + 2 vues                                                                         |
| — dont ForetMap / GL / Visite | 64 / 62 / 8                                                                              |
| Colonnes                      | 1 157                                                                                    |
| Lignes de données             | **19 460** (ForetMap 6 996 · GL 12 290 · Visite 108)                                     |
| Clés étrangères               | 176                                                                                      |
| Index déclarés                | 418                                                                                      |
| Tables vides                  | 29                                                                                       |
| Moteur / jeu de caractères    | InnoDB · `utf8mb4` (133 tables `unicode_ci`, 2 `general_ci`)                             |
| `schema_version`              | **175** (le dépôt est à 176 — écart normal, la migration 176 est postérieure à l'export) |

Les cinq plus grosses tables : `gl_resource_question_links` (4 449),
`gl_qcm_question_glossary` (2 776), `security_events` (1 909),
`gl_glossary_term_relations` (1 256), `audit_log` (1 155).

---

## 3. Constats critiques

### 3.1 — Le géoréférencement GPS est inexploitable

**Gravité : élevée. La fonctionnalité « Suivre ma position » ne peut pas fonctionner.**

`maps.geo_anchors_json` stocke 3 points de calage (`migrations/148_map_georef.sql`), d'où
`src/utils/mapGeoTransform.js` dérive une transformation affine.

#### a) Carte `foret` : échelles incompatibles d'un facteur 26

| Paire d'ancres | Écart à l'écran | Distance GPS réelle | Échelle implicite |
| -------------- | --------------- | ------------------- | ----------------- |
| A→B            | 85,5 % du plan  | **3,7 m**           | 0,04 m / %        |
| A→C            | 48,4 % du plan  | **55,2 m**          | 1,14 m / %        |

Deux points séparés par 85 % de la hauteur du plan sont, d'après leurs coordonnées GPS,
distants de moins de quatre mètres. Aucune transformation affine ne peut réconcilier cela :
la carte `foret` est **mal calée**, et la mascotte suivie au GPS sera projetée n'importe où.

Pour comparaison, la carte `lyautey` est cohérente (3,13 m/% et 3,24 m/% — écart 3 %) :
le problème est propre à `foret`, pas au modèle.

**Pourquoi la validation ne l'a pas vu.** `isValidAnchors()`
(`src/utils/mapGeoTransform.js:26-41`) ne teste la non-colinéarité que dans le **repère
écran** (`area > 1e-9`) ; rien ne contrôle le repère GPS. Le déterminant du système résolu
vaut −1,07 × 10⁻⁸ pour `foret` contre −2,65 × 10⁻⁶ pour `lyautey` : cent fois plus proche
de la singularité, mais toujours au-dessus de `COLLINEAR_EPSILON = 1e-12`. Le garde-fou
existe, il est simplement placé sur le mauvais repère.

#### b) Longitude probablement de signe inversé, sur les deux cartes

Les six ancres stockent `lat ≈ 33,594…33,597` et **`lng ≈ +7,634…+7,636`**. Le Lycée
Lyautey est à Casablanca, aux alentours de **33,59° N / −7,63° O**. La latitude concorde ;
la longitude concorde **en valeur absolue mais pas en signe** — +7,63° place le repère
en plein Sahara, à environ 1 400 km à l'est.

`MapGeorefPanel.jsx:86` capte la position du navigateur avec le bon signe ; la saisie
manuelle (`MapGeorefPanel.jsx:241`, `Number(e.target.value)`) accepte en revanche
n'importe quoi, et `lib/mapGeoref.js:37` ne valide que l'intervalle `[-180, 180]`. Une
saisie au clavier sans le signe « − » explique tout.

Si le signe est bien inversé, le navigateur remonte −7,63 tandis que la transformation
attend +7,63 : **la position calculée sort du plan sur les deux cartes**, y compris
`lyautey` pourtant bien calée par ailleurs.

**La PR #310, ouverte le jour même de l'export, confirme le diagnostic sans le résoudre.**
Elle corrige précisément la _saisie_ des coordonnées — champs `type="number"` remplacés par
du texte tolérant, prise en charge du moins typographique `−`, des lettres d'hémisphère
(`7.5898 O`, `W 7.5898`) et des liens Google Maps. C'est le bon correctif pour empêcher que
le problème se reproduise. Mais elle ne fait **ni l'un ni l'autre des deux gestes
nécessaires ici** : elle ne corrige pas les ancres **déjà stockées**, et elle n'ajoute
aucun contrôle de **plausibilité d'échelle** (a). Les deux constats de cette section
restent donc entiers après fusion de #310.

> ⚠️ **À confirmer par vous** : le point (b) est le seul constat de cet audit qui repose
> sur une connaissance extérieure (la localisation réelle de l'établissement) et non sur le
> code ou les données seules.

**Vérification**

```sql
SELECT id, gps_enabled, geo_anchors_json FROM maps WHERE geo_anchors_json IS NOT NULL;
```

**Correction.** (1) Recaler la carte `foret` avec trois ancres réellement éloignées et
non alignées, relevées sur le terrain. (2) Corriger le signe des longitudes si confirmé.
(3) Renforcer la validation : rejeter un jeu d'ancres dont les échelles implicites entre
paires divergent au-delà d'un facteur raisonnable (2 ou 3), et alerter si les ancres
tombent à plus de quelques kilomètres les unes des autres. C'est un contrôle de
plausibilité, pas un contrôle de type — le second existe déjà, le premier manque.

---

### 3.2 — 29 dates en `VARCHAR(32)`, deux formats mélangés, tri cassé

**Gravité : élevée. Bug visible par l'utilisateur, démontré ligne à ligne.**

Vingt-neuf colonnes temporelles des tables historiques ForetMap sont typées
`VARCHAR(32)` — héritage du portage SQLite→MySQL. Les tables GL, plus récentes, utilisent
correctement `DATETIME`. Extrait :

`audit_log.created_at` · `tasks.due_date` · `tasks.created_at` · `tasks.start_date` ·
`task_assignments.assigned_at` · `task_assignments.done_at` · `map_markers.created_at` ·
`tutorials.created_at` · `zone_history.harvested_at` · `zone_photos.uploaded_at` ·
`user_tutorial_reads.acknowledged_at` · `users.last_seen` · `visit_*.created_at`…
(liste complète en annexe A).

En soi, c'est un défaut de forme supportable **tant que le format reste unique**. Il ne
l'est plus :

| Colonne                  | Format `YYYY-MM-DD HH:MM:SS` | Format ISO `…T…Z` |
| ------------------------ | ---------------------------- | ----------------- |
| `map_markers.created_at` | 21 lignes                    | 42 lignes         |
| `tutorials.created_at`   | 19 lignes                    | 5 lignes          |
| `users.last_seen`        | 26 lignes                    | 37 lignes         |

> **Correction apportée en cours d'exécution du plan.** Le relevé initial n'annonçait que
> deux colonnes : son motif de détection ne retenait que les noms terminant par `_at`,
> `date` ou `time`, et laissait donc passer `users.last_seen` — qui sert au tri « vu
> récemment ». Le recensement exhaustif, colonne par colonne, en trouve **trois**. Les
> quatre colonnes de DATE SEULE (`tasks.due_date`, `tasks.start_date`,
> `tasks.recurrence_spawned_for_due_date`, `zone_history.harvested_at`) sont homogènes en
> `YYYY-MM-DD` et hors sujet : ce sont des dates, pas des instants.

Les deux familles proviennent de deux écritures différentes :
`new Date().toISOString()` côté application (`routes/map.js:99`,
`routes/tutorials.js:591`, `lib/importTutosFromFilesystem.js:277`) contre `NOW()` côté SQL
(`sql/schema_foretmap.sql:320`, scripts d'import). Un `DATETIME` aurait normalisé les deux ;
un `VARCHAR` les stocke telles quelles.

**Le tri en est faussé.** MySQL trie une chaîne octet par octet ; au dixième caractère il
compare `'T'` (0x54) à `' '` (0x20). Toute date ISO passe donc après toute date MySQL du
même jour, quelle que soit l'heure réelle. Les plages se chevauchent (26 mars → 5 avril),
donc le problème est actif :

- **`map_markers` : 15 paires inversées.** `ORDER BY m.created_at` (`routes/map.js:172-173`)
  place « Gommier » (`2026-04-05 18:04:00`, soit 16:04 UTC) **avant** « Ficus »
  (`2026-04-05T08:01:46.468Z`), alors que Gommier est postérieur de huit heures.
- **`tutorials` : 30 paires inversées**, même mécanisme.

S'y ajoute un décalage de fuseau : le format ISO est en UTC, `NOW()` en heure locale
(Europe/Paris). Sur `audit_log`, où les deux colonnes `created_at` (ISO) et `occurred_at`
(`DATETIME`) décrivent le **même** événement, l'écart mesuré est de **+2 h sur 921 lignes**
(heure d'été) et **+1 h sur 225 lignes** (heure d'hiver) — cohérent avec un horodatage
local non annoté. Neuf lignes supplémentaires présentent des écarts aberrants (5 h, 25 h,
27 h, 94 h) : ce sont les lignes rétro-remplies lors de l'ajout de `occurred_at`, dont
`occurred_at` est **faux**.

**Vérification**

```sql
SELECT SUM(created_at LIKE '%T%') AS iso,
       SUM(created_at NOT LIKE '%T%') AS mysql_fmt
  FROM map_markers;

SELECT id, label, created_at FROM map_markers
 ORDER BY created_at;               -- ordre affiché
SELECT id, label, created_at FROM map_markers
 ORDER BY STR_TO_DATE(REPLACE(REPLACE(created_at,'T',' '),'Z',''), '%Y-%m-%d %H:%i:%s');
-- ordre réel : comparer les deux
```

**Correction, en deux temps.**

1. _Immédiat, sans migration_ : normaliser à l'écriture (une seule fonction utilitaire
   produisant le format `YYYY-MM-DD HH:MM:SS` en UTC), puis un `UPDATE` de normalisation
   des lignes existantes. Cela suffit à réparer le tri.
2. _De fond_ : convertir les 29 colonnes en `DATETIME` par migration. Le chantier est
   mécanique mais large (il touche les `INSERT`/`SELECT` de plusieurs dizaines de
   fichiers) — à traiter comme un lot dédié, pas en marge d'autre chose.

---

### 3.3 — Deux tables supprimées sont recréées à chaque démarrage

**Gravité : élevée. Pas d'impact fonctionnel aujourd'hui, mais le mécanisme est général.**

`migrations/164_drop_pin_elevation_system.sql` fait trois choses :

```sql
DROP TABLE IF EXISTS role_pin_secrets;
DROP TABLE IF EXISTS elevation_audit;
ALTER TABLE role_permissions DROP COLUMN requires_elevation;
```

État réel de la base (`schema_version` = 175, la 164 est donc passée) :

| Objet                                 | Attendu après 164 | Constaté               |
| ------------------------------------- | ----------------- | ---------------------- |
| `role_pin_secrets`                    | supprimée         | **présente** (0 ligne) |
| `elevation_audit`                     | supprimée         | **présente** (0 ligne) |
| `role_permissions.requires_elevation` | supprimée         | absente ✔              |

Cette combinaison exacte n'a qu'une explication. Dans `database.js:353-368`, `initSchema()`
exécute **`sql/schema_foretmap.sql` avant `runMigrations()`, à chaque démarrage**. Or ce
fichier déclare toujours les deux tables :

- `sql/schema_foretmap.sql:535` → `CREATE TABLE IF NOT EXISTS role_pin_secrets (...)`
- `sql/schema_foretmap.sql:556` → `CREATE TABLE IF NOT EXISTS elevation_audit (...)`
- `sql/schema_foretmap.sql:525` → `requires_elevation TINYINT(1) NOT NULL DEFAULT 0`

Au boot suivant la migration 164, les deux `CREATE TABLE IF NOT EXISTS` **recréent** les
tables (elles n'existent plus) ; en revanche `requires_elevation` vit à l'intérieur d'un
`CREATE TABLE IF NOT EXISTS role_permissions` qui, lui, ne fait rien puisque la table
existe — d'où la colonne durablement absente. Les faits collent exactement.

La migration 164 est donc, en pratique, **un no-op permanent** sur les deux tables.

Les deux tables sont par ailleurs **totalement mortes** : aucune occurrence dans
`routes/`, `lib/`, `middleware/`, `src/`, `scripts/`. Elles ne coûtent rien en données,
mais elles rendent le schéma menteur.

**Portée du mécanisme.** Croisement de tous les `DROP TABLE` des migrations avec
`sql/schema_foretmap.sql` : seules ces deux tables sont concernées (les 8 autres tables
supprimées — `students`, `teachers`, `gl_player_journals`, `visit_marker_content`… — ne
sont plus déclarées, elles restent bien supprimées). Le risque est donc **circonscrit
aujourd'hui**, mais il se reproduira au prochain `DROP TABLE` si le fichier de schéma
n'est pas nettoyé dans le même lot.

**Correction proposée.** Retirer les trois déclarations de `sql/schema_foretmap.sql`, puis
une migration qui rejoue les deux `DROP TABLE IF EXISTS`. Ajouter à la CI un contrôle
liant les deux fichiers : _aucun objet supprimé par une migration ne doit rester déclaré
dans le schéma initial_ — c'est un test de cohérence de 20 lignes, et il ferme la classe
entière de bugs.

> **Ce n'est pas la correction retenue.** Retirer les déclarations s'est révélé impossible :
> les migrations 025, 029, 034, 139 et 163 lisent ou écrivent ces objets et échoueraient sur
> une base neuve. Voir **§8** pour la solution appliquée — `lib/legacySchemaCleanup.js`, qui
> les supprime après les migrations à chaque démarrage. Le contrôle CI, lui, a bien été
> ajouté (`tests/schema-legacy-scaffolding.test.js`).

---

## 4. Constats majeurs

### 4.1 — Les vues portent le nom de la base en dur : toute copie lit la production

**Gravité : moyenne en l'état — élevée dès qu'une copie de la base est exploitée.**
**La production `oliviera_foretmap` n'est pas affectée.**

La copie auditée contient (lignes 24042 et 24051 de l'export) :

```sql
CREATE ... VIEW `v_food_web` AS SELECT ...
  FROM ((`oliviera_foretmap`.`species_interactions` `si`
    join `oliviera_foretmap`.`plants` `pf` ...
CREATE ... VIEW `v_zone_inventory` AS SELECT ...
  FROM ((`oliviera_foretmap`.`zone_species` `zs`
    join `oliviera_foretmap`.`zones` `z` ...
```

Les migrations 124 et 143 écrivent pourtant des noms **non qualifiés**
(`migrations/143_food_web_trophic_roles.sql:12` → `FROM species_interactions si`).
MariaDB **résout et fige** ces noms avec la base active au moment du `CREATE VIEW`. Dans
`oliviera_foretmap`, les vues se référencent donc elles-mêmes : **tout va bien en
production**. Mais le nom voyage avec le schéma, et **toute copie hérite d'une vue qui
pointe vers la production**.

C'est exactement ce qu'on observe dans `oliviera_foretmap5`. Deux scénarios concrets :

- **Copie restaurée sur le serveur** (préproduction, base de secours, essai de bascule) :
  `routes/food-web.js` **écrit** dans `species_interactions` — nom non qualifié, donc la
  base de la copie — puis **relit immédiatement par la vue**
  (`routes/food-web.js:26-28`), c'est-à-dire dans la **production**. L'interaction créée
  n'est jamais retrouvée, et l'écran affiche des données de production dans un
  environnement censé en être isolé.
- **Copie restaurée en local** via le flux documenté
  (`docs/LOCAL_DEV.md:90`, `npm run db:import:dump`) : le script rejoue le dump tel quel
  dans `foretmap_local` (`scripts/import-foretmap-dump.js:120`, un seul
  `targetConn.query(dumpSql)`). Comme `oliviera_foretmap` n'existe pas sur la machine du
  développeur, MariaDB refuse le `CREATE VIEW` (table référencée introuvable) et, faute de
  découpage des instructions, **l'import s'arrête là**.

Aucun test ne peut détecter cela : `tests/gl-dead-views-dropped.test.js` vérifie seulement
que les vues **existent**, jamais ce qu'elles lisent.

**Vérification (à passer sur la production `oliviera_foretmap`)**

```sql
SELECT TABLE_NAME, VIEW_DEFINITION
  FROM information_schema.VIEWS
 WHERE TABLE_SCHEMA = DATABASE();
-- Attendu en production : les tables citées portent le nom de la base courante.
-- Toute autre valeur signalerait que la production elle-même est issue d'une copie.
```

**Correction.** Une migration `183_*` qui rejoue les deux `CREATE VIEW` (le SQL des
migrations 124 et 143 est correct tel quel) : exécutée par le runner **dans la base
courante**, elle recalcule la qualification, quelle que soit la base. Ajouter un test qui
assert que `VIEW_DEFINITION` ne cite aucun schéma autre que `DATABASE()` — c'est le seul
garde-fou contre la réapparition du problème à la prochaine copie. Accessoirement,
`import-foretmap-dump.js` gagnerait à découper le dump en instructions pour ne pas perdre
tout l'import sur une seule erreur.

### 4.2 — `user_roles` et `password_reset_tokens` sans clé étrangère : orphelins constatés

Ces deux tables référencent un utilisateur par le couple `(user_type, user_id)` **sans
contrainte FK** (aucune ne peut porter sur `users(id)` seul tant que la clé est composite).
Résultat mesuré sur les données :

```
user_roles.user_id            : 126 références → 1 orpheline
password_reset_tokens.user_id :   7 références → 1 orpheline
```

Il s'agit du même compte supprimé, `9ef0641e-0950-4c8a-8c05-f5da1f9d7eb0`, qui conserve :

- une attribution de rôle `eleve_novice` marquée **`is_primary = 1`** (posée le 2026-03-25) ;
- un **jeton de réinitialisation de mot de passe** non consommé (`used_at` NULL).

Le jeton a expiré le 2026-03-25 à 16:00 : **il n'est pas exploitable aujourd'hui**. Mais
la garantie manquante, elle, est structurelle : rien n'empêche qu'un jeton **valide**
survive à la suppression d'un compte.

`lib/studentDeletion.js:41-49` purge bien les deux tables — la fonction est correcte. Ces
orphelins prouvent qu'un **autre chemin de suppression** a existé (ou existe) qui ne passe
pas par elle. Une FK aurait rendu l'oubli impossible ; un helper applicatif ne le peut pas.

Toutes les autres relations vers `users` sont **propres** : 925 références dans
`audit_log`, 1 588 dans `security_events`, 112 dans `task_assignments`, 56 dans
`group_members`, 34 dans `user_plant_observation_events` — **zéro orpheline**.

**Vérification et nettoyage**

```sql
SELECT ur.* FROM user_roles ur
  LEFT JOIN users u ON u.id = ur.user_id AND u.user_type = ur.user_type
 WHERE u.id IS NULL;
SELECT t.* FROM password_reset_tokens t
  LEFT JOIN users u ON u.id = t.user_id AND u.user_type = t.user_type
 WHERE u.id IS NULL;
```

**Correction.** Purger les deux lignes, puis ajouter les FK. Le couple
`(user_type, user_id)` n'étant pas unique dans `users` du point de vue de l'index, la voie
la plus simple est une FK sur `user_id` seul vers `users(id)` (`ON DELETE CASCADE`), la
colonne `user_type` restant informative — `users.id` est déjà la clé primaire, c'est
suffisant.

### 4.3 — Un compte élève porte une attribution du rôle `prof`

`user_roles` contient une ligne `('student', <yahya.kazzouzi>, prof, is_primary = 0)`.

**Ce n'est pas exploitable en l'état** : `getPrimaryRoleForUser()` (`lib/rbac.js:762-768`)
filtre sur `is_primary = 1`, et les trois autres lectures de `user_roles`
(`routes/rbac.js:654,879,947`, `routes/auth.js:202`) sont des lectures d'affichage. Le
compte n'obtient donc aucun droit enseignant.

Le risque est **conditionnel et réel** : `repairDuplicatePrimaryRoles()`
(`lib/rbac.js:647-684`) départage les primaires en double par `ORDER BY r.rank DESC`. Si
ce compte se retrouvait un jour avec deux rôles primaires, le rôle conservé serait celui
de **rang le plus élevé** — c'est-à-dire `prof` (rang 400) et non `eleve_novice` (100). Une
réparation automatique promouvrait alors un élève enseignant.

Deux autres attributions résiduelles sont à nettoyer dans le même geste :
`('teacher', eleve_novice, 0)` et, pour le compte `oliviera999`, trois rôles simultanés
(`admin`, `prof`, `mode_collectif`) dont deux non primaires.

```sql
SELECT ur.user_type, u.pseudo, r.slug, ur.is_primary, ur.assigned_at
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  LEFT JOIN users u ON u.id = ur.user_id
 WHERE (ur.user_type = 'student' AND r.slug IN ('prof','admin','mode_collectif'))
    OR (ur.user_type = 'teacher' AND r.slug LIKE 'eleve%');
```

### 4.4 — Deux journaux d'audit, dont un que personne ne lit

> **Constat révisé après vérification.** La première rédaction concluait que « aucun des
> deux journaux n'est complet, et rien ne dit lequel fait foi ». C'est faux : l'écart
> s'explique **entièrement** par la date de naissance de `security_events`.

`audit_log` (1 155 lignes) et `security_events` (1 909 lignes) enregistrent en grande
partie les mêmes événements métier. Les comptages coïncident sur la plupart des actions
(`assign_task` 169/169, `update_task` 159/159, `done_task` 82/82) mais pas sur toutes :

| Action          | `audit_log` | `security_events` | Écart | Lignes antérieures au 2026-03-25 14:50 UTC |
| --------------- | ----------- | ----------------- | ----- | ------------------------------------------ |
| `validate_task` | 100         | 95                | 5     | **5**                                      |
| `create_task`   | 89          | 86                | 3     | **3**                                      |
| `propose_task`  | 10          | 9                 | 1     | **1**                                      |

`security_events` commence le **2026-03-25 à 14:50 UTC** ; `audit_log`, quatre jours plus
tôt. Les neuf événements en surplus sont exactement les neuf antérieurs à cette date.
Depuis, `logAudit()` écrit dans les deux tables à la suite (`routes/audit.js`) et **elles
ne divergent plus d'une ligne**. `security_events` porte en outre les 763 événements
d'authentification (556 `auth.login`, 111 OAuth enseignant, 67 OAuth élève…) que
`logAudit` n'émet pas.

Le vrai constat est ailleurs : **`security_events` n'est lu par aucune ligne du code.**
Aucune occurrence en lecture dans `routes/`, `lib/` ou `scripts/` — 1 909 lignes écrites et
jamais consultées autrement qu'à la main. `audit_log`, lui, est vivant : écran d'audit
(`routes/audit.js:26`) et résolution du proposeur d'une tâche
(`lib/tasks/taskQueries.js:163`).

Restent deux défauts réels, tous deux corrigés dans le lot d'exécution :

- **`audit_log` portait deux horodatages contradictoires du même événement** :
  `created_at` en ISO-8601 UTC et `occurred_at` en heure locale — +2 h sur 921 lignes,
  +1 h sur 225, plus neuf lignes rétro-remplies dont l'`occurred_at` était franchement faux
  (écarts de 5 h à 94 h). La migration 188 recale `occurred_at` depuis `created_at`, qui
  fait foi, et l'écriture passe à `UTC_TIMESTAMP()`. Aucun effet visible : `occurred_at`
  n'est lu par aucune fonctionnalité (l'écran d'audit affiche `created_at`).
- **Le double écrit échouait en silence.** Les deux `catch` de `routes/audit.js`
  n'enregistraient rien : c'est par ce silence que les deux journaux auraient pu diverger
  sans que personne ne le sache. Ils journalisent maintenant en `warn`.

`security_events.occurred_at` **reste en heure locale**, à dessein : rien ne permet de
recaler son historique — contrairement à `audit_log`, elle n'a pas de second horodatage de
référence — et une colonne homogène en local vaut mieux qu'une discontinuité de fuseau au
milieu du journal. C'est documenté à l'endroit où on l'écrit.

### 4.5 — Trois tables de liaison remplacées mais jamais supprimées (3 230 lignes)

Les migrations 144 et 145 ont unifié les liens ressource↔question dans
`resource_question_links` / `gl_resource_question_links`. Les tables d'origine sont restées
« intactes » — c'était le choix explicite de la migration 144, qui annonçait la convergence
« _dans un lot ultérieur_ ». Ce lot n'est pas venu.

Bonne nouvelle : **la reprise est complète et vérifiée**. Aucun lien ancien ne manque dans
le nouveau modèle :

| Table héritée                   | Lignes | Reprise dans le modèle unifié                                                | Manquants |
| ------------------------------- | ------ | ---------------------------------------------------------------------------- | --------- |
| `quiz_question_glossary`        | 293    | `resource_question_links[glossary]` (420)                                    | **0**     |
| `gl_qcm_question_glossary`      | 2 776  | `gl_resource_question_links[qcm/glossary]` (3 029)                           | **0**     |
| `gl_qcm_lore_question_glossary` | 161    | `gl_resource_question_links[qcm_lore/lore_glossary]` (161 `origin='import'`) | **0**     |

Les trois tables ne sont plus lues par aucune ligne de `routes/`, `lib/` ou `src/` ; les
tests l'assertent explicitement (`tests/quiz-api.test.js:254`,
`tests/fm-quiz-import.test.js:135`). Ce sont **3 230 lignes de double source de vérité**
qui ne demandent qu'à diverger le jour où quelqu'un les modifiera à la main.

**Correction.** Une migration de suppression, sans risque — la reprise est prouvée
ci-dessus et rejouable :

```sql
SELECT COUNT(*) FROM quiz_question_glossary q
 WHERE NOT EXISTS (SELECT 1 FROM resource_question_links r
                    WHERE r.resource_type='glossary' AND r.resource_ref=q.glossary_code
                      AND r.question_code=q.question_code);   -- doit valoir 0
```

---

## 5. Constats mineurs et hygiène

### 5.1 — `.gitignore` ne couvre pas le nom réel des dumps

`CLAUDE.md` interdit de versionner un dump (PII). `.gitignore:35-38` bloque
`*_bdd_complete.sql`, `*_dump.sql`, `*-dump.sql`, `sql/dumps/`. Or phpMyAdmin nomme son
export **d'après la base** — et c'est aussi le nom que la documentation d'installation
locale donne au fichier téléchargé (`docs/LOCAL_DEV.md:90` →
`oliviera_foretmap.sql`) :

```
$ git check-ignore -v oliviera_foretmap.sql    → NON IGNORÉ
$ git check-ignore -v oliviera_foretmap5.sql   → NON IGNORÉ
```

L'export analysé ici contient 63 comptes réels (dont des mineurs), 63 noms+prénoms,
30 adresses e-mail, 61 hachages bcrypt, 48 adresses IP et 1 904 user-agents. Déposé à la
racine du dépôt sous le nom que la doc recommande, il **serait committé**.

**Correction (une ligne)** : ajouter `oliviera_*.sql` et, plus robuste, `*.sql` avec des
exceptions explicites `!sql/schema_foretmap.sql`, `!sql/biodiv_pedago_seed.sql`,
`!sql/quiz_foretmap_data.sql`, `!sql/zones_lyautey_batiments.sql`, `!migrations/*.sql`.
La liste blanche est courte et stable : c'est le sens de la règle, et elle résiste aux noms
de fichiers imprévus.

### 5.2 — Aucune politique de rétention sur les journaux

`security_events` conserve **48 adresses IP et 1 904 user-agents** sans limite de durée ;
`audit_log` grossit de même. Aucun `DELETE`/purge périodique n'existe dans `routes/`,
`lib/` ou `scripts/`. Adresse IP et user-agent sont des données personnelles : dans un
établissement scolaire, une durée de conservation bornée (6 ou 12 mois) est attendue.
Un script de purge appelable par cron — `docs/CRONTAB.md` existe déjà — règle le sujet.

### 5.3 — Séquences `AUTO_INCREMENT` consommées à vide

| Table        | Lignes | `AUTO_INCREMENT` | Trous  |
| ------------ | ------ | ---------------- | ------ |
| `roles`      | 14     | **14 609**       | 14 594 |
| `tutorials`  | 24     | 910              | 885    |
| `gl_species` | 254    | 510              | 255    |

Mécanisme : sous InnoDB, un `INSERT IGNORE` qui échoue sur une clé unique **consomme quand
même** une valeur de séquence. Or `ensureDefaultRolesAndPermissions()` (`lib/rbac.js:614-624`)
réinsère les 14 rôles système à chaque démarrage de processus, et
`sql/schema_foretmap.sql:320` réinsère les tutoriels de départ à chaque appel d'`initSchema()`.

Sans conséquence fonctionnelle (`INT UNSIGNED` plafonne à 4,29 milliards), mais deux effets
de bord : les identifiants de rôle deviennent illisibles (`gl_admin` = 9810), et l'ampleur
du chiffre est un **indicateur** du nombre de redémarrages — utile à croiser avec
`docs/SERVER_STABILITY_AUDIT.md`. Correction : un `SELECT` préalable, ou
`INSERT ... ON DUPLICATE KEY UPDATE id = id`.

### 5.4 — Doublons de contenu

- **`tutorials` — bien plus grave que ce que le relevé initial annonçait.** Non pas « deux
  titres en double » (le rapprochement se faisait sur des titres normalisés, qui ratent
  « Le désherbage doux » contre « Désherbage doux »), mais **24 tutoriels pour 14 contenus
  distincts** : neuf groupes de doublons, et dans **huit** d'entre eux les DEUX copies sont
  actives — chaque fiche apparaissait donc deux fois aux élèves. Cause : le jeu de
  démarrage de `sql/schema_foretmap.sql` était rejoué à chaque `initSchema()`, donc à
  chaque démarrage, avec une clé unique sur `slug`. Quand l'import depuis `tutos/*.html`
  avait déjà créé la fiche sous un autre slug (`le-desherbage-doux` dérivé du titre H1
  contre `desherbage-doux`), l'`INSERT IGNORE` ne voyait aucun doublon et insérait une
  seconde copie.
- **`gl_qcm_questions`** : 4 énoncés dupliqués (2 à 3 exemplaires), dont
  « Quel est le nom scientifique du loup gris ? » ×3.
- **`zones`** : 7 noms en double, tous des libellés de remplissage jamais renommés
  (« Nommer secteur centre-nord » ×3).
- **`groups`** : deux groupes nommés `test`.

Aucun n'est bloquant ; tous polluent l'interface élève. Les 14 questions quiz partageant
l'énoncé « Quelle espèce du jardin reconnais-tu sur cette photo ? » sont, elles,
**normales** (questions photo).

### 5.5 — Slugs de rôles abîmés par la translittération

`roles.slug` contient `el_ve_expert` (pour « élève expert ») et `n3beur_b_b` (pour
« n3beur bébé »). La normalisation appliquée **supprime** les caractères accentués au lieu
de les translittérer. Les `display_name` sont corrects (« n3beur expert », « n3beur bébé ») :
seul l'identifiant technique est atteint — mais c'est celui qui apparaît en URL et en API.
Corriger la fonction de slug (décomposition NFD **puis** retrait des diacritiques, comme le
fait déjà `lib/shared/stringHelpers.js:32-39`) et renommer les deux slugs existants.

### 5.6 — 15 index redondants

Quinze index sont le **préfixe strict** d'un autre index de la même table : ils
n'accélèrent rien et coûtent à chaque écriture. Exemples :

```
task_assignments : idx_task_assignments_task_id(task_id) ⊂ uq_task_assignments_task_student(task_id, student_id)
quiz_questions   : idx_quiz_cat(categorie_slug)          ⊂ uq_quiz_cat_num(categorie_slug, numero_dans_categorie)
gl_qcm_questions : idx_gl_qcm_biome_cat(biome_slug, categorie_slug)
                                                          ⊂ uq_gl_qcm_biome_cat_num(biome_slug, categorie_slug, numero_dans_categorie)
```

Liste complète en annexe B. Aucun n'est urgent ; leur suppression est un gain net.

### 5.7 — Divers

- **Collations mixtes** : `gl_game_constants` et `gl_game_constant_refs` sont en
  `utf8mb4_general_ci`, les 133 autres en `utf8mb4_unicode_ci`. Toute jointure sur une
  colonne texte entre ces deux mondes lèverait `Illegal mix of collations`. Ces deux tables
  ne sont lues par aucun code applicatif (seulement par `tests/gl-game-constants.test.js`),
  donc le risque est dormant — à aligner avant tout usage.
- **Sept colonnes `statut` sans variation** : `gl_glossary_terms`, `gl_lore_feuillets`,
  `gl_qcm_questions`, `gl_species`, `glossary_terms`, `quiz_questions`,
  `gl_lore_glossary_terms` valent `'actif'` sur **100 %** de leurs 2 444 lignes. La colonne
  ne porte aucune information : soit le cycle de vie brouillon/archivé n'est pas utilisé,
  soit il faut la retirer.
- **Réglages morts** : `app_settings` contient encore
  `security.jwt_ttl_elevated_seconds`, vestige du système d'élévation supprimé par la
  migration 164.
- **Données mortes** : `gl_species_interactions` (67 lignes) n'était lue que par la vue
  `v_gl_food_web`, supprimée par la migration 152. Personne ne la lit plus.
- **Script cassé** : `scripts/migrate-sqlite-to-mysql.js:232` insère
  `map_markers.living_beings`, colonne supprimée par la migration 130. Le script échouerait.
- **`gl_spell_cast_contributions.player_id → gl_players`** et
  **`gl_games.chapter_id → gl_chapters`** sont en `RESTRICT` implicite (aucune action
  `ON DELETE`) : supprimer un joueur ayant contribué à un sort, ou un chapitre servant de
  base à une partie, échouera sur une erreur FK brute plutôt que sur un message métier.
- **Aucun garde-fou base de test/production** : `tests/helpers/setup.js:3` utilise
  `DB_NAME` du `.env` dès que `TEST_DB_NAME` est absent, et chaque fichier de test appelle
  `initSchema()`. Un `npm test` lancé avec un `.env` pointant la production écrirait
  dedans. **Aucune trace d'un tel incident dans l'export** (aucun compte
  `admin.test@foretmap.local`, aucun artefact e2e) — c'est un risque, pas un accident.
  Trois lignes suffisent : refuser de démarrer si `DB_NAME` ne correspond pas à un motif
  de base de test.

---

## 6. Ce que la base fait bien

Ces points sont vérifiés, pas supposés — ils méritent d'être préservés lors des corrections.

- **Intégrité référentielle polymorphe parfaite.** Les 5 212 liens de
  `resource_question_links` et `gl_resource_question_links` pointent vers des ressources
  et des questions **toutes existantes**, alors même que le modèle polymorphe **ne peut
  pas** être protégé par une FK côté ressource. Zéro orpheline sur six types
  (`plant`, `tutorial`, `glossary`, `species`, `lore_glossary`, `feuillet`). Le nettoyage
  applicatif annoncé par la migration 144 tient réellement ses promesses.
- **Encodage impeccable.** Zéro occurrence de mojibake (`Ã©`, `â€™`, `ðŸ`…), zéro
  caractère de remplacement U+FFFD sur 5,8 Mo. Les migrations 140 et 141 ont fait leur
  travail et rien n'a régressé depuis.
- **Aucune image en base.** Pas un seul `data:image` ; le plus gros champ texte de toute
  la base fait 29 Ko (`tutorials.html_content`). La migration 006 a bien assaini le
  stockage.
- **Mots de passe corrects.** bcrypt coût 10 sur les 61 comptes avec mot de passe et sur
  les 26 joueurs GL, conformément à `CLAUDE.md`. Les deux comptes sans hachage sont des
  comptes OAuth.
- **Isolement GL respecté.** Une seule clé étrangère traverse la frontière entre les deux
  produits — `gl_classes.foretmap_group_id → groups.id`, documentée et voulue par la
  migration 146. Les 62 tables GL sont sinon hermétiques.
- **Dérive schéma/migrations quasi nulle.** La reconstruction statique du schéma attendu
  (schéma initial + 171 migrations) et la base réelle ne divergent que sur les deux tables
  ressuscitées du §3.3 et sur la migration 176, postérieure à l'export. Le runner versionné
  de `database.js` fonctionne.
- **Couverture d'index correcte** sur les tables volumineuses ; aucune requête
  applicative ne fait de balayage sur une grosse table (les deux recherches `LIKE '%…%'`
  portent sur des tables de 175 et 205 lignes).
- **Aucune table sans clé primaire**, `InnoDB` et `utf8mb4` partout.

---

## 7. Plan d'action proposé

Par rapport bénéfice/risque décroissant. **Ce plan a depuis été exécuté** — voir §8 pour
l'état point par point et les écarts assumés.

| #   | Action                                                                                                                                                             | Gravité        | Effort        | Réf.       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ------------- | ---------- |
| 1   | Recaler les ancres GPS `foret`, vérifier le signe des longitudes, ajouter un contrôle de plausibilité d'échelle                                                    | **Élevée**     | 2 h + terrain | §3.1       |
| 2   | Normaliser l'écriture des dates (une seule fonction) + `UPDATE` de normalisation de `map_markers` et `tutorials`                                                   | **Élevée**     | 3 h           | §3.2       |
| 3   | Retirer `role_pin_secrets`, `elevation_audit`, `requires_elevation` de `sql/schema_foretmap.sql` + migration de `DROP` + test de cohérence schéma↔migrations en CI | **Élevée**     | 2 h           | §3.3       |
| 4   | Migration `183_*` recréant les deux vues + test interdisant tout schéma qualifié dans `VIEW_DEFINITION`                                                            | Majeure        | 1 h           | §4.1       |
| 5   | Purger les 2 orphelins puis poser les FK `user_roles → users` et `password_reset_tokens → users`                                                                   | Majeure        | 1 h           | §4.2       |
| 6   | Nettoyer les attributions de rôles résiduelles (élève↔prof)                                                                                                        | Majeure        | 30 min        | §4.3       |
| 7   | Élargir `.gitignore` aux dumps nommés d'après la base                                                                                                              | Majeure        | 5 min         | §5.1       |
| 8   | Supprimer les 3 tables de liaison héritées (3 230 lignes), reprise déjà prouvée                                                                                    | Moyenne        | 1 h           | §4.5       |
| 9   | Trancher entre `audit_log` et `security_events`                                                                                                                    | Moyenne        | ½ j           | §4.4       |
| 10  | Script de purge des journaux (rétention 6–12 mois)                                                                                                                 | Moyenne        | 2 h           | §5.2       |
| 11  | Garde-fou base de test dans `tests/helpers/setup.js` ; découpage des instructions dans `import-foretmap-dump.js`                                                   | Moyenne        | 30 min        | §5.7, §4.1 |
| 12  | Supprimer les 15 index redondants ; aligner les collations ; corriger les slugs de rôles ; dédoublonner tutoriels/zones/questions                                  | Faible         | 2 h           | §5.4–5.7   |
| 13  | Chantier de fond : les 29 colonnes de date en `DATETIME`                                                                                                           | Faible (dette) | 1 lot dédié   | §3.2       |

---

## 8. Ce qui a été exécuté

Points 2 à 12 appliqués. Le point 1 (calage GPS) est explicitement réservé par le
propriétaire du projet : il demande un relevé de terrain. Le point 13 reste un lot dédié,
comme annoncé dès le §3.2.

| #   | État        | Livré                                                                                 |
| --- | ----------- | ------------------------------------------------------------------------------------- |
| 1   | **réservé** | calage GPS — relevé de terrain, traité par le propriétaire du projet                  |
| 2   | fait        | `lib/legacyTimestampNormalization.js`, `lib/shared/isoTimestamp.js`                   |
| 3   | fait        | `lib/legacySchemaCleanup.js` + 2 tests (dont un statique qui ferme la classe entière) |
| 4   | fait        | migration 183 + `tests/schema-views-current-db.test.js`                               |
| 5   | fait        | migration 185 + clés étrangères dans `sql/schema_foretmap.sql`                        |
| 6   | fait        | migration 185 (attributions non primaires croisant les populations)                   |
| 7   | fait        | `.gitignore` en liste blanche                                                         |
| 8   | fait        | migration 186 (reprise rejouée avant suppression)                                     |
| 9   | fait        | migration 188 + `routes/audit.js` (constat révisé, cf. §4.4)                          |
| 10  | fait        | `npm run logs:purge` + ligne de crontab documentée                                    |
| 11  | fait        | garde-fou base de test + découpage des instructions à l'import de dump                |
| 12  | fait\*      | migrations 184 et 187, `src/utils/slugify.js`, `npm run tutorials:dedup`              |
| 13  | à venir     | passage des 29 colonnes de date en `DATETIME` — lot dédié                             |

### Trois écarts assumés par rapport au plan initial

**Point 3 — la correction retenue n'est pas celle qui était proposée.** Le plan disait de
retirer `role_pin_secrets`, `elevation_audit` et `requires_elevation` de
`sql/schema_foretmap.sql`. Impossible : les migrations 025, 029, 034, 139 et 163 lisent ou
écrivent ces objets, et échoueraient sur une base neuve — `ER_BAD_FIELD_ERROR` n'est pas
une erreur tolérée par le runner. Le fichier de schéma les déclare donc toujours, mais
`lib/legacySchemaCleanup.js` les supprime **après** les migrations, à chaque démarrage.
Immunisé contre la résurrection quel que soit l'ordre des passages, et le test statique
`schema-legacy-scaffolding` fait échouer la CI au prochain oubli du même genre.

**Point 12 — le dédoublonnage des tutoriels est un outil, pas une migration.** Le
regroupement est mécanique (`html_content` identique octet pour octet), mais choisir quel
titre survit — « Le jardin punk » ou « Jardin N3 » ? — est une décision éditoriale.
`npm run tutorials:dedup` liste les groupes à blanc et ne fusionne qu'avec `--apply`. La
fusion ne perd aucun lien : lectures attestées, liaisons tâches / zones / marqueurs /
projets / questions / glossaire / visite et références polymorphes sont repointées vers le
tutoriel conservé avant suppression. La **cause**, elle, est fermée sans intervention : le
jeu de démarrage ne s'applique plus qu'à une base vide.

**Point 12 — les doublons de `zones`, `gl_qcm_questions` et `groups` ne sont pas touchés.**
Contrairement aux tutoriels, ce ne sont pas des copies techniques : sept zones portent un
libellé de remplissage jamais renommé (« Nommer secteur centre-nord » ×3) mais désignent
des surfaces réelles et distinctes de la carte ; quatre énoncés de QCM se répètent mais les
questions ont leurs propres réponses et statistiques. Les supprimer détruirait du contenu
pédagogique sur la foi d'une ressemblance de libellé. C'est un travail d'édition, à faire
depuis l'interface prof.

---

## Annexe A — Les 29 colonnes temporelles en `VARCHAR(32)`

```
audit_log.created_at              map_markers.created_at          marker_photos.uploaded_at
observation_logs.created_at       task_assignments.assigned_at    task_assignments.done_at
task_logs.created_at              task_projects.created_at        tasks.due_date
tasks.created_at                  tasks.start_date                tasks.recurrence_spawned_for_due_date
tutorials.created_at              tutorials.updated_at            user_plant_observation_events.observed_at
user_tutorial_reads.acknowledged_at                               users.last_seen
visit_markers.created_at          visit_markers.updated_at        visit_mascot_packs.created_at
visit_mascot_packs.updated_at     visit_mascot_sprite_library.created_at
visit_media.created_at            visit_media.updated_at          visit_tutorials.updated_at
visit_zones.created_at            visit_zones.updated_at          zone_history.harvested_at
zone_photos.uploaded_at
```

À comparer avec `gl_players.last_seen`, typée `DATETIME` : les deux colonnes portent la
même information dans deux types différents.

## Annexe B — Les 15 index redondants

| Table                            | Index redondant                                           | Contenu dans                                                          |
| -------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| `gl_game_rounds`                 | `idx_gl_game_rounds_game(game_id)`                        | `uq_gl_game_rounds_game_round(game_id, round_number)`                 |
| `gl_glossary_term_relations`     | `idx_gl_glossary_relations_from(from_code)`               | `PRIMARY(from_code, to_code)`                                         |
| `gl_lore_glossary_relations`     | `idx_gl_lore_glossary_rel_from(from_code)`                | `PRIMARY(from_code, to_code)`                                         |
| `gl_lore_plateaux`               | `idx_gl_lore_plateaux_number(plateau_number)`             | `uq_gl_lore_plateaux_num_zone(plateau_number, zone_label)`            |
| `gl_market_trade_side_feuillets` | `idx_..._trade(trade_id)`                                 | `PRIMARY(trade_id, player_id, feuillet_code)`                         |
| `gl_qcm_lore_questions`          | `idx_gl_qcm_lore_chap_cat(chapitre_slug, categorie_slug)` | `uq_gl_qcm_lore_chap_cat_num(…, numero_dans_categorie)`               |
| `gl_qcm_questions`               | `idx_gl_qcm_biome_cat(biome_slug, categorie_slug)`        | `uq_gl_qcm_biome_cat_num(…, numero_dans_categorie)`                   |
| `gl_species_interactions`        | `idx_gl_si_from(from_species_id)`                         | `uq_gl_interaction(from_species_id, to_species_id, interaction_type)` |
| `group_scopes`                   | `idx_group_scopes_group(group_id)`                        | `uq_group_scopes_triplet(group_id, map_id, project_id)`               |
| `quiz_questions`                 | `idx_quiz_cat(categorie_slug)`                            | `uq_quiz_cat_num(categorie_slug, numero_dans_categorie)`              |
| `resource_question_links`        | `idx_rql_resource(resource_type, resource_ref)`           | `uq_rql_resource_question(…, question_code)`                          |
| `species_interactions`           | `idx_si_from(from_plant_id)`                              | `uq_interaction(from_plant_id, to_plant_id, interaction_type)`        |
| `task_assignments`               | `idx_task_assignments_task_id(task_id)`                   | `uq_task_assignments_task_student(task_id, student_id)`               |
| `visit_mascot_sprite_library`    | `idx_visit_mascot_sprite_lib_map(map_id)`                 | `uq_visit_mascot_sprite_lib_map_file(map_id, filename)`               |
| `zone_history`                   | `idx_zone_history_zone_id(zone_id)`                       | `idx_zone_history_zone_harvested(zone_id, harvested_at)`              |

## Annexe C — Les 29 tables vides

`context_comment_reports` · `elevation_audit`¹ · `forum_reports` · `gl_action_requests` ·
`gl_forum_posts` · `gl_forum_threads` · `gl_market_trade_messages` ·
`gl_market_trade_side_feuillets` · `gl_market_trade_sides` · `gl_market_trades` ·
`gl_mascot_pack_assets` · `gl_mascot_sprite_library` · `gl_player_journal_article_assets` ·
`gl_player_journal_articles` · `gl_player_journal_imports` · `gl_reference_docs` ·
`gl_resource_gating_cooldowns` · `gl_resource_gating_policy` · `gl_team_scores` ·
`gl_tutorials` · `group_scopes` · `project_markers` · `resource_gating_cooldowns` ·
`resource_gating_policy` · `role_pin_secrets`¹ · `task_markers` ·
`visit_mascot_sprite_library` · `visit_media`

¹ à supprimer (§3.3). Les autres sont des fonctionnalités provisionnées mais pas encore
utilisées (marché GL, carnet du joueur, conditionnement pédagogique) — normal, pas un défaut.
