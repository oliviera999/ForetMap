# Lien Moodle 5.2 ↔ ForetMap / Gnomes & Licornes — spécification d'implémentation

> Septembre 2026. Fait suite à `AUDIT_COMPTES_2026-09.md` (identités unifiées : un compte
> `users` par personne, porteur des secrets, référencé par `gl_players`).
>
> **Ce document est la spécification de référence du chantier et il est écrit pour être donné
> tel quel comme consigne à un agent de codage.** Il décrit ce qu'il faut construire, dans quel
> ordre, avec quelles garanties, et surtout ce qu'il ne faut **jamais** faire. Rien n'est encore
> implémenté. Les valeurs de terrain (cohortes, cours, équipes) de la section 2 sont réelles et
> confirmées par l'établissement ; tout le reste en découle. Le lien Moodle ↔ ForetMap / G&L a
> **deux couches** : l'annuaire (synchronisation Web Services, lots M1 à M5) puis l'entrée
> depuis le cours (LTI 1.3, lot M6, section 21). La seconde ne remplace pas la première.
>
> **Opération délicate** : la synchronisation touche des centaines de comptes d'élèves mineurs,
> dont certains portent déjà un historique (tâches, observations, forum, parties G&L). Une
> erreur ne se voit pas tout de suite et se répare mal. D'où la règle centrale : **la
> synchronisation ne détruit rien, ne devine rien, et n'agit jamais sans avoir été simulée.**

## 0. Comment utiliser ce document

- **Lire les sections 1 à 4 avant d'écrire la moindre ligne.** Les invariants de la section 3
  priment sur toute autre considération, y compris sur la simplicité du code.
- **Implémenter dans l'ordre des lots (section 17).** Chaque lot a une définition de terminé
  vérifiable ; ne pas commencer le suivant tant que la précédente n'est pas atteinte. Les lots
  M1 à M5 ne doivent **pas** implémenter de lancement LTI « en passant ». M6 suit M5 et la
  section 21 (décisions du 8 septembre 2026).
- **Conventions du dépôt applicables sans exception** (`CLAUDE.md`, `.cursor/rules/`) : SQL
  toujours paramétré, logger Pino et jamais `console.*`, réponses JSON `{ error }`, migrations
  idempotentes, tests dans le même lot que le code, `docs/API.md` mis à jour dans le même lot,
  documentation de référence non technique (`docs/reference/`) mise à jour dès qu'un
  comportement visible utilisateur change.
- **En cas de doute sur une règle métier, ne pas trancher seul** : les questions ouvertes
  restantes sont en **21.7** (constats du lancement de test LTI, à écrire après mesure).
  Les sections 20 et 21.8 sont **tranchées** (8 septembre 2026).

## 1. Objectif et périmètre

### 1.1 Ce que le chantier doit produire

Le lien entre le Moodle du lycée (`https://olution.info`, Moodle 5.2) et ForetMap / G&L a
**deux couches**, dans cet ordre. La seconde n'a de sens que si la première a déjà reconnu
les personnes.

**Couche A — l'annuaire** (lots M1 à M5). Une synchronisation **bidirectionnelle** qui :

1. crée ou rapproche les comptes `users` des élèves à partir des **cohortes** Moodle, et les
   place dans les bons **groupes** ForetMap avec le bon rôle ;
2. crée les **classes G&L** et les **joueurs** correspondants pour les cohortes qui jouent ;
3. renvoie vers Moodle, sous forme de **groupes de cours**, les **équipes** composées dans G&L,
   pour que les enseignants puissent restreindre une activité à une équipe ;
4. détecte et présente à un administrateur toute divergence entre les deux côtés, sans jamais
   la résoudre silencieusement.

**Couche B — l'entrée depuis le cours** (lot M6, section 21). LTI 1.3 n'est **pas** une autre
façon de synchroniser les utilisateurs. C'est le moyen, pour un élève **déjà reconnu** par la
couche A, d'entrer dans ForetMap ou G&L d'un clic depuis une activité du cours Moodle.
Sans la couche A, le clic LTI n'a personne à qui rattacher l'identité, hors bricolage
interdit. Le retour de notes est écarté pour M6.

Les trois fonctions LTI, après les décisions du 8 septembre 2026 (section 21) :

- **lancement depuis un cours** : **un** outil externe Moodle, pour ForetMap **et** G&L ;
  l'administrateur règle les liaisons cours → produit / écran, avec suggestions selon les
  cohortes connues ; le clic ouvre un **nouvel onglet** ;
- **identité au clic** : le jeton LTI porte qui clique ; on rattache au compte `users` déjà
  lié, sans nouveau mot de passe ; personne inconnue → refus (réglable) ;
- **retour de notes** : **écarté pour M6** (L12). Un lot ultérieur pourra le rouvrir.

### 1.2 Hors périmètre

- **Toute gestion de mot de passe.** Google OAuth 2 est actif des deux côtés sur l'annuaire
  Workspace du lycée : la synchronisation pose l'e-mail institutionnel, et la première
  connexion Google atterrit sur le bon compte. Ni la synchronisation ni LTI ne lisent, n'écrivent
  ni ne réinitialisent **aucun** secret.
- **Toute écriture de compte dans Moodle.** ForetMap ne crée pas, ne modifie pas, ne suspend
  pas un utilisateur Moodle, et ne l'inscrit ni ne le désinscrit d'un cours. LTI non plus :
  Moodle reste maître des inscriptions aux cours.
- **Se servir de LTI comme source d'annuaire.** LTI n'expose pas les cohortes ni les groupes
  de cours. Le service de roster d'un cours (Names and Role Provisioning) mélange plusieurs
  cohortes et les enseignants dans le même contexte : il ne remplace **jamais** la
  synchronisation Web Services (invariant repris en section 21.2).

LTI n'est **pas** hors chantier : c'est l'étape M6, après M5. Les lots M1 à M5 préparent le
socle (`external_identities.provider` accepte `'lti'`) et n'implémentent pas de lancement.
Les décisions pédagogiques des sections 20 et 21 sont prises. Il reste à **mesurer** le
`sub` LTI et l'e-mail sur un lancement de test (21.7), avant tout pilote élève.

### 1.3 Populations concernées

| Population                | Moodle                                                                                     | ForetMap                                  | G&L                            |
| ------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------ |
| Sixièmes                  | cohortes `26#601-602`, `26#603` ; cours par chapitre avec groupes classe et groupes équipe | inscrits, **visiteur** (pas de tâches)    | **joueurs**, équipes variables |
| n3beurs (tous niveaux)    | cohorte `26#n3`                                                                            | groupe n3beur, **tâches** de tous niveaux | non                            |
| Autres élèves de l'année  | cohortes `{année}#…` (préfixe réglable) ; l'admin choisit lesquelles synchro               | connexion libre, visiteur, pas de tâches  | non                            |
| Élèves des années passées | cohortes `25#…`, encore inscrits aux anciens cours                                         | aucun accès, sauf exception               | non                            |
| Enseignants               | inscrits aux cours, hors cohortes                                                          | comptes `teacher`, RBAC                   | MJ / admin via `gl_admins`     |

Les enseignants ne sont **pas** créés par la synchronisation : leurs comptes existent déjà et
leurs droits viennent du RBAC ForetMap. La synchronisation ne fait que les reconnaître pour
éviter de recréer un compte élève sur leur adresse (section 8).

## 2. Données de terrain confirmées

Ces valeurs sont réelles. Elles sont **des données de configuration**, pas des constantes de
code : elles vivent dans les réglages (section 6) et changent à chaque rentrée. Elles sont
reproduites ici pour que l'implémentation soit testable avec des cas fidèles.

### 2.1 Cohortes

| `idnumber`   | Contenu                        | Rôle ForetMap  | Classe G&L | Joue |
| ------------ | ------------------------------ | -------------- | ---------- | ---- |
| `26#601-602` | deux classes de 6e réunies     | `visiteur`     | oui        | oui  |
| `26#603`     | une classe de 6e               | `visiteur`     | oui        | oui  |
| `26#6`       | niveau 6e (toutes les classes) | aucun          | non        | non  |
| `26#n3`      | n3beurs, tous niveaux          | `eleve_novice` | non        | non  |

Le préfixe `26` est l'année en cours ; il devient `27` à la rentrée suivante et c'est un
réglage. Le séparateur est `#`. Une cohorte peut réunir **deux classes enseignées ensemble** :
`26#601-602` est **une seule** unité pédagogique, donc **un** groupe ForetMap et **une** classe
G&L. Les n3beurs ont leur propre cohorte, transversale aux niveaux. `26#601-602` est
**indissociable** : on ne crée pas de sous-groupes `601` et `602` (décision section 20).

### 2.2 Cours des chapitres G&L

Un cours Moodle par chapitre, désigné par son **identifiant numérique**, celui de l'adresse
`https://olution.info/course/view.php?id=<id>` :

| Chapitre G&L | Cours Moodle |
| ------------ | ------------ |
| 1            | `564`        |
| 2            | `565`        |
| 3            | `566`        |
| 4            | `567`        |
| 5            | `595`        |
| 6            | `570`        |

Deux pièges à connaître :

- **Les numéros** `6xx` **des cohortes ne sont pas des cours.** `601`, `602`, `603` désignent des
  classes ; les cours sont `564`…`570`. Les deux séries sont indépendantes et se ressemblent
  assez pour induire en erreur. Ne jamais dériver l'un de l'autre.
- **La série des cours n'est pas contiguë** (`595` entre `567` et `570`) : aucun code ne doit
  supposer que le cours du chapitre N vaut `563 + N`. La correspondance est une table de
  réglage explicite, saisie une fois par an, et rien d'autre.

Les correspondances des chapitres 1 à 6 ci-dessus sont **confirmées** (8 septembre 2026).
**L'écran de réglage doit afficher, à côté de chaque ligne, le nom du cours lu dans Moodle** (`core_course_get_courses_by_field`) pour que l'administrateur vérifie
d'un coup d'œil que « Chapitre 5 → 595 » pointe bien sur le cours attendu. Sans cet affichage,
une inversion passerait inaperçue.

### 2.3 Groupes classe dans les cours

Les cours chapitre reçoivent leurs élèves par la méthode d'inscription « synchronisation de
cohorte » de Moodle, qui crée automatiquement un groupe portant le nom de la cohorte préfixé :
**« Cohorte 26#601-602 »**, « Cohorte 26#603 ». Ces groupes sont **lus, jamais écrits** : ils
appartiennent à Moodle, servent à retrouver quelle cohorte joue dans quel cours, et une
écriture de ForetMap dessus casserait la méthode d'inscription.

### 2.4 Équipes de jeu

Quatre équipes par cohorte, deux gnomes et deux licornes. Les noms sont **stables sur toute
l'année** ; c'est la **composition** qui change à chaque chapitre.

| Cohorte      | Équipes                                                                           |
| ------------ | --------------------------------------------------------------------------------- |
| `26#601-602` | gnomes sylvestres · gnomes montagnards · licornes aquatiques · licornes aériennes |
| `26#603`     | gnomes des forêts · gnomes des montagnes · licornes des eaux · licornes des airs  |

**Pourquoi les noms diffèrent d'une cohorte à l'autre, et pourquoi il faut le préserver :**
plusieurs cohortes jouent le **même** chapitre, donc partagent le **même** cours Moodle. Or
Moodle **exige que les noms de groupes soient uniques à l'intérieur d'un cours**. Deux cohortes
qui nommeraient toutes deux une équipe « gnomes des forêts » entreraient en collision dès la
création du second groupe. Le jeu de noms distincts choisi par l'établissement résout ce
problème par construction. L'implémentation doit :

- **vérifier cette unicité avant d'écrire** (section 10.5), et refuser l'exécution avec un
  message explicite plutôt que de laisser Moodle renvoyer une erreur en cours de lot ;
- **ne jamais inventer ni « corriger » un nom d'équipe** (pas de suffixe automatique du genre
  « gnomes des forêts (603) ») : le nom vient de G&L, où il est saisi par le MJ.

Le type (`gnome` / `unicorn` dans `gl_teams.type`) se déduit du premier mot du nom : `gnome*`
→ `gnome`, `licorne*` → `unicorn`. Cette déduction ne sert qu'à **proposer** une valeur à la
création ; le type reste modifiable dans la console G&L et c'est la valeur en base qui fait foi.

### 2.5 Ce qui n'existe que dans ForetMap ou G&L

**Point de vigilance majeur, à ne perdre de vue dans aucun lot.** Il existe, et il existera
encore, des utilisateurs, des groupes et des équipes qui n'ont **aucune** contrepartie Moodle :

- comptes créés par inscription libre sur ForetMap, ou importés par CSV dans G&L ;
- classes G&L et groupes ForetMap composés à la main par un enseignant ;
- équipes constituées pour un atelier, un club, une sortie, hors de tout cours Moodle ;
- comptes d'anciens élèves conservés volontairement, comptes de démonstration, comptes de test.

Ces objets sont **de plein droit**. La synchronisation ne les voit pas comme des anomalies :
elle les ignore. La règle qui garantit cela est mécanique, pas déclarative — voir l'invariant
I-4 (section 3) et le détail en section 11.

### 2.6 Cours ForetMap (hors chapitres G&L)

Un cours Moodle peut lancer **ForetMap** plutôt qu'un chapitre G&L. Confirmé :

| Usage                       | Cours Moodle | Nom complet       | Nom abrégé |
| --------------------------- | ------------ | ----------------- | ---------- |
| ForetMap (n3beurs / tâches) | `511`        | La salle aérée n³ | n³         |

D'**autres** cours doivent pouvoir être liés de la même façon, sans modifier le code : c'est
la table de liaisons LTI (section 21.6), pas une constante. Ne pas hardcoder `511` hors des
valeurs initiales de réglage.

## 3. Invariants — les règles que rien ne justifie d'enfreindre

Elles sont numérotées pour être citables en revue de code et en test.

| #    | Invariant                                                                                                                                                                                                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-1  | **Aucune suppression.** Le pire que la synchronisation puisse faire à un compte est le désactiver (`users.is_active = 0`), et seulement si elle l'a créé. Aucun `DELETE` sur `users`, `gl_players`, `gl_classes`.                                                                                              |
| I-2  | **Aucun secret touché.** Ni lecture, ni écriture, ni réinitialisation de mot de passe ; `token_epoch` n'est jamais incrémenté par la synchronisation.                                                                                                                                                          |
| I-3  | **Rapprocher avant de créer.** Un compte n'est créé que si aucune règle de rapprochement (section 8) n'a produit de correspondance sûre.                                                                                                                                                                       |
| I-4  | **Ce que la synchronisation n'a pas créé, elle ne le défait pas.** Toute écriture destructive est conditionnée à une provenance enregistrée : `external_identities.origin = 'created'`, `external_group_members.source = 'sync'`, `external_groups` existant pour ce groupe. Pas de provenance ⇒ pas d'action. |
| I-5  | **Un objet, un maître.** Moodle pour les cohortes ; ForetMap / G&L pour les équipes et sous-groupes. Le reflet ne décide jamais ; le maître n'écrase jamais en silence un changement fait sur le reflet.                                                                                                       |
| I-6  | **Rien n'est écrit sans simulation préalable réussie** dans la même exécution ou dans une exécution antérieure explicitement reprise.                                                                                                                                                                          |
| I-7  | **Écritures sortantes bornées** : seuls des groupes de cours dont l'`idnumber` commence par `FM#`, et les membres de cohortes explicitement autorisées par leur politique. Rien d'autre ne sort jamais vers Moodle.                                                                                            |
| I-8  | **Idempotence.** Rejouer une exécution sur un état inchangé ne produit aucune écriture et aucune ligne de journal d'action.                                                                                                                                                                                    |
| I-9  | **Le jeton reste dans** `.env`**.** Jamais en base, jamais dans un réglage, jamais dans un journal, jamais dans une réponse d'API, jamais dans le dépôt.                                                                                                                                                       |
| I-10 | **Une partie G&L en cours ou terminée n'est jamais recomposée** par une synchronisation. L'écart est signalé, le MJ décide.                                                                                                                                                                                    |

## 4. Vocabulaire

- **Cohorte** : groupe transversal Moodle, identifié par son `idnumber` (`26#601-602`). Source
  de vérité des classes.
- **Groupe de cours** : groupe interne à un cours Moodle. Deux familles : ceux créés par Moodle
  (« Cohorte 26#… », lus seulement) et ceux créés par ForetMap (`idnumber` préfixé `FM#`,
  écrits par nous, jamais lus comme source).
- **Groupe ForetMap** : ligne de `groups` (`kind` = `class`, `unit`, `course_group`…), avec ses
  membres dans `group_members`.
- **Classe G&L** : ligne de `gl_classes`, reliée au groupe ForetMap par `foretmap_group_id`.
- **Partie** : ligne de `gl_games`, couple (classe, chapitre), avec ses `gl_teams` et
  `gl_team_members`.
- **Miroir** : représentation d'un objet dont le maître est ailleurs. Un groupe de cours `FM#…`
  est le miroir d'une équipe G&L.
- **Exécution** : un passage complet de la synchronisation, en simulation (`dry_run`) ou réel
  (`apply`), tracé par une ligne de `sync_runs`.

## 5. Modèle de données

### 5.1 Migration

Un seul fichier, `migrations/NNN_moodle_sync.sql`, où `NNN` est le **premier numéro libre au
moment de l'implémentation** (`ls migrations | tail -3` ; 216 à la rédaction de ce document).
Un doublon de numéro fait échouer le démarrage (`assertNoNewDuplicateMigrationNumbers`) : si une
autre branche a pris le numéro entre-temps, renuméroter avant de pousser.

Migration **idempotente** : chaque `CREATE TABLE` en `IF NOT EXISTS`, chaque `ALTER TABLE`
gardé par une lecture d'`INFORMATION_SCHEMA` comme les migrations existantes du dépôt.

```sql
-- Identité externe d'un compte : « ce compte users correspond à cet utilisateur Moodle ».
CREATE TABLE IF NOT EXISTS external_identities (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider      VARCHAR(32)  NOT NULL,             -- 'moodle' | 'lti' (plus tard)
  issuer        VARCHAR(255) NOT NULL,             -- URL du site, ex. https://olution.info
  external_id   VARCHAR(64)  NOT NULL,             -- id numérique Moodle de l'utilisateur
  external_idnumber VARCHAR(128) DEFAULT NULL,     -- idnumber Moodle si renseigné
  external_username VARCHAR(191) DEFAULT NULL,
  user_id       VARCHAR(64)  NOT NULL,             -- users.id
  origin        ENUM('created','linked') NOT NULL, -- I-4 : qui a créé le compte
  linked_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at  DATETIME DEFAULT NULL,             -- dernière fois vu dans une cohorte
  UNIQUE KEY uq_ext_ident_provider_ext (provider, issuer, external_id),
  UNIQUE KEY uq_ext_ident_provider_user (provider, issuer, user_id),
  INDEX idx_ext_ident_user (user_id),
  CONSTRAINT fk_ext_ident_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Groupe externe : cohorte Moodle, groupe de cours Moodle, ou miroir d'un objet ForetMap.
CREATE TABLE IF NOT EXISTS external_groups (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider      VARCHAR(32)  NOT NULL,
  issuer        VARCHAR(255) NOT NULL,
  kind          ENUM('cohort','course_group') NOT NULL,
  external_id   VARCHAR(64)  DEFAULT NULL,         -- NULL tant que le miroir n'existe pas encore
  external_idnumber VARCHAR(191) DEFAULT NULL,
  external_name VARCHAR(255) DEFAULT NULL,
  course_external_id VARCHAR(64) DEFAULT NULL,     -- cours Moodle, pour kind='course_group'
  master        ENUM('moodle','foretmap') NOT NULL,-- I-5
  policy_key    VARCHAR(64) DEFAULT NULL,          -- clé de la politique appliquée (section 6.2)
  group_id      VARCHAR(64) DEFAULT NULL,          -- groups.id
  gl_class_id   INT UNSIGNED DEFAULT NULL,         -- gl_classes.id
  gl_team_id    INT UNSIGNED DEFAULT NULL,         -- gl_teams.id (miroir d'équipe)
  members_hash  CHAR(64) DEFAULT NULL,             -- empreinte du dernier état commun (section 9)
  last_synced_at DATETIME DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ext_group_provider_ext (provider, issuer, kind, external_id),
  UNIQUE KEY uq_ext_group_idnumber (provider, issuer, external_idnumber),
  INDEX idx_ext_group_group (group_id),
  INDEX idx_ext_group_gl_class (gl_class_id),
  INDEX idx_ext_group_gl_team (gl_team_id),
  CONSTRAINT fk_ext_group_group FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE SET NULL,
  CONSTRAINT fk_ext_group_gl_class FOREIGN KEY (gl_class_id) REFERENCES gl_classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_ext_group_gl_team FOREIGN KEY (gl_team_id) REFERENCES gl_teams(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Appartenance posée par la synchronisation (I-4 : seules celles-ci sont retirables par elle).
CREATE TABLE IF NOT EXISTS external_group_members (
  external_group_id INT UNSIGNED NOT NULL,
  user_id       VARCHAR(64) NOT NULL,
  source        ENUM('sync','manual') NOT NULL DEFAULT 'sync',
  synced_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (external_group_id, user_id),
  INDEX idx_ext_gm_user (user_id),
  CONSTRAINT fk_ext_gm_group FOREIGN KEY (external_group_id) REFERENCES external_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_ext_gm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exécutions.
CREATE TABLE IF NOT EXISTS sync_runs (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider      VARCHAR(32) NOT NULL,
  mode          ENUM('dry_run','apply') NOT NULL,
  scope_json    LONGTEXT DEFAULT NULL,   -- cohortes / cours demandés
  status        ENUM('running','succeeded','failed','aborted','undone') NOT NULL DEFAULT 'running',
  actor_user_id VARCHAR(64) DEFAULT NULL,
  started_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at   DATETIME DEFAULT NULL,
  totals_json   LONGTEXT DEFAULT NULL,
  report_json   LONGTEXT DEFAULT NULL,
  error_text    TEXT DEFAULT NULL,
  INDEX idx_sync_runs_started (started_at),
  INDEX idx_sync_runs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Journal réversible : une ligne par écriture, avec l'état avant et après.
CREATE TABLE IF NOT EXISTS sync_actions (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  run_id        INT UNSIGNED NOT NULL,
  seq           INT UNSIGNED NOT NULL,
  kind          VARCHAR(64) NOT NULL,    -- 'user.create', 'group.member.add', 'moodle.group.create'…
  target_type   VARCHAR(32) NOT NULL,    -- 'user' | 'group' | 'gl_player' | 'moodle_group'…
  target_id     VARCHAR(128) DEFAULT NULL,
  before_json   LONGTEXT DEFAULT NULL,
  after_json    LONGTEXT DEFAULT NULL,
  undone_at     DATETIME DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sync_actions_seq (run_id, seq),
  INDEX idx_sync_actions_kind (kind),
  CONSTRAINT fk_sync_actions_run FOREIGN KEY (run_id) REFERENCES sync_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Divergences détectées par la comparaison à trois (section 9), en attente de décision humaine.
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  external_group_id INT UNSIGNED NOT NULL,
  user_id       VARCHAR(64) DEFAULT NULL,
  kind          ENUM('member_added_on_mirror','member_removed_on_mirror','both_changed','name_changed') NOT NULL,
  moodle_state  VARCHAR(32) DEFAULT NULL,
  foretmap_state VARCHAR(32) DEFAULT NULL,
  detected_run_id INT UNSIGNED DEFAULT NULL,
  detected_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at   DATETIME DEFAULT NULL,
  resolved_by_user_id VARCHAR(64) DEFAULT NULL,
  resolution    ENUM('keep_master','apply_other','ignore') DEFAULT NULL,
  INDEX idx_sync_conflicts_open (resolved_at),
  CONSTRAINT fk_sync_conflicts_group FOREIGN KEY (external_group_id) REFERENCES external_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Marquage « cet objet est hors synchronisation, ne pas y toucher » (section 11).
ALTER TABLE users  ADD COLUMN sync_exempt TINYINT(1) NOT NULL DEFAULT 0;   -- garde INFORMATION_SCHEMA
ALTER TABLE `groups` ADD COLUMN sync_exempt TINYINT(1) NOT NULL DEFAULT 0; -- garde INFORMATION_SCHEMA
```

Reporter les mêmes définitions dans `sql/schema_foretmap.sql` (le schéma de référence sert aux
bases neuves ; les deux doivent rester alignés).

### 5.2 Lecture du modèle

- `origin` distingue un compte **créé** par la synchronisation d'un compte **rapproché**
  existant. C'est le drapeau qui autorise, ou non, la désactivation (I-4).
- `source` distingue une appartenance posée par la synchronisation d'un ajout manuel : la
  synchronisation ne retire que les siennes.
- `master` dit dans quel sens l'objet se synchronise, et `members_hash` mémorise le dernier
  état sur lequel les deux côtés étaient d'accord — c'est ce qui permet de distinguer « changé
  chez le maître » de « changé sur le reflet » (section 9).
- Un groupe ForetMap **sans ligne** `external_groups` est un groupe purement local : invisible
  pour la synchronisation, quoi qu'il arrive (section 11).
- `auth_provider` d'un compte créé par la synchronisation vaut `moodle`. Un compte miroir G&L
  (`gl_bridge`) qui se fait rapprocher **cesse d'être un miroir** : son `auth_provider` passe à
  `moodle`, faute de quoi une suppression de joueur (`DELETE /api/gl/admin/players/:id`)
  emporterait un compte désormais adossé à Moodle.
- Une même personne peut porter **deux** lignes `external_identities` pour le même `issuer`
  (`https://olution.info`) : `provider = 'moodle'` (identifiant Web Services) et
  `provider = 'lti'` (sujet du jeton de lancement). La clé unique est
  `(provider, issuer, external_id)` : les deux coexistent. Le lot M1 crée la table dans cette
  forme générique ; le lot M6 pose les lignes `'lti'`. Ne pas figer `provider` en ENUM à deux
  valeurs figées côté application au-delà de ces deux identifiants connus.

## 6. Configuration

### 6.1 Variables d'environnement (`.env`, jamais en base — I-9)

| Variable               | Rôle                                                            |
| ---------------------- | --------------------------------------------------------------- |
| `MOODLE_BASE_URL`      | `https://olution.info` (sans barre oblique finale)              |
| `MOODLE_WS_TOKEN`      | jeton du service externe, créé selon la section 19              |
| `MOODLE_WS_TIMEOUT_MS` | facultatif, défaut `20000`                                      |
| `MOODLE_SYNC_ENABLED`  | facultatif, `0` coupe toute la fonctionnalité (garde d'urgence) |

`lib/env.js` ne doit **pas** les rendre obligatoires : leur absence désactive proprement la
fonctionnalité (endpoints en `503 { error: 'Intégration Moodle non configurée' }`), elle ne
doit pas empêcher le serveur de démarrer. Ajouter les deux premières en commentaire dans
`env.local.example` — c'est déjà fait.

Les secrets LTI (émetteur Moodle, identifiant client, clés de l'outil) sont ceux du **lot M6**.
Ils restent dans `.env` (I-9), distincts du jeton Web Services. Noms prévus, à n'activer
qu'avec M6 : `LTI_ISSUER`, `LTI_CLIENT_ID`, `LTI_DEPLOYMENT_ID`, plus la paire de clés de
l'outil. Ne pas les inventer dans M1.

### 6.2 Réglages administrateur (`lib/settings.js`, registre `SETTINGS_REGISTRY`)

Portée `admin` pour tous ; aucun n'est public.

| Clé                                                | Type      | Défaut          | Rôle                                                      |
| -------------------------------------------------- | --------- | --------------- | --------------------------------------------------------- |
| `integration.moodle.enabled`                       | `boolean` | `false`         | interrupteur fonctionnel                                  |
| `integration.moodle.year_prefix`                   | `string`  | `26`            | année en cours, préfixe des `idnumber` de cohorte         |
| `integration.moodle.email_domains`                 | `string`  | `''`            | domaines autorisés, séparés par une virgule ; vide = tous |
| `integration.moodle.policies`                      | `json`    | voir ci-dessous | politiques par motif d'`idnumber`                         |
| `integration.moodle.chapter_courses`               | `json`    | `{}`            | `{ "<gl_chapters.id>": <courseid Moodle> }`               |
| `integration.moodle.threshold_create_pct`          | `number`  | `30`            | seuil de créations, en % des élèves existants             |
| `integration.moodle.threshold_deactivate_pct`      | `number`  | `10`            | seuil de désactivations, en %                             |
| `integration.moodle.threshold_deactivate_abs`      | `number`  | `50`            | seuil de désactivations, en valeur absolue                |
| `integration.moodle.threshold_namematch_pct`       | `number`  | `20`            | seuil de rapprochements par nom, en %                     |
| `integration.moodle.threshold_outbound_remove_abs` | `number`  | `50`            | seuil de retraits de membres poussés vers Moodle          |

Les réglages LTI (`integration.lti.*`, section 21.5) **n'entrent pas** dans M1–M5. Ils sont
livrés avec M6, dans le même onglet « Moodle », section distincte « Entrée depuis le cours ».

Forme d'une politique (le tableau est ordonné ; **la première entrée dont le motif correspond
gagne**, ce qui rend le classement significatif — `{year}#n3` doit précéder tout motif
générique). `{year}` est remplacé par `integration.moodle.year_prefix` à l'évaluation
(`26`, puis `27` à la rentrée) : on ne réécrit pas les motifs à chaque année.

```json
[
  {
    "key": "niveau",
    "pattern": "^{year}#\\d$",
    "group_kind": "unit",
    "role": null,
    "n3beur": false,
    "gl_class": false,
    "create_accounts": false,
    "push_membership": false
  },
  {
    "key": "n3",
    "pattern": "^{year}#n3$",
    "group_kind": "class",
    "role": "eleve_novice",
    "n3beur": true,
    "gl_class": false,
    "create_accounts": true,
    "push_membership": true
  },
  {
    "key": "classe6",
    "pattern": "^{year}#6\\d{2}(-6\\d{2})?$",
    "group_kind": "class",
    "role": "visiteur",
    "n3beur": false,
    "gl_class": true,
    "create_accounts": true,
    "push_membership": false
  },
  {
    "key": "classe",
    "pattern": "^{year}#[2-5]\\d{2}$",
    "group_kind": "class",
    "role": "visiteur",
    "n3beur": false,
    "gl_class": false,
    "create_accounts": true,
    "push_membership": false
  }
]
```

Une cohorte dont l'`idnumber` ne correspond à **aucun** motif est **ignorée** et listée dans le
rapport : c'est le comportement voulu pour les cohortes d'années passées et pour tout ce qui ne
concerne pas ForetMap. Ne jamais prévoir de motif attrape-tout.

Le motif est une expression régulière fournie par un administrateur : la compiler dans un
`try/catch`, refuser l'enregistrement d'un motif invalide, et **borner sa longueur** (128
caractères) pour éviter une expression pathologique.

Points d'attention métier :

- Un n3beur appartient à sa classe (`visiteur`) **et** au groupe n3beurs (`eleve_novice`). La
  résolution de rôle retient le plus élevé : il est n3beur. Le groupe classe ne doit donc
  **jamais** forcer un rôle à la baisse sur un compte qui en a déjà un plus élevé.
- `push_membership` autorise l'ajout et le retrait de membres **de cohorte** depuis ForetMap.
  **Oui pour les n3beurs** (`{year}#n3`) : le recrutement en cours d'année depuis ForetMap
  écrit dans la cohorte Moodle. C'est le drapeau de politique déjà prévu (fonctions
  `core_cohort_add_cohort_members` / `delete`), pas un chantier à part ; si le premier
  apply pose problème, on remet le drapeau à `false` sans changer le code. **Non pour les
  classes** : la vie scolaire les tient dans Moodle.
- L'écran « Exécuter » liste les cohortes de l'année (préfixe `year_prefix`) et l'admin
  **coche celles à synchroniser**. Un motif qui match sans case cochée n'est pas appliqué.
  C'est le moyen de n'envoyer que `26#603` au premier apply, ou d'ignorer `26#6`.

## 7. Client Web Services Moodle — `lib/moodle/client.js`

### 7.1 Contrat d'appel

Toutes les fonctions passent par un seul point d'entrée :

```js
callMoodle(wsfunction, params, { timeoutMs, signal }) → Promise<any>
```

- `POST` sur `${MOODLE_BASE_URL}/webservice/rest/server.php`, corps en
  `application/x-www-form-urlencoded`, avec `wstoken`, `wsfunction`, `moodlewsrestformat=json`.
- **Piège majeur : Moodle renvoie** `HTTP 200` **même en cas d'erreur.** Une réponse d'erreur est un
  objet JSON portant `exception`, `errorcode` et `message`. Le client doit détecter ce cas et
  lever une `MoodleApiError` typée (`errorcode` conservé) ; se fier au code HTTP seul est une
  faute qui ferait passer un échec pour un succès et déclencherait des retraits de masse.
- Sérialisation des paramètres structurés au format Moodle :
  `cohortids[0]=12`, `members[0][groupid]=7`, `members[0][userid]=42`. Écrire un utilitaire
  `encodeMoodleParams(obj)` et **le tester unitairement** sur les formes imbriquées : c'est la
  source d'erreur la plus fréquente de ce type d'intégration.
- **Aucun secret dans les journaux** : ne jamais logger le corps de la requête (il contient le
  jeton). Logger `wsfunction`, la taille du lot, la durée, et en cas d'erreur `errorcode`.
- Réessai : 2 tentatives supplémentaires sur erreur réseau ou `HTTP 5xx`, avec attente
  exponentielle (1 s, 4 s). **Jamais** de réessai sur une `MoodleApiError` applicative
  (`invalidtoken`, `accessexception`…) : le problème est de configuration, pas de réseau.
- Lots : 100 identifiants par appel maximum, en série (ne pas paralléliser : le serveur Moodle
  du lycée est mutualisé).

### 7.2 Fonctions utilisées

Lecture :

| Fonction                           | Usage                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `core_webservice_get_site_info`    | vérification du jeton, liste des fonctions autorisées                     |
| `core_cohort_get_cohorts`          | cohortes (liste vide d'ids = toutes celles visibles)                      |
| `core_cohort_search_cohorts`       | repli si la précédente est restreinte sur le site                         |
| `core_cohort_get_cohort_members`   | membres d'une cohorte (identifiants seulement)                            |
| `core_user_get_users_by_field`     | détails des utilisateurs, par lots de 100 (`field: 'id'`)                 |
| `core_course_get_courses_by_field` | nom du cours, pour l'affichage de la table chapitre → cours               |
| `core_group_get_course_groups`     | groupes d'un cours (pour retrouver le groupe classe et les miroirs `FM#`) |
| `core_group_get_group_members`     | membres des groupes de cours                                              |
| `core_enrol_get_enrolled_users`    | inscrits d'un cours, pour dire pourquoi un ajout de groupe échouerait     |

Écriture (uniquement dans le périmètre de I-7) :

| Fonction                            | Usage                                    |
| ----------------------------------- | ---------------------------------------- |
| `core_group_create_groups`          | créer un miroir d'équipe                 |
| `core_group_update_groups`          | renommer un miroir d'équipe              |
| `core_group_delete_groups`          | supprimer un miroir `FM#` devenu inutile |
| `core_group_add_group_members`      | ajouter un membre à un miroir            |
| `core_group_delete_group_members`   | retirer un membre d'un miroir            |
| `core_cohort_add_cohort_members`    | option `push_membership` seulement       |
| `core_cohort_delete_cohort_members` | option `push_membership` seulement       |

Les formes exactes des paramètres doivent être **vérifiées sur le site lui-même** avant de
coder : `core_webservice_get_site_info` renvoie la liste des fonctions autorisées, et la
documentation du site les décrit à `/admin/webservice/documentation.php`. La commande
`npm run moodle:check` (livrée au lot M1, section 17) doit afficher ces informations et vérifier
une à une la présence des fonctions et des capacités nécessaires : c'est le premier outil à
écrire, avant toute logique de synchronisation.

## 8. Rapprochement des identités — `lib/moodle/matching.js`

### 8.1 Règles, dans l'ordre

Pour chaque membre de cohorte, dans cet ordre, **arrêt à la première correspondance** :

1. **Identité externe connue** : ligne `external_identities` pour ce `(provider, issuer,

external_id)`. C'est le cas normal après la première exécution. 2. **E-mail** :` users.email `égal, comparaison insensible à la casse, sur **tous** les types de    compte (élève, enseignant). Un e-mail Moodle porté par un compte enseignant est un **conflit**,    pas une correspondance : ligne de rapport, aucune action. 3. **Prénom + nom normalisés**, et seulement si le couple est **unique des deux côtés** : une    seule personne le porte dans la cohorte Moodle, et un seul compte le porte dans ForetMap.    Normalisation : minuscules, suppression des accents (`String.normalize('NFD') `puis retrait    des diacritiques), espaces et traits d'union réduits à un séparateur unique, espaces de bord    supprimés. Deux homonymes ⇒ **jamais** de rapprochement automatique : ligne dans la liste des    rapprochements en attente, décision humaine. 4. **Création**, si la politique de la cohorte le permet (`create_accounts`).

### 8.2 Ce que la synchronisation a le droit d'écrire

Ce que la synchronisation écrit sur un compte **rapproché** : l'e-mail s'il était vide, le
prénom et le nom **s'ils étaient vides**, l'identité externe, les appartenances de groupe. Rien
d'autre — ni pseudo, ni avatar, ni rôle au-delà du rôle de groupe, ni mot de passe (I-2). Sur un
compte **créé**, Moodle fait foi pour prénom, nom et e-mail. Tout écart entre les deux côtés est
listé dans le rapport sans être corrigé.

### 8.3 Contrôles amont

Contrôles amont, **bloquants** pour l'exécution entière (pas seulement pour la ligne fautive) :

- un membre non suspendu sans e-mail ;
- un e-mail hors des domaines autorisés, si `email_domains` est renseigné ;
- deux membres Moodle portant le même e-mail ;
- une cohorte retenue dont l'`idnumber` ne correspond à aucun motif — celle-là est ignorée, pas
  bloquante, mais elle doit apparaître dans le rapport.

Ces contrôles tournent **avant** toute écriture, en simulation comme en réel.

### 8.4 Cas de figure sur les comptes existants

C'est le tableau de référence du comportement attendu : chaque ligne doit correspondre à un
test (section 16).

| Situation                                                        | Comportement                                                                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Compte ForetMap existant, même e-mail                            | Rapproché ; secret, pseudo, avatar, historique conservés ; rejoint le groupe                                                 |
| Compte ForetMap sans e-mail (inscription libre)                  | Rapproché par nom si unique, sinon signalé ; l'e-mail Moodle est posé sur le compte rapproché                                |
| Joueur G&L avec compte miroir (`gl_bridge`)                      | Rapproché comme ci-dessus ; le miroir devient un compte `moodle` (section 5.2)                                               |
| Deux comptes ForetMap pour la même personne                      | Un seul est lié (e-mail d'abord) ; l'autre est listé « doublon probable » ; fusion par l'administrateur (outil du lot M2)    |
| E-mail Moodle déjà porté par un autre compte (enseignant, autre) | Conflit : aucune action, ligne de rapport                                                                                    |
| Compte ForetMap ou joueur G&L absent de Moodle                   | **Jamais touché** ; listé « hors Moodle » pour information (section 11)                                                      |
| Compte créé par la sync, disparu des cohortes de l'année         | Désactivé, réactivable à la main ; `sync_exempt` respecté ensuite                                                            |
| Compte rapproché, disparu des cohortes                           | Retiré des groupes synchronisés seulement ; **pas** désactivé                                                                |
| Membre suspendu dans Moodle                                      | Compte créé par la sync : désactivé. Compte rapproché : signalé, non désactivé                                               |
| Élève changeant de classe en cours d'année                       | Déplacé de groupe (et de classe G&L si la classe joue) à l'exécution suivante ; une partie en cours n'est pas touchée (I-10) |
| Homonymes                                                        | Jamais rapprochés automatiquement ; décision dans l'écran des rapprochements en attente                                      |

L'**outil de fusion de comptes** (lot M2) fusionne B dans A : groupes, inscriptions et journaux
de tâches, observations, forum, joueur G&L, identités externes, puis suppression de B — avec
simulation préalable et journal, comme le reste. Il sert aussi aux doublons hérités que la
réconciliation G&L révèle déjà, indépendamment de Moodle.

## 9. Comparaison à trois et conflits — `lib/moodle/reconcile.js`

Pour chaque groupe synchronisé, trois listes de membres :

- **M** : l'état Moodle, lu à cette exécution ;
- **F** : l'état ForetMap, lu en base ;
- **H** : le dernier état sur lequel les deux côtés étaient d'accord, retrouvé depuis
  `external_groups.members_hash`.

`members_hash` est le SHA-256 de la liste des identifiants `users.id` **triée** et jointe par
`\n`. Stocker **aussi** la liste elle-même (dans `sync_actions.after_json` de la dernière
exécution réussie, ou dans une colonne dédiée si l'implémentation le juge plus simple) : une
empreinte seule dit qu'il y a eu un changement, pas lequel, et le rapport doit nommer les
personnes concernées.

Décisions :

| M vs H    | F vs H    | Décision                                                                   |
| --------- | --------- | -------------------------------------------------------------------------- |
| identique | identique | rien à faire (I-8 : aucune écriture, aucune ligne de journal)              |
| changé    | identique | le maître a bougé → propager vers le reflet                                |
| identique | changé    | le reflet a bougé → **conflit**, sauf miroir « sans édition » (ci-dessous) |
| changé    | changé    | **conflit** systématique                                                   |

Exception unique, et elle doit être explicite dans le code : un groupe dont `master = 'foretmap'` et qui est un **miroir d'équipe** est reconstruit à l'identique sans conflit, parce
que sa raison d'être est de refléter G&L. Une retouche faite dans Moodle sur un tel groupe est
tout de même **signalée** dans le rapport (l'enseignant qui l'a faite doit savoir qu'elle a été
écrasée), mais elle ne bloque pas.

Un conflit ouvre une ligne `sync_conflicts` et se résout dans l'écran administrateur par un de
trois choix : **garder le maître** (le reflet est réaligné), **appliquer** (le changement du
reflet est poussé vers le maître), **ignorer** (la ligne est classée, `members_hash` est
recalculé sur l'état courant pour ne pas la redétecter en boucle).

## 10. Équipes G&L et miroirs Moodle

### 10.1 Où l'on compose : G&L est maître

Les équipes sont une donnée de jeu (type gnome ou licorne, équilibre, historique des
coéquipiers, contraintes pédagogiques). Moodle n'a pas de moteur pour cela et son interface de
composition manuelle est lente pour des équipes qui changent à chaque chapitre. G&L possède
déjà les objets (`gl_games`, `gl_teams`, `gl_team_members`) et la console MJ. Moodle reçoit
ensuite les groupes pour ce qu'il sait faire : restreindre une activité, un forum ou un devoir
à une équipe.

### 10.2 Modèle d'équipes par classe

Les noms d'équipes sont **stables sur l'année et propres à la cohorte** (section 2.4), alors que
`gl_teams` est une table **par partie** (`game_id`) : les quatre équipes doivent donc être
recréées à chaque nouveau chapitre. Pour que le MJ ne les ressaisisse pas six fois, chaque
classe G&L porte un **modèle d'équipes** :

- réglage `gl.classes.team_templates`, portée `admin`, de forme
  `{ "<gl_classes.id>": [ { "name": "gnomes sylvestres", "type": "gnome" }, … ] }` ;
- à la création d'une partie, les `gl_teams` sont amorcées depuis ce modèle (nom, type,
  couleur) ; le MJ peut ensuite renommer une équipe pour cette partie seulement ;
- valeurs initiales, à saisir à la mise en service :

  | Classe G&L (cohorte) | Équipes                                                                           |
  | -------------------- | --------------------------------------------------------------------------------- |
  | `26#601-602`         | gnomes sylvestres · gnomes montagnards · licornes aquatiques · licornes aériennes |
  | `26#603`             | gnomes des forêts · gnomes des montagnes · licornes des eaux · licornes des airs  |

Le type est déduit du premier mot à la saisie (section 2.4) et reste modifiable. Le modèle est
une **commodité de saisie**, pas une source de vérité : ce sont les lignes `gl_teams` de la
partie qui font foi, et c'est leur nom qui part dans le miroir Moodle.

### 10.3 Moteur de composition — `lib/gl/teamComposer.js`

Fonction pure, testable sans base :

```js
composeTeams({ players, teams, history, options }) → { assignments, warnings }
```

- `players` : joueurs de la classe, avec `id` et ce qui sert aux contraintes.
- `teams` : les quatre équipes de la cohorte (`id`, `name`, `type`).
- `history` : compositions des chapitres précédents de la même classe, pour « éviter de
  remettre ensemble les mêmes ».
- `options` : `{ maxSizeDelta = 1, avoidRepeatWindow = 2, keepTogether: [[idA, idB]], keepApart: [[idC, idD]], seed }`.

Règles, par ordre de priorité décroissante : `keepApart` est **dur** (jamais violé, sinon
`warnings` et l'affectation échoue), l'écart de taille entre équipes ne dépasse pas
`maxSizeDelta`, `keepTogether` est respecté autant que possible, puis on minimise les
répétitions de binômes sur les `avoidRepeatWindow` derniers chapitres. Tirage **déterministe**
à partir de `seed` : le MJ doit pouvoir rejouer exactement la même composition, et les tests en
dépendent.

Le moteur **propose** ; le MJ ajuste à la main puis **valide**. Rien n'est écrit dans
`gl_team_members` avant validation.

### 10.4 Nommage des miroirs

- **Nom affiché dans Moodle** : exactement le nom de l'équipe côté G&L (« gnomes sylvestres »).
  Pas de préfixe, pas de suffixe, pas de reformatage : c'est ce nom que les enseignants voient
  dans les réglages d'activité.
- `idnumber` : `FM#<cohorte>#C<courseid>#<slug-équipe>`, par exemple
  `FM#26#601-602#C564#gnomes-sylvestres`. Le `slug` est le nom de l'équipe normalisé (minuscules,
  sans accent, espaces en tirets). C'est ce préfixe `FM#` — et lui seul — qui autorise une
  écriture (I-7).
- Le groupe classe créé par Moodle (« Cohorte 26#601-602 ») n'est **jamais** modifié.

### 10.5 Déroulé d'une synchronisation d'équipes

1. Retrouver le cours du chapitre dans `integration.moodle.chapter_courses`. Absent ⇒ rien à
   faire pour ce chapitre, ligne de rapport.
2. Lire les groupes du cours (`core_group_get_course_groups`). En déduire : le groupe classe
   (nom « Cohorte », lu seulement) et les miroirs existants (`idnumber` en `FM#`).
3. **Vérifier l'unicité des noms** avant d'écrire : si une équipe à créer porte le nom d'un
   groupe existant qui n'est pas son propre miroir, **arrêter avec une erreur explicite**
   nommant le cours, le groupe en place et l'équipe en cause. Ne jamais renommer pour
   contourner (section 2.4).
4. Créer, renommer ou supprimer les miroirs pour coller aux équipes de la partie. Un miroir
   `FM#` sans équipe correspondante est supprimé ; **aucun autre groupe du cours n'est touché**.
5. Aligner les membres : résoudre chaque joueur en identifiant Moodle via `external_identities`.

- Joueur **sans** identité Moodle : listé dans le rapport, l'équipe existe côté G&L, le
  miroir est simplement incomplet. **Ce n'est pas une erreur** (section 11).
- Élève non inscrit au cours : Moodle refuse l'ajout. Le rapport le dit, avec le nom du
  cours ; l'inscription reste du ressort de Moodle.

6. Une partie dont le statut n'est pas `draft` n'est **jamais** recomposée (I-10) : les écarts
   sont signalés, le MJ décide.

### 10.6 Appartenances multiples

- **ForetMap** l'autorise déjà : `group_members` a pour clé `(group_id, user_id)`, et
  `groups.parent_group_id` permet les sous-groupes. Un élève peut être dans sa classe, dans le
  groupe n3beurs, dans un groupe de cours et dans plusieurs sous-groupes. La synchronisation
  pose une appartenance par groupe synchronisé et ne retire que les siennes (I-4).
- **G&L** : un joueur a **une** classe (`gl_players.class_id`) et **une** équipe par partie
  (`gl_team_members`, clé `(game_id, player_id)`). Plusieurs équipes dans le temps — une par
  chapitre — sont donc naturelles et attendues.
- **Deux classes G&L simultanées pour un même joueur sont impossibles** dans le modèle actuel.
  Le cas **ne doit pas se présenter** (une classe G&L = une cohorte joueuse). S'il apparaît
  malgré tout, **ne pas** créer de table `gl_class_members` : ligne d'**alerte** dans le
  rapport, le joueur n'est pas réaffecté à une seconde classe, l'exécution des autres
  cohortes continue.
- **Sous-groupes composés dans ForetMap** hors jeu (ateliers, tâches par équipe) : même
  mécanisme que les équipes, maître ForetMap, miroir Moodle facultatif dans un cours choisi,
  `idnumber` `FM#<cohorte>#G#<slug>`.

## 11. Ce qui n'existe que dans ForetMap ou G&L

C'est le point le plus facile à casser par inadvertance, et le plus coûteux à réparer. Il ne se
traite pas par des cas particuliers dispersés dans le code, mais par **trois règles
structurelles** :

1. **Pas de ligne, pas de prise.** La synchronisation n'agit que sur des objets qui ont une
   ligne dans `external_identities` ou `external_groups`. Un compte, un groupe, une classe G&L
   ou une équipe sans cette ligne lui est **invisible**. Concrètement : toute requête de la
   synchronisation part de ces tables et **jamais** d'un `SELECT` sur `users` ou `groups` seul.
   Un balayage du genre « tous les élèves du groupe X qui ne sont pas dans la cohorte » est
   interdit s'il n'est pas borné par `external_group_members.source = 'sync'`.
2. `sync_exempt` **prime sur tout.** Un compte ou un groupe marqué `sync_exempt = 1` est ignoré
   en lecture comme en écriture, même s'il a une identité externe : ni désactivation, ni
   retrait, ni ajout, ni mise à jour de champ. Le marquage se pose depuis l'écran administrateur
   et **ne s'enlève que là** ; aucune exécution ne le retire.
3. **Un joueur G&L sans identité Moodle est un joueur normal.** Il joue, il compte dans les
   effectifs, il apparaît dans son équipe côté G&L. Seul son miroir Moodle est incomplet, et
   c'est une ligne d'information dans le rapport — jamais une erreur, jamais un blocage, jamais
   une raison de retirer le joueur de l'équipe.

Corollaires à vérifier en test (section 16) :

- une exécution complète sur une base contenant un groupe local, un compte local et une équipe
  entièrement locale ne produit **aucune** écriture les concernant ;
- un compte `sync_exempt` disparu de toutes les cohortes n'est pas désactivé ;
- une équipe dont aucun membre n'a d'identité Moodle produit un miroir vide (ou aucun miroir,
  selon le réglage) et un rapport lisible, sans erreur.

## 12. Exécution

### 12.1 Orchestration — `lib/moodle/syncRun.js`

1. **Verrou** exclusif : une seule exécution à la fois, même mécanisme que le cron de
   déploiement. Une deuxième demande reçoit `409 { error: 'Une synchronisation est déjà en

cours' }`. 2. Ouverture d'une ligne` sync_runs `(`status = 'running'`). 3. Lecture Moodle, contrôles amont (section 8), rapprochement. 4. **Calcul du plan** : la liste complète des écritures envisagées, sans rien écrire. 5. **Contrôle des seuils** sur le plan (section 12.2). Dépassement sans` force`⇒ l'exécution    s'arrête en`aborted`, le rapport dit quel seuil et de combien. 6. **Application**, cohorte par cohorte, **une transaction par cohorte** : une cohorte qui    échoue n'annule pas les précédentes, et le rapport dit où l'on s'est arrêté. 7. Écritures sortantes vers Moodle (équipes,` push_membership`), après les écritures locales. 8. Recalcul des` members_hash`, clôture de la ligne` sync_runs`, rapport. 9. Rejeu automatique de la réconciliation G&L (`lib/glIdentityReconcile.js`) et contrôle croisé
des effectifs par cohorte.

Le **mode simulation** (`dry_run`) exécute les étapes 1 à 5 et produit exactement le même
rapport, sans aucune écriture — ni locale, ni vers Moodle. Une exécution réelle est refusée si
aucune simulation n'a été produite pour le même périmètre depuis moins de 24 h, sauf `force`
explicite (I-6).

### 12.2 Seuils

Calculés sur le plan, avant toute écriture :

| Seuil                        | Défaut     | Déclenche si                                               |
| ---------------------------- | ---------- | ---------------------------------------------------------- |
| créations                    | 30 %       | comptes à créer > 30 % des comptes élèves existants        |
| désactivations               | 10 % ou 50 | le plus petit des deux est atteint                         |
| rapprochements par nom       | 20 %       | > 20 % des membres traités                                 |
| retraits poussés vers Moodle | 50         | membres à retirer d'un miroir, toutes équipes confondues   |
| cohorte vidée                | —          | une cohorte non vide à l'exécution précédente revient vide |

Un dépassement n'est **jamais** contourné automatiquement. Il faut une reprise explicite avec
`force: true` par un administrateur, et cette reprise est journalisée avec son motif.

### 12.3 Journal et annulation

Chaque écriture produit une ligne `sync_actions` avec l'état avant et après. `POST /api/admin/integrations/moodle/runs/:id/undo` rejoue le journal à l'envers :

- appartenances rendues à leur état antérieur ;
- comptes désactivés par l'exécution réactivés ;
- identités externes posées par l'exécution retirées ;
- miroirs Moodle créés par l'exécution supprimés, miroirs supprimés recréés ;
- **les comptes créés ne sont pas supprimés** (I-1) : ils sont désactivés et signalés.

L'annulation est elle-même une exécution (`sync_runs` de mode `apply`, `status` final `undone`
sur la ligne d'origine), avec les mêmes garanties de transaction et de journal.

### 12.4 Ligne de commande et cron

- `npm run moodle:check` — vérifie `MOODLE_BASE_URL` et `MOODLE_WS_TOKEN`, appelle
  `core_webservice_get_site_info`, liste les fonctions autorisées, contrôle une à une celles de
  la section 7.2 et les capacités correspondantes, affiche les cohortes visibles avec leur
  `idnumber` et la table chapitre → cours résolue avec les **noms** de cours. Ne modifie rien.
- `npm run moodle:sync -- --dry-run [--cohort 26#603] [--teams] [--json]` — simulation.
- `npm run moodle:sync -- --apply [--cohort …] [--force]` — exécution réelle.
- Cron hebdomadaire (documenter dans `docs/CRONTAB.md`) : simulation automatique et alerte si le
  plan contient des désactivations ou des conflits. **Le cron ne fait jamais d'**`--apply` : la
  synchronisation réelle reste déclenchée par un humain.

## 13. API HTTP

Routeur `routes/admin/moodle.js`, monté sur `/api/admin/integrations/moodle`, sous
`requireTeacher` et une permission dédiée `integrations.moodle.manage` (à ajouter au
registre RBAC et à attribuer au rôle `admin` par la migration). Limiteur strict sur les routes
d'exécution. Toutes les réponses sont du JSON ; les erreurs suivent `{ error }`.

| Méthode et chemin           | Rôle                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /status`               | configuration présente ou non, résultat du dernier `check`, dernière exécution, conflits ouverts |
| `POST /check`               | rejoue les vérifications de `moodle:check` et renvoie le détail                                  |
| `GET /cohorts`              | cohortes Moodle visibles, avec `idnumber`, effectif et politique retenue                         |
| `GET /courses`              | table chapitre → cours résolue, avec le nom du cours lu dans Moodle                              |
| `POST /runs`                | lance une exécution (`dry_run` ou `apply`, cohortes optionnelles, `teams`, `force`)              |
| `GET /runs`                 | historique paginé                                                                                |
| `GET /runs/:id`             | rapport complet d'une exécution                                                                  |
| `POST /runs/:id/undo`       | annulation (section 12.3)                                                                        |
| `GET /pending-matches`      | rapprochements en attente : membre Moodle et comptes candidats                                   |
| `POST /pending-matches/:id` | décision `link` (avec `userId`), `create` ou `ignore`                                            |
| `GET /conflicts`            | conflits ouverts                                                                                 |
| `POST /conflicts/:id`       | résolution `keep_master`, `apply_other` ou `ignore`                                              |
| `POST /exempt`              | marquer un compte ou un groupe `sync_exempt`                                                     |

Côté G&L, pour les équipes (routeur `routes/gl/admin.js`, permission MJ existante) :

| Méthode et chemin                               | Rôle                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `POST /api/gl/admin/games/:id/teams/compose`    | propose une composition (`lib/gl/teamComposer.js`), n'écrit rien |
| `PUT /api/gl/admin/games/:id/teams/assignments` | valide et écrit les affectations                                 |
| `POST /api/gl/admin/games/:id/teams/mirror`     | pousse le miroir Moodle de cette partie ; `{ dryRun }`           |

Toute route publique nouvelle ou modifiée va dans `docs/API.md` **dans le même lot** que le
code.

## 14. Écran administrateur

Sous les réglages, onglet « Moodle ». Le minimum utile, sans fioriture :

1. **État** : configuration détectée, résultat du dernier contrôle (vert ou rouge, fonction par
   fonction), date de la dernière exécution.
2. **Réglages** : année, domaines d'e-mail, politiques (édition du tableau), table chapitre →
   cours **avec le nom du cours affiché à côté de chaque identifiant** (section 2.2), seuils.
3. **Exécuter** : bouton « Simuler » (toujours disponible) et bouton « Appliquer » (grisé tant
   qu'aucune simulation récente n'existe pour le périmètre). **Cases à cocher** : cohortes de
   l'année (préfixe `year_prefix`) ; au moins une case pour lancer. Une cohorte non cochée
   n'est pas touchée, même si sa politique matcherait.
4. **Rapport** : totaux, puis les listes qui comptent — créations, rapprochements par e-mail,
   rapprochements par nom, désactivations prévues, doublons probables, conflits d'e-mail,
   comptes hors Moodle (**pour information seulement**), joueurs sans identité Moodle.
5. **Rapprochements en attente** : membre Moodle à gauche, comptes candidats à droite, boutons
   « lier », « créer », « ignorer ».
6. **Conflits** : trois boutons par ligne (section 9).
7. **Historique** : liste des exécutions, rapport de chacune, bouton « annuler ».
8. **Entrée depuis le cours (M6)** : interrupteur LTI, table des liaisons cours Moodle →
   produit / écran (noms de cours lus dans Moodle, suggestions selon les cohortes), politique
   des inconnus, cibles enseignant. Pas de fioriture : le détail des clés est en 21.6.

Conventions front du dépôt : composants fonctionnels, hooks, locale `fr-FR`, thème forêt, cibles
tactiles ≥ 44 px, runtime JSX automatique (pas d'`import React` pour écrire du JSX), et
`no-use-before-define` en erreur sur `src/**`. Poser un test de montage avant de toucher un
composant racine.

## 15. Sécurité et données personnelles

- Jeton en `.env` uniquement (I-9), appels en HTTPS, jeton restreint par IP côté Moodle.
- Aucune donnée nominative Moodle dans les journaux applicatifs : identifiants numériques
  seulement. Les noms et e-mails n'apparaissent que dans le rapport d'exécution, accessible aux
  seuls administrateurs.
- Données **lues** dans Moodle : identifiant, `idnumber`, nom d'utilisateur, prénom, nom,
  e-mail, méthode d'authentification, état suspendu, appartenances.
- Données **écrites** vers Moodle : noms et `idnumber` de groupes, identifiants numériques de
  membres. Aucune donnée ForetMap (pseudo, secret, avatar, statistique, production d'élève) ne
  sort. C'est une propriété à vérifier en revue de code, pas seulement une intention.
- Élèves mineurs : compléter le registre de traitement (finalité : accès aux outils
  pédagogiques ; base légale : mission d'enseignement ; conservation : comptes désactivés à la
  sortie, suppression manuelle après la durée fixée par l'établissement).
- Ne jamais versionner de dump SQL : la règle du dépôt vaut ici plus qu'ailleurs, les rapports
  d'exécution contiennent des noms et des adresses.

## 16. Tests exigés

Backend (`tests/*.test.js`, `node:test` + `supertest`, séquentiel) :

| Fichier                          | Couvre                                                                                                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moodle-client.test.js`          | encodage des paramètres imbriqués ; `exception` en `HTTP 200` traitée comme une erreur ; réessai réseau mais pas applicatif ; jeton absent des journaux                                                                      |
| `moodle-policies.test.js`        | choix de la politique par motif, ordre des règles, motif invalide refusé, cohorte non appariée ignorée                                                                                                                       |
| `moodle-matching.test.js`        | les quatre règles dans l'ordre ; homonymes non rapprochés ; e-mail d'enseignant en conflit ; normalisation des accents et des traits d'union                                                                                 |
| `moodle-sync-dry-run.test.js`    | une simulation n'écrit rien (comparaison d'empreinte de base avant/après) ; le rapport liste tout                                                                                                                            |
| `moodle-sync-apply.test.js`      | création, rapprochement, appartenances, classe G&L et joueur créés via `lib/glGroupBridge.js` ; **idempotence** : deuxième passage sans écriture                                                                             |
| `moodle-sync-guardrails.test.js` | I-4 et section 11 : groupe local, compte local, compte `sync_exempt`, équipe locale — aucune écriture les concernant ; seuils déclenchés ; `force` requis                                                                    |
| `moodle-sync-undo.test.js`       | annulation complète : appartenances rendues, comptes réactivés, identités retirées, comptes créés désactivés et non supprimés                                                                                                |
| `moodle-conflicts.test.js`       | comparaison à trois sur les quatre combinaisons ; résolution par les trois boutons ; `members_hash` recalculé après « ignorer »                                                                                              |
| `moodle-teams-mirror.test.js`    | création, renommage, suppression d'un miroir `FM#` ; un groupe non `FM#` jamais touché ; collision de nom refusée avec message explicite ; joueur sans identité Moodle listé sans erreur ; partie non `draft` non recomposée |
| `gl-team-composer.test.js`       | moteur pur : `keepApart` jamais violé, écart de taille borné, déterminisme à `seed` égal, évitement des répétitions                                                                                                          |
| `moodle-admin-routes.test.js`    | permission `integrations.moodle.manage` exigée ; verrou (409) ; `apply` refusé sans simulation récente ; jeton jamais renvoyé                                                                                                |

Le serveur Moodle est **simulé** dans les tests : un faux serveur HTTP local qui répond comme
lui, **y compris ses erreurs en** `HTTP 200`. Aucun test ne doit appeler `olution.info`.

UI (`tests-ui/**`, Vitest) : rendu du rapport, écran des conflits, table chapitre → cours avec
noms, composition d'équipes et glisser-déposer.

Avant chaque commit : `npm run lint`, `npm run format:check`, `npm test`, `npm run test:ui`.

## 17. Lots et définition de terminé

| Lot | Contenu                                                                                                                                                                                                      | Effort     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| M1  | Client Web Services, `moodle:check`, migration, réglages, rapprochement, simulation, seuils, journal, `POST /runs` en `dry_run`                                                                              | 3,5 j      |
| M2  | Application réelle, transactions par cohorte, annulation, rapprochements en attente, outil de fusion de comptes                                                                                              | 3 j        |
| M3  | Comparaison à trois, conflits, écran administrateur complet                                                                                                                                                  | 2 j        |
| M4  | Moteur de composition des équipes, miroirs Moodle, sous-groupes                                                                                                                                              | 3 j        |
| M5  | Documentation : `docs/API.md`, `docs/CRONTAB.md`, `docs/EXPLOITATION.md`, `docs/reference/` (« Rentrée avec Moodle », pour les administrateurs et les professeurs)                                           | 0,5 j      |
| M6  | LTI 1.3 : outil unique, nouvel onglet, identité au clic, liaisons FM **et** G&L, arrivée réglée par l'admin (aiguillage si plusieurs cibles). **Pas** de notes. Réglages `integration.lti.*` (section 21.5). | à chiffrer |

**Terminé, pour chaque lot**, signifie : code + tests du lot verts + `lint` et `format:check`
propres + `docs/API.md` à jour si des routes ont bougé + entrée `CHANGELOG.md` sous
`[Non publié]` + le lot précédent toujours vert.

**Terminé pour M1** en particulier : `npm run moodle:check` répond correctement sur le vrai
site avec un jeton de test, et une simulation sur la cohorte `26#603` produit un rapport
lisible **sans avoir rien écrit** — vérifié par comparaison d'empreinte de la base avant et
après.

**Terminé pour M4** : les quatre équipes de `26#601-602` apparaissent dans le cours `564` avec
leurs noms exacts, leurs membres, et sans qu'aucun autre groupe du cours n'ait bougé.

**Terminé pour M6** : depuis le cours `564`, un élève de `26#603` déjà synchronisé clique
l'activité, s'ouvre un **nouvel onglet**, session sur le compte `users` déjà lié, arrivée
selon le `landing` admin (sans menu libre). Un n3beur dans ce même cours voit l'aiguillage
**ForetMap et G&L**. Depuis `511` (La salle aérée n³), mécanisme vers ForetMap. Un élève
sans identité de la couche A est **refusé**, sans compte fantôme. Pas de bouton retour
Moodle, pas de note. Google OAuth hors Moodle continue de fonctionner.

## 18. Procédure de rentrée (une fois livré)

1. **Étape zéro, une seule fois avant la toute première synchronisation** : exporter les élèves
   sans adresse e-mail, faire compléter par les professeurs, réimporter ; obtenir un rapport
   `GET /api/gl/admin/players/reconcile` à zéro (aucun joueur sans compte, aucun miroir
   orphelin, aucun reliquat de mot de passe) ; tester une connexion Google sur un compte de
   chaque population, pour vérifier que le domaine autorisé et le réglage
   `ui.auth.allow_google_student` laissent bien passer les élèves.
2. Mettre à jour l'année dans les réglages (`26` → `27`) et vérifier les motifs de politique.
3. Mettre à jour la table chapitre → cours (les cours changent d'identifiant chaque année) et
   **vérifier les noms affichés**.
4. Snapshot de la base : `scripts/db-backup.sh --label pre-moodle-sync`.
5. `npm run moodle:check`.
6. Simulation complète ; lire le rapport : désactivations prévues (anciens élèves), créations,
   rapprochements par nom, conflits.
7. Exécution réelle **sur une seule cohorte**, la plus petite ; contrôler les effectifs et
   tester une connexion Google d'élève.
8. Exécution complète ; contrôle croisé des effectifs ; réconciliation G&L.
9. Traiter les rapprochements en attente et les conflits dans l'écran administrateur.
10. Composer les équipes du chapitre 1 dans G&L, pousser le miroir, vérifier dans le cours.
11. Activer le cron hebdomadaire de simulation.
12. **Après M6** : poser **une** activité outil externe (l'outil unique) dans le cours du
    chapitre 1 **et** dans le cours `511`, tester le clic élève et le clic enseignant,
    vérifier Google OAuth hors Moodle. Pilote : `26#603` dans `564` après sync réelle de
    cette cohorte — pas le jour de la première sync de masse.

## 19. Créer le jeton Web Services sur `olution.info`

Les services web et le protocole REST sont déjà actifs (vérifié : `webservice/rest/server.php`
répond `invalidtoken`). Il reste à créer un compte technique, un rôle, un service et le jeton.
Tout se fait dans **Administration du site** avec un compte administrateur Moodle.

1. **Compte technique** — Utilisateurs → Comptes → Ajouter un utilisateur : nom d'utilisateur
   `foretmap-sync`, méthode d'authentification **Comptes manuels** (pas Google), mot de passe
   long, e-mail technique, aucune inscription à aucun cours.
2. **Rôle système « ForetMap Web Services »** — Utilisateurs → Permissions → Définition des
   rôles → Ajouter un nouveau rôle (rôle vide, contexte **Système**), avec ces capacités en
   « Autoriser » :

- lecture : `webservice/rest:use`, `moodle/cohort:view`, `moodle/user:viewdetails`,
  `moodle/user:viewhiddendetails`, `moodle/user:viewalldetails`,
  `moodle/site:viewuseridentity` (sans quoi l'e-mail est masqué dans les réponses),
  `moodle/course:view`, `moodle/course:viewhiddencourses`, `moodle/site:accessallgroups` ;
- écriture des équipes : `moodle/course:managegroups` ;
- écriture optionnelle (`push_membership`) : `moodle/cohort:assign`.
  Puis Utilisateurs → Permissions → **Attribution des rôles système** : attribuer ce rôle à
  `foretmap-sync`. Vérifier aussi que le réglage « Afficher l'identité de l'utilisateur »
  (`showuseridentity`) inclut l'adresse de courriel, sinon `core_user_get_users_by_field` ne
  renvoie pas d'e-mail — et le rapprochement par e-mail, qui est le pivot de tout le
  dispositif, tomberait à l'eau.

3. **Service externe** — Serveur → Services web → Services externes → Ajouter : nom
   « ForetMap », **Activé**, « Utilisateurs autorisés seulement » coché, « Fichiers » décochés.
   Ajouter dans **Fonctions** celles de la section 7.2 (lecture, écriture, et les deux fonctions
   de cohorte seulement si `push_membership` doit être utilisé). Dans **Utilisateurs autorisés**,
   ajouter `foretmap-sync`.
4. **Jeton** — Serveur → Services web → Gérer les jetons → Créer un jeton : utilisateur
   `foretmap-sync`, service « ForetMap », **restriction IP** = adresse publique du serveur
   ForetMap, date de validité (un an, à renouveler à la rentrée). Le jeton ne s'affiche qu'une
   fois : le copier directement dans le `.env` du serveur, jamais dans un réglage, un dépôt ou
   un message.
5. **Vérification** depuis le serveur ForetMap :

```bash
 curl -s "https://olution.info/webservice/rest/server.php" \
   --data-urlencode "wstoken=$MOODLE_WS_TOKEN" \
   --data-urlencode "wsfunction=core_webservice_get_site_info" \
   --data-urlencode "moodlewsrestformat=json" | head -c 400
```

La réponse doit contenir `sitename`, `username: "foretmap-sync"` et la liste des fonctions
autorisées. Un `{"exception":…,"errorcode":"invalidtoken"}` en `HTTP 200` signale un jeton
erroné ou une restriction d'IP qui ne correspond pas.

Pour la phase de développement, un **jeton de test** sur un compte technique séparé, **sans les
fonctions d'écriture**, suffit et supprime tout risque.

## 20. Annuaire, cohortes, équipes — décisions (8 septembre 2026)

Plus de questions ouvertes ici. Consigne pour M1–M5.

| #   | Décision                                                                                                                                                         | Consigne pour le code                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A1  | Cours chapitres 2 à 6 = `565`, `566`, `567`, `595`, `570` dans cet ordre. **Confirmé.**                                                                          | Section 2.2. L'écran affiche le nom Moodle à côté de chaque id.                                          |
| A2  | Préfixe `{année}#` = élèves de l'année. `{année}#n3` = n3beurs de l'année (saisie « 26#N »). Année et **choix des cohortes à synchro** doivent rester réglables. | `year_prefix` + motifs `{year}` (section 6.2) + cases à cocher à l'exécution. Pas de motif attrape-tout. |
| A3  | `26#601-602` est un **groupe indissociable**. Pas de sous-groupes `601` / `602`.                                                                                 | Un groupe FM, une classe G&L.                                                                            |
| A4  | Recrutement n3beur depuis ForetMap **avec** écriture dans la cohorte Moodle (le drapeau existe déjà).                                                            | Politique n3 : `push_membership: true`. Remettre à `false` si le premier apply pose problème.            |
| A5  | Compte **rapproché** disparu des cohortes : **retrait des groupes synchronisés seulement**, pas de désactivation.                                                | La désactivation reste réservée aux comptes `origin = created` (I-4).                                    |
| A6  | Un élève sur deux cohortes joueuses **n'arrivera pas**. Si ça arrive : **alerte**, pas de table `gl_class_members`.                                              | Section 10.6.                                                                                            |

## 21. LTI 1.3 — entrée depuis le cours Moodle

Décisions pédagogiques : **8 septembre 2026**. Cette section est la consigne de M6.
Le seul paragraphe encore à remplir **après mesure** est 21.7 (lancement de test).

### 21.1 Rôle dans le chantier

LTI 1.3 n'est pas une deuxième synchronisation d'utilisateurs. C'est le moyen, pour une
personne **déjà reconnue** par la couche A, d'entrer dans ForetMap **ou** G&L d'un clic
depuis une activité du cours Moodle (`olution.info`).

Déroulé retenu :

1. L'élève (ou l'enseignant) est dans un cours Moodle lié : chapitre G&L (`564`…), cours
   ForetMap (`511`), ou tout autre cours ajouté dans les liaisons.
2. Il clique **l'unique** activité « outil externe » du site.
3. Moodle ouvre ForetMap / G&L dans un **nouvel onglet**, avec un jeton d'identité
   (OpenID Connect + JWT).
4. On rattache au compte `users` déjà lié (e-mail, puis `external_identities`), on pose une
   ligne `provider = 'lti'`, on ouvre une session **de même durée qu'une session Google**.
5. L'arrivée suit le `landing` **réglé par l'admin** pour cette liaison. Page d'aiguillage
   seulement s'il y a **plusieurs** destinations valides pour cette personne (n3beur dans
   un cours G&L : les deux produits ; enseignant : boutons prof FM / MJ G&L à chaque
   lancement).
6. **Aucune note** n'est renvoyée vers le carnet Moodle (M6). **Pas de bouton « retour au
   cours »** (Moodle reste dans l'autre onglet). Google OAuth hors Moodle reste ouvert.
   Déconnexion : écran de login local.

Moodle 5.2 est la **plateforme** ; ForetMap / G&L est l'**outil**. Ce n'est pas le jeton
Web Services de la section 19.

### 21.2 Déjà décidé — ne pas rouvrir

| #     | Règle                                                                                                                                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-L1  | **La sync Web Services reste la seule source des cohortes et des groupes.** LTI ne les lit pas, ne les écrit pas. Le roster d'un cours (Names and Role Provisioning) n'alimente jamais `groups` ni `gl_classes`. |
| I-L2  | **Rapprocher, ne pas recréer.** Le lancement réutilise le rapprochement par e-mail de la section 8 et `external_identities` avec `provider = 'lti'`. Pas de magasin d'identités parallèle.                       |
| I-L3  | **Aucun secret.** LTI n'écrit ni ne lit `password_hash`, ne touche pas `token_epoch`, ne « répare » pas Google.                                                                                                  |
| I-L4  | **Aucune écriture de compte Moodle** (identique à la section 1.2).                                                                                                                                               |
| I-L5  | **M1 à M5 ne livrent pas de lancement.** Ils livrent seulement une table `external_identities` assez générique pour `provider = 'lti'`.                                                                          |
| I-L6  | **M6 ne pousse aucune note** (Assignment and Grade Services écarté). Deep Linking écarté : l'enseignant pose l'activité à la main.                                                                               |
| I-L7  | **Un seul outil externe** enregistré sur `olution.info`, pour les deux produits. Le routage FM / G&L est un réglage, pas un second outil Moodle.                                                                 |
| I-L8  | **Nouvel onglet**, pas d'iframe Moodle.                                                                                                                                                                          |
| I-L9  | **Personne absente de la couche A : refus** par défaut (message clair). Pas de création de compte à la volée.                                                                                                    |
| I-L10 | **Le rôle métier ne se dérive pas du rôle LTI.** `Learner` / `Instructor` décident seulement _si_ on ouvre une session et _quelles cibles enseignant_ proposer. Le rôle FM/GL vient de la sync et du RBAC.       |

Les groupes `FM#` poussés par la couche A restent le moyen de **restreindre une activité
Moodle à une équipe**. LTI n'a pas à recréer ces groupes.

### 21.3 Les trois briques, état après décisions

#### Brique 1 — Lancement (Resource Link) — dans M6

Un outil, deux produits, liaisons **évolutives** : l'administrateur associe un cours Moodle
à ForetMap et/ou G&L, avec un écran d'arrivée. Les cohortes connues alimentent des
**suggestions** (ex. un cours où joue `26#601-602` → proposer G&L chapitre ; un cours lié à
`26#n3` ou l'id `511` → proposer ForetMap). La suggestion n'écrit pas toute seule : l'admin
valide. On peut ajouter d'autres cours plus tard sans changer le code.

Le cours désigne le chapitre (ou la carte) par **les deux** : table de liaisons (défaut) **et**
paramètres LTI personnalisés (`product`, `chapter`, `landing`, …) qui **surchargent** la
table. Oublier la table à la rentrée n'est plus silencieux si le paramètre d'activité est
juste ; un paramètre faux n'est plus silencieux si la table est juste — le rapport de
lancement doit dire lequel a gagné.

#### Brique 2 — Identité au clic — dans M6

Rattachement : ligne LTI connue, sinon e-mail (section 8), sinon id Moodle si L9 le confirme.
Clic enseignant : à **chaque** lancement, boutons des cibles autorisées (prof FM et/ou
MJ G&L). Clic d'un inscrit hors politique de sync : refus (L6), sans valeur `create`.

`sub` LTI vs id Moodle : **à mesurer sur** `olution.info` **avant le premier pilote élève**
(L9). Les e-mails ne sont en principe pas masqués ; si un lancement de test arrive sans
e-mail, exiger le réglage Moodle « partager l'e-mail avec l'outil » avant d'aller plus loin.

#### Brique 3 — Retour de notes — hors M6

**Non.** Pas de colonne de carnet, pas d'AGS, pas de client de notes. Deep Linking : **non**.
L13 à L16 restent sans objet tant qu'on ne rouvre pas L12.

### 21.4 Décisions L1–L22 (8 septembre 2026)

| #       | Décision                                                                                                                                                              | Consigne pour le code                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| L1      | ForetMap **et** G&L. Choix selon les cohortes Moodle, avec suggestions pour les cohortes / cours connus. Doit rester évolutif.                                        | Table de liaisons admin, pas d'outil Moodle par produit. Suggestions, jamais d'écriture automatique.           |
| L2      | L'**admin** règle `landing` / `landing_options`. L'élève n'a pas un menu libre à chaque clic. Aiguillage si plusieurs destinations s'appliquent (n3beur, enseignant). | Pas de choix élève quand une seule destination.                                                                |
| L3      | Table **et** paramètres d'activité (surcharge).                                                                                                                       | Résoudre : paramètre LTI s'il est présent et valide, sinon liaison du cours, sinon refus explicite.            |
| L4      | **Nouvel onglet.**                                                                                                                                                    | Enregistrement Moodle : ouverture dans un nouvel onglet. Pas d'iframe.                                         |
| L5      | **Outil unique** sur `olution.info`. L'URL publique de lancement est **paramétrable**.                                                                                | Réglage `integration.lti.public_origin` (défaut proposé : origine ForetMap).                                   |
| L6      | **Refuser** si absent de la couche A.                                                                                                                                 | Message clair, journal d'identifiant numérique seulement. Aucun `INSERT` `users`.                              |
| L7      | Enseignant : boutons **à chaque lancement** (prof FM / MJ G&L selon `instructor_targets`).                                                                            | Pas d'atterrissage enseignant unique forcé.                                                                    |
| L8      | Suivre la proposition : **ne pas** dériver le rôle FM/GL du rôle LTI.                                                                                                 | I-L10.                                                                                                         |
| L9      | Inconnu à ce stade ; e-mails normalement visibles.                                                                                                                    | Mesure sur un lancement de test **avant** pilote élève ; consigner `sub` / e-mail / nom ici.                   |
| L10     | Les deux chemins (LTI et Google) restent ouverts sur le même compte.                                                                                                  | `google_sub` et ligne `lti` coexistent.                                                                        |
| L11     | **Reporté.** Ce chantier est fonctionnel ; registre de traitement / info familles hors lot.                                                                           | Ne pas bloquer M6. Ne pas inventer de texte juridique.                                                         |
| L12     | **Non** — pas de notes vers Moodle pour M6.                                                                                                                           | I-L6.                                                                                                          |
| L13–L16 | Sans objet (L12 = non).                                                                                                                                               | —                                                                                                              |
| L17     | **Non** — pas de Deep Linking.                                                                                                                                        | L'enseignant pose l'activité à la main.                                                                        |
| L18     | Même personne que le jeton WS, **et éventuellement un autre admin** Moodle.                                                                                           | Documenter le geste à deux. Restriction IP : celle du **navigateur** (élève / lycée), pas celle du serveur FM. |
| L19     | Durée **comme Google**. **Pas** de bouton « retour au cours » (autre onglet). Déconnexion → login local.                                                              | Ne pas rediriger vers Moodle.                                                                                  |
| L20     | Même refus que L6. Enum : `refuse` / plus tard `queue`. **Jamais** `create`.                                                                                          | Confirmé : pas de création de compte au clic LTI.                                                              |
| L21     | Cours ForetMap `511` : **La salle aérée n³** (abrégé **n³**) ; d'autres cours liables.                                                                                | Section 2.6 + table de liaisons.                                                                               |
| L22     | OK : pilote après sync réelle de `26#603`, pas le jour de la sync de masse.                                                                                           | Procédure de rentrée, étape 12.                                                                                |
| L23     | N3beur dans un cours chapitre G&L : **aiguillage des deux produits** (ForetMap et G&L).                                                                               | Même si la liaison du cours est `gl`. Un élève 6e non n3beur suit le `landing` admin, sans ce double choix.    |

### 21.5 Réglages administrateur — peu, au bon endroit

Consigne générale (8 septembre 2026) : **tout ce qui varie d'une année ou d'un cours à
l'autre est un réglage**, pas une constante. Mais on ne noie pas l'écran : uniquement ce
qu'un admin doit pouvoir changer sans développeur, groupé dans l'onglet Moodle déjà prévu
(section 14), sous-section **« Entrée depuis le cours »**, visible dès M6, ignorée tant que
`integration.lti.enabled` est faux. Permission : la même `integrations.moodle.manage`.

Ne **pas** dupliquer cette table dans les réglages G&L « plateforme » ni dans un troisième
écran. Un MJ sans cette permission ne modifie pas les liaisons LTI.

Valeurs initiales (semis M6, modifiables ensuite) :

| Clé                                  | Type    | Défaut          | Rôle                                                                                                                                                               |
| ------------------------------------ | ------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `integration.lti.enabled`            | boolean | `false`         | interrupteur. Sans secrets `.env`, l'écran le dit, le lancement répond `503`.                                                                                      |
| `integration.lti.unknown_user`       | enum    | `refuse`        | `refuse` (L6/L20). `queue` réservé (même file que M2). **Pas** de valeur `create`.                                                                                 |
| `integration.lti.public_origin`      | string  | `''`            | origine publique de l'outil unique (ex. `https://foretmap.olution.info`). Vide = origine ForetMap du processus. Doit correspondre à l'URL enregistrée dans Moodle. |
| `integration.lti.instructor_targets` | json    | `["fm","gl"]`   | cibles d'un `Instructor` : ForetMap prof, G&L MJ, les deux, ou une seule.                                                                                          |
| `integration.lti.launch_bindings`    | json    | voir ci-dessous | liaisons cours Moodle → produit / arrivée / chapitre. Évolutif.                                                                                                    |
| `integration.lti.landing_options`    | json    | voir ci-dessous | options proposées sur la page d'aiguillage (on n'affiche que celles-ci).                                                                                           |

Forme d'une liaison (`launch_bindings`) :

```json
[
  {
    "moodle_course_id": 564,
    "product": "gl",
    "gl_chapter_id": 1,
    "landing": "aiguillage",
    "label": ""
  },
  {
    "moodle_course_id": 511,
    "product": "fm",
    "landing": "aiguillage",
    "label": ""
  }
]
```

`product` : `fm` / `gl` / `both` (l'aiguillage propose les deux produits). `landing` :
`aiguillage` (défaut), `gl_game`, `gl_home`, `fm_map`, `fm_tasks`. Une liaison `both` sans
aiguillage est refusée à l'enregistrement.

Valeurs initiales des liaisons : un enregistrement par cours de la section 2.2 (G&L,
`product: "gl"`, chapitre correspondant) **plus** le cours `511` (`product: "fm"`). L'écran
affiche le **nom du cours** lu dans Moodle à côté de chaque id, comme la table chapitre →
cours. Bouton « suggérer » : à partir des cohortes visibles dans ce cours (groupe
« Cohorte 26#… »), proposer FM si `n3` apparaît, G&L si une cohorte joueuse apparaît. L'admin
peut ajouter une ligne pour n'importe quel autre id de cours.

`landing_options` (défaut) : les cinq valeurs ci-dessus. En retirer une la masque sur
l'aiguillage **et** dans le sélecteur de liaison.

**Ce qui n'est pas un réglage admin** (reste dans `.env`, I-9) : issuer, client id,
deployment id, clés de l'outil. **Ce qui n'est pas un réglage du tout** : durées JWT
(même pile que Google, L19), liste des fonctions Moodle, invariants I-L*.

### 21.6 Ordre d'implémentation M6

1. Secrets `.env` + `moodle:check` étendu : l'outil unique est-il joignable, l'e-mail apparaît-il
   dans un lancement de test (L9) ?
2. Réglages `integration.lti.*` + écran section 14 point 8 (liaisons, suggestions, noms de cours).
3. Endpoint de lancement (outil unique), session, `external_identities` `lti`, refus L6.
4. Page d'aiguillage + surcharge par paramètres d'activité (L3).
5. Cibles enseignant (L7). Vérifier Google toujours possible (L10).
6. Tests : faux plateforme LTI (pas d'appel à `olution.info`) ; personne inconnue refusée ;
   `Instructor` ne devient pas élève ; iframe non utilisée ; aucune écriture AGS.
7. Doc `docs/reference/` : geste professeur (poser l'activité, nouvel onglet, restreindre au
   groupe `FM#` si besoin) et geste admin (liaisons, suggestions).

Chiffrage : possible dès M5 vert ; les décisions pédagogiques ne bloquent plus.

### 21.7 Ce que le lancement de test doit écrire ici (L9, L18)

Avant tout élève réel, consigner dans ce paragraphe :

- `sub` reçu (id numérique Moodle ou opaque) ;
- présence de l'e-mail et du nom ;
- URL publique de lancement retenue (hôte `foretmap.` ou autre) ;
- qui a enregistré l'outil (compte Moodle).

Tant que ce paragraphe est vide, le pilote élève n'a pas lieu.

### 21.8 Précisions d'aiguillage — décisions (8 septembre 2026)

Plus de questions ouvertes. Récapitulatif des réponses aux anciens points 21.8 :

1. **N3beur dans un cours chapitre** : aiguillage **des deux produits** (L23).
2. **Options d'arrivée** : l'**admin** les règle (`landing` / `landing_options`). Pas de menu
   libre élève à chaque clic, sauf le cas 1 et le cas enseignant.
3. **Enseignant** : boutons **à chaque lancement**, selon `instructor_targets` (L7).
4. **Retour Moodle** : **non**. Le cours reste dans l'autre onglet. Déconnexion → login local.
5. **URL publique** : **paramétrable** (`integration.lti.public_origin`). Défaut proposé :
   origine ForetMap, qui redirige vers G&L si la liaison le dit.
6. **`create` au clic** : **interdit**. Confirmé.
7. **Cours `511`** : La salle aérée n³ / n³ (section 2.6).
