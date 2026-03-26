# Journal des versions

Ce fichier suit les principes de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).
Le numéro de version suit [Semantic Versioning](https://semver.org/lang/fr/) (MAJEUR.MINEUR.CORRECTIF).

## [Non publié]

### Ajouté
- **Sélection de session “Collectif”** : ajout d’une sélection persistée des tâches et des élèves par session (`collective_session_tasks`, `collective_session_students`), avec API dédiée pour inclure/exclure les éléments sans perdre le contexte.
- **Vue “Collectif” (prof/admin)** : ajout d’une nouvelle vue `👥 Collectif` (desktop) pour piloter une session collective (présents/absents) et assigner/retirer des élèves sur les tâches par contexte (carte/projet), avec API `/api/collective/*` et migration `031_collective_sessions.sql`.
- **Audit admin + intégrité BDD** : nouveau script `scripts/ensure-admin-and-audit-db.js` (commandes `db:admin:audit` et `db:admin:audit:dry`) pour garantir que l’utilisateur critique (`oliviera9` par défaut) reste admin RBAC et pour contrôler la cohérence globale de la base (tables clés, rôles primaires, liens orphelins).
- **Réparation ciblée des assignations orphelines** : ajout de l’option `--fix-orphans` et de la commande `db:admin:audit:fix-orphans` pour neutraliser automatiquement les `task_assignments.student_id` sans élève existant (compatible `--dry-run`).
- **Mode de vue par rôle (prof/admin)** : ajout d’une bascule d’interface `vue élève` (prof + admin) et `vue prof` (admin), avec retour immédiat au rôle normal en un clic pour prévisualiser les parcours sans se déconnecter.
- **Bootstrap local en une commande** : ajout du script `npm run local:setup` (Docker MySQL + install deps + init BDD + check local).
- **Unification progressive des identités** : ajout d’une table canonique `users`, d’un script de backfill (`npm run db:backfill:users`) et de migrations dédiées (`027_users_unification_and_history.sql`, `028_admin_oliviera9_guard.sql`) pour converger sans rupture depuis `students`/`teachers`.
- **Historique structuré des actions utilisateur** : nouvelle table `security_events`, enrichissement de `audit_log` (acteur/résultat/payload), et journalisation étendue (auth succès/échec, élévation PIN, opérations RBAC, actions tâches).
- **Plan de validation migration users** : nouveau document `docs/USERS_MIGRATION.md` avec matrice de tests, contrôles SQL et critères de bascule.
- **RBAC complet configurable** : ajout d’un gestionnaire de profils (Admin, Prof, Élève chevronné, Élève avancé, Élève novice) avec permissions par profil, attribution utilisateur et élévation des droits via PIN de profil.
- **Schéma RBAC** : nouvelles tables `roles`, `permissions`, `role_permissions`, `role_pin_secrets`, `user_roles`, `elevation_audit` + migration `025_rbac_profiles.sql` et seed initial des profils.
- **API admin RBAC** : nouvelles routes `/api/rbac/*` pour gérer profils, permissions, PIN et affectation des rôles.
- **Page dédiée admin** : nouvelle vue frontend `Gestionnaire de profils` (onglet prof/admin) pour administrer noms de profil, droits, PIN et attributions.
- **Console “Paramètres admin”** : nouvelle interface GUI centralisée (onglet prof/admin) pour piloter l’accueil/auth, les modules UI, les cartes/plans (URL + upload image), et les actions d’exploitation (logs, debug OAuth, redémarrage).
- **Auth enrichie** : endpoint `/api/auth/elevate`, endpoint `/api/auth/me`, tokens JWT avec permissions effectives et statut `elevated`.
- **Auth élève par identifiant** : la connexion accepte désormais un champ unique `identifier` (pseudo ou email) avec compatibilité maintenue sur l’ancien format `firstName + lastName`.
- **Mot de passe oublié (élève + prof)** : nouveaux endpoints de reset (`forgot-password` / `reset-password`) avec email de réinitialisation, token fort hashé, expiration et usage unique.
- **Comptes prof email/mot de passe** : ajout de la table `teachers`, de l’auth prof par email (`POST /api/auth/teacher/login`) et conservation complète du mode PIN existant.
- **Service email SMTP** : nouveau module `lib/mailer.js`, variables `.env` associées, script `npm run db:seed:teacher`, et documentation API/README mise à jour.
- **UI authentification refondue** : écran de connexion en `identifiant + mot de passe`, lien `Mot de passe oublié`, et coexistence PIN / email côté modal prof.
- **Couverture de tests auth** : extension des tests backend auth et ajout d’un scénario e2e de connexion par pseudo/email.
- **Import élèves en masse (prof)** : ajout de `POST /api/students/import` pour importer des comptes élèves depuis un fichier CSV/XLSX, avec validation par ligne, mode simulation (`dryRun`) et rapport détaillé des erreurs.
- **Template élèves téléchargeable** : ajout de `GET /api/students/import/template` (CSV/XLSX) avec colonnes prêtes à l’emploi et une ligne d’exemple à remplacer/supprimer avant import.
- **UI prof — Gestion des élèves** : import/export/création/suppression déplacés dans l’onglet `Profils & utilisateurs` (`src/components/profiles-views.jsx`) pour centraliser l’administration.
- **Vue “Collectif” (prof/admin)** : nouvel onglet `Collectif` (tablette/desktop) pour activer une session par carte/projet, marquer des absences, et assigner/retirer des élèves sur les tâches (drag & drop ou boutons).
- **Tests import élèves** : nouveau fichier `tests/students-import.test.js` couvrant le template CSV, la simulation et la création réelle d’élèves.
- **Page Visite publique** : nouvelle expérience `Visite` accessible sans connexion depuis l’écran d’accueil, et via un onglet dédié placé avant « À propos » pour les utilisateurs connectés.
- **API visite dédiée** : nouveau routeur `routes/visit.js` (`/api/visit/content`, `/api/visit/progress`, `/api/visit/seen`) avec endpoints prof pour éditer les contenus zone/repère, gérer les médias de visite et sélectionner les tutoriels affichés.
- **Persistance vu/non-vu** : support connecté (BDD) et non connecté (cookie signé `anon_visit_token` + stockage serveur TTL 1 jour) pour conserver l’état même après fermeture de l’app.
- **Schéma visite** : nouvelles tables SQL (`visit_zone_content`, `visit_marker_content`, `visit_media`, `visit_tutorials`, `visit_seen_students`, `visit_seen_anonymous`) + migration `021_visit_public_flow.sql`.
- **Nouvelle vue frontend** : composant `src/components/visit-views.jsx` avec carte interactive, indicateurs rouge/vert, panneau de détails (sous-titre, description, bloc dépliable, galerie photo) et section tutoriels choisis par le professeur.
- **Tests visite** : nouveaux scénarios backend sur le contenu visite, la persistance anonyme via cookie signé et la persistance élève en base.

### Modifié
- **Layout grand écran (prof + élèves)** : ajout d’un mode adaptatif qui fusionne `Carte` et `Tâches` sur une seule page quand la largeur disponible le permet (fallback automatique en onglets si l’espace devient insuffisant), extension de la zone utile en desktop et agrandissement de la carte en vue `Collectif`.
- **Inscription élève (UI)** : le formulaire demande désormais explicitement l’espace d’activité (`N3`, `Forêt comestible` ou `les deux`) via un sélecteur obligatoire, puis transmet ce choix (`affiliation`) à l’API d’inscription.
- **Connexion unifiée multi-rôles** : `POST /api/auth/login` devient l’unique endpoint de connexion (élève/prof/admin) via `identifier` + mot de passe, sans fallback legacy.
- **Mode professeur frontend** : la connexion email passe désormais par `/api/auth/login`, avec activation du mode prof selon la permission `teacher.access`.
- **Compat legacy supprimée** : les anciens endpoints de connexion prof (`/api/auth/teacher/login` et PIN global hors session) sont désactivés côté backend.
- **Bascule users-only** : suppression des accès backend aux tables `students`/`teachers` au profit de `users` (auth, RBAC, routes métier, scripts SQL/ops), ajout de la migration de coupure `029_users_only_cutover.sql` (repointage des FK + drop legacy).
- **Authentification élève** : suppression du login `firstName+lastName`, maintien du seul mode `identifier` (`email`/`pseudo`) + mot de passe.
- **Couverture de tests migration users** : adaptation des tests backend critiques (`auth`, `api`, `students-delete`, `students-import`, `new-features`, `observations-images`) aux requêtes et payloads `users`.
- **Compatibilité applicative migration users** : double lecture/écriture côté backend et frontend (session unifiée `foretmap_session`, JWT enrichi avec `canonicalUserId`, fallback legacy maintenu).
- **Traçabilité des tâches/stats** : ajout de `student_id` sur `task_assignments`/`task_logs` avec fallback nominal maintenu pour rétrocompatibilité.
- **Durcissement admin prod** : garde-fou explicite pour conserver les droits admin de l’identité canonique `oliviera9` lors des migrations.
- **Protection des routes sensibles** : remplacement de la logique binaire `requireTeacher` par des permissions RBAC explicites sur zones, tâches, plantes, stats, audit, visite, observations, tutoriels et gestion élèves.
- **Flux professeur** : la saisie du PIN devient une élévation de session post-connexion (compatibilité PIN historique conservée en secours).
- **Gating UI** : affichage/activation conditionnelle de plusieurs actions prof selon permissions réelles et statut d’élévation.
- **Configuration dynamique** : ajout d’une couche `app_settings` persistée en BDD (`/api/settings/public`, `/api/settings/admin/*`) pour remplacer des options front hardcodées.
- **Cartes multi-paramètres** : enrichissement `maps` avec `is_active` et `frame_padding_px`, exposés via API et consommés par l’UI.
- **Visite/tâches complètement dissociées** : la visite utilise désormais ses propres entités (`visit_zones`, `visit_markers`) avec outils professeur dédiés pour créer/éditer/supprimer zones et repères directement sur la carte de visite, sans dépendre des zones/repères du système de tâches.
- **Panel emojis centralisé et enrichi** : création de `src/constants/emojis.js`, remplacement des listes locales, ajout d’emojis biodiversité, techno et école pour les repères (tâches/visite) et formulaires liés.
- **Navigation/auth** : ajout d’un CTA « Visiter sans connexion » dans l’écran d’authentification et intégration de l’onglet `Visite` dans les navigations élève/prof.

### Corrigé
- **Carte mobile (gestes tactiles)** : en mode vue non zoomé, le glissement à un doigt privilégie désormais le scroll de page (et conserve le zoom/pan carte à deux doigts), pour éviter les blocages de navigation sur smartphone.
- **Carte mobile (repères)** : augmentation légère de la taille des icônes de repère sur smartphone pour restaurer la lisibilité, tout en conservant un rendu plus compact que la taille historique initiale.
- **Vue “Collectif” (prof/admin)** : blocage préventif des actions refusées côté API (inscription sur tâche pleine/terminée/validée/proposée, retrait sur tâche terminée/validée), avec feedback explicite pour éviter les erreurs inutiles en séance.
- **Accès stats (admin/prof)** : l’icône de profil (badge utilisateur en haut à droite) ouvre désormais la page `📊 Stats` en vue professeur/admin, au lieu de rester inactive.
- **En-tête prof/admin (mobile)** : suppression du débordement horizontal en petite largeur (conteneur d’actions contraint et scroll interne) et réaffichage de l’avatar/logo utilisateur dans le badge stats, avec libellé nom fiable (plus de fallback intempestif sur « Utilisateur »).
- **Connexion Google (UI)** : simplification du libellé du bouton de connexion pour n’afficher que `Continuer avec Google` (sans parenthèses de domaines) en mode élève et professeur.
- **Badge de version (en-tête)** : le badge de version en haut de page n'est plus affiché pour les élèves (visible uniquement en mode professeur).
- **Profil utilisateur explicite** : la vue `Mon profil` affiche désormais clairement le type de profil (`admin`, `prof` ou `eleve`) pour éviter l’ambiguïté sur les droits actifs.
- **Modales stats/profil** : amélioration de la fermeture des fenêtres (bouton accessible + arrêt de propagation du clic) pour éviter les fermetures involontaires.
- **Navigation mobile** : meilleure lisibilité des libellés d’onglets avec retour à la ligne contrôlé sur petits écrans.
- **Session prof et vues stats** : correction du décodage JWT base64url (padding inclus), revalidation `/api/auth/me` au démarrage pour resynchroniser les permissions, et suppression des loaders infinis sur les vues statistiques en cas d’erreur API.
- **Build serveur sans Vite** : `npm run build` devient tolérant en production sans dépendances dev ; si `vite` est absent mais `dist/` est déjà présent, la commande ne casse plus (`scripts/build-safe.js`).
- **Bootstrap local MySQL** : `local:setup` attend désormais explicitement la disponibilité du serveur MySQL (`scripts/wait-mysql-ready.js`) avant `db:init`, évitant les échecs aléatoires de type `PROTOCOL_CONNECTION_LOST`.
- **Environnement local** : suppression de la configuration npm qui omettait les dépendances dev par défaut, ce qui bloquait `supertest` et `@playwright/test` après un `npm install` standard.
- **E2E local** : Playwright démarre automatiquement l’application hors CI (`db:init` + `npm start`) et bloque les service workers pour éviter les caches obsolètes.
- **Helpers e2e auth** : attente explicite du champ `Prénom` après bascule “Créer un compte” pour réduire les faux timeouts.
- **Sécurité stats élève** : `GET /api/stats/me/:studentId` exige désormais une session authentifiée et limite l’accès au propriétaire (élève) ou aux rôles autorisés (`stats.read.all`).
- **Sécurité carnet d’observations** : suppression de la confiance dans `studentId` envoyé par le client ; lecture/création/suppression et accès image reposent maintenant sur l’identité JWT (propriétaire ou professeur autorisé).
- **Fuite d’affectations sur les tâches** : `GET /api/tasks` ne charge plus toutes les assignations globales ; filtrage SQL par `task_id` et exposition réduite selon le rôle.
- **Migrations SQL** : arrêt explicite sur erreur non idempotente au lieu d’avancer silencieusement la version de schéma.
- **Résilience process** : en cas de `uncaughtException` / `unhandledRejection`, le serveur journalise en fatal puis s’arrête proprement (`exit 1`) pour éviter un état incohérent.
- **Endpoints admin** : retrait du secret en query string pour `/api/admin/logs` et `/api/admin/oauth-debug` (header `x-deploy-secret` uniquement).
- **Frontend carte** : correction d’un `ReferenceError` (`isMine`) dans les modales d’inscription aux tâches liées zone/repère.
- **Outillage tests** : script `npm test` rendu portable (`node --test \"tests/*.test.js\"`) et ajout de `@playwright/test` dans les dépendances de développement.
- **Connexion multi-profils** : suppression du blocage `Type de compte non pris en charge` sur `/api/auth/login`; la session est désormais résolue via le rôle RBAC principal pour accepter les comptes élève/prof/admin.
- **PIN et droits natifs** : les rôles `admin` et `prof` accèdent désormais à leurs droits natifs sans code PIN ; le PIN ne sert plus qu’à l’élévation temporaire des droits.
- **Accès admin profils/utilisateurs** : l’onglet professeur affiche désormais `Profils & utilisateurs` dès qu’un rôle possède les permissions RBAC concernées (`admin.roles.manage` ou `admin.users.assign_roles`), même avant élévation PIN.
- **Statut des tâches à l'inscription** : une tâche passe désormais en `en cours` dès la première prise en charge élève (même si `required_students > 1`) ; le recalcul `unassign` reste cohérent (`available` seulement quand il ne reste aucune assignation).
- **Retrait de tâche (élève)** : `POST /api/tasks/:id/unassign` n’exige plus le JWT professeur, comme `assign` et comme l’UI « Me retirer » ; corrige le `401 Unauthorized` en production.
- **Garde-fou anti-lockout admin** : `PUT /api/rbac/users/:userType/:userId/role` bloque la rétrogradation du dernier administrateur actif.

### Modifié
- **Navigation Tuto (élève/prof)** : l’onglet `Tuto` affiche désormais une vraie liste consultable (cartes animées), avec aperçu intégré et actions de téléchargement HTML/PDF.
- **Tâches** : ajout du champ `tutorial_ids` sur création/édition de tâche, affichage des tutoriels liés dans les cartes de tâches et sélection multi-tutoriels dans le formulaire prof.
- **Liste des tâches** : pastille de statut discrète (rouge/orange en fondu pulsé pour à faire / en cours, vert fixe pour terminée ou validée), avec libellé accessible au survol et pour les lecteurs d’écran.
- **Carte (zones/repères)** : ajout des pastilles de statut des tâches directement sur la carte (rouge/orange en fondu, vert fixe), avec agrégation par priorité quand plusieurs tâches sont liées au même élément.
- **Contraste des statuts** : teinte orange “en cours” renforcée (`#f59e0b`) pour mieux se distinguer du rouge “à faire”, en vue tâches et sur la carte.
- **Préparation de déploiement** : exécution du workflow build local `npm run deploy:prepare` pour générer `dist/` et l’archive de livraison.

### Ajouté
- **Catalogue tutoriels enrichi** : intégration de 6 nouveaux tutoriels HTML du dossier `tutos/` (`associations`, `compost`, `eau`, `semences`, `sol`, `sol-vivant`) via seed SQL et migration `021_add_new_tutorials_seed.sql`.
- **Module Tutoriels complet** : nouveau routeur `routes/tutorials.js` (`GET/POST/PUT/DELETE`, rendu HTML, téléchargement HTML et PDF généré à la volée), nouveau composant frontend `src/components/tutorials-views.jsx`, et exposition statique du dossier `tutos/`.
- **Schéma tutoriels + lien avec tâches** : ajout des tables `tutorials` et `task_tutorials` (migration `020_tutorials_and_task_links.sql`), avec seed initial des 4 tutoriels HTML du dossier `tutos/`.
- **Tests tutoriels** : nouveau fichier `tests/tutorials.test.js` couvrant la lecture, les droits prof, les téléchargements HTML/PDF et l’association `tutorial_ids` lors de la création d’une tâche.
- **Tâches multi-zones / multi-repères** : tables `task_zones` et `task_markers`, API `zone_ids` / `marker_ids`, formulaire prof avec cases à cocher (plusieurs zones et repères sur la même carte), liens/déliens depuis la carte sans écraser les autres associations ; migration `019_task_zones_markers_multi.sql`.
- **Réconciliation des uploads orphelins** : nouveau script `scripts/reconcile-orphan-uploads.js` + commandes `db:uploads:reconcile:dry` et `db:uploads:reconcile` pour détecter/supprimer les fichiers orphelins sous `uploads/` (mode dry-run par défaut, scope géré sécurisé) ; tests dans `tests/uploads-reconcile-script.test.js`.
- **Audit consolidé bugs/incohérences** : ajout de `docs/AUDIT_BUGS_INCOHERENCES.md` avec une matrice unique des constats (sécurité, médias, temps réel, documentation) et priorisation d'actions.
- **Affectation des tâches depuis la carte** : ajout du lien direct tâche↔zone et tâche↔repère depuis les modales carte (onglets/actions dédiés en mode prof), avec support backend `marker_id` sur les tâches.
- **Associations multiples d’êtres vivants** : les zones et repères acceptent désormais plusieurs êtres vivants associés (`living_beings`), avec conservation d’un être vivant principal pour compatibilité UI/API.
- **Multi-cartes (Forêt + N3)** : ajout du support de cartes multiples avec entité `maps`, `map_id` sur zones/repères/tâches, switch de carte dans l’UI, création de zones/repères contextualisée, filtrage des tâches par carte (avec option toutes cartes) et route `GET /api/maps`.
- **Carte N3 réelle** : intégration du plan image `public/maps/plan n3.jpg` comme fond de la carte `N3`.
- **Import biodiversité (UI prof)** : ajout d’un bouton `Télécharger template complet` (toutes les colonnes `plants`) en complément du template vierge.
- **Template vierge téléchargeable (import biodiversité)** : ajout d’un bouton mode prof pour télécharger un CSV vierge prêt à remplir, plus le fichier `docs/templates/plants-import-template-vierge.csv`.
- **Import biodiversité (prof)** : ajout de la route `POST /api/plants/import` (CSV/XLSX/Google Sheet), stratégies `upsert_name|insert_only|replace_all`, mode prévisualisation (`dryRun`) et rapport d’erreurs ligne/champ.
- **Guide + templates d’import biodiversité** : ajout de `docs/IMPORT_BIODIVERSITE.md` et des fichiers `docs/templates/plants-import-template.csv` + `docs/templates/plants-import-template-minimal.csv`.
- **Migration 014 photos biodiversité (curation manuelle)** : ajout de `migrations/014_plants_manual_photo_links_curated.sql` avec un jeu de liens directs `Special:FilePath` sélectionnés manuellement pour `Menthe` et les espèces récemment corrigées, sans auto-résolution heuristique.
- **Corrections scientifiques ciblées `plants`** : ajout de `migrations/013_plants_scientific_fixes.sql` (températures invalides corrigées, noms scientifiques normalisés pour certaines espèces, fiche `Menthe` complétée).
- **Consolidation des sources biodiversité** : ajout du script `scripts/consolidate-plants-sources.js` (+ commandes `db:plants:sources:consolidate:dry` et `db:plants:sources:consolidate`) pour vérifier les liens `sources`, retirer les URLs injoignables et enrichir avec des références fiables (Wikipedia/Wikidata) cohérentes avec l’espèce.
- **Migration photo* direct-only** : ajout de `migrations/012_plants_photo_links_direct_only.sql` pour ne conserver en base que des URLs photo directes (`.jpg/.png/...` ou `Special:FilePath`) et neutraliser les liens non compatibles.
- **Résolution auto des photos biodiversité** : ajout du script `scripts/resolve-plants-photo-direct-links.js` (+ commandes `db:plants:photos:direct:dry` et `db:plants:photos:direct`) pour rechercher automatiquement des images Wikimedia cohérentes et remplacer les liens `photo*` non directs dans la table `plants`.
- **Migration plantes depuis Excel (data-only)** : ajout de `migrations/010_plants_excel_data_only.sql` pour synchroniser le référentiel biodiversité (mise à jour des plantes existantes par `name`, insertion des nouvelles entrées) sans modifier le schéma.
- **Déploiement serveur 100% automatisé (cron)** : ajout du script `scripts/auto-deploy-cron.sh` (fetch/pull conditionnel, redémarrage sécurisé via `DEPLOY_SECRET`, check post-déploiement, lock anti-concurrence) et documentation d’activation dans `docs/EXPLOITATION.md` avec exemple cron robuste (`mkdir -p logs` + chemin `scripts/` explicite).
- **Filtre Biodiversité par grand groupe** : ajout d’un sélecteur “Grand groupe” (champ `group_1`) dans les vues élève/prof, combinable avec la recherche texte.
- **Profil utilisateur enrichi** : ajout des champs `pseudo`, `email`, `description` avec édition côté élève, validations backend/frontend et visibilité publique limitée (`pseudo` + `description`).
- **Avatar élève** : avatar par défaut généré via DiceBear (seed pseudo/nom) et possibilité de photo de profil personnalisée (upload image `png/jpg/webp`, stockage disque sous `uploads/students`, option de retour au défaut DiceBear).
- **Scénario e2e retrait de tâche** : ajout de `e2e/tasks-unassign-flow.spec.js` pour couvrir le parcours élève “Je m’en occupe” -> “Me retirer”.
- **Scénarios e2e complets** : ajout de `e2e/tasks-full-cycle.spec.js` (création prof -> prise élève -> soumission -> validation prof) et `e2e/photos-upload-delete.spec.js` (upload/suppression photo de zone).
- **Couverture e2e renforcée** : ajout d’un scénario Playwright `teacher-auth-invalid-pin.spec.js` pour sécuriser le cas d’erreur PIN prof.
- **Tests UI smoke Playwright** : ajout de l’infrastructure e2e (`playwright.config.js`, `e2e/fixtures/auth.fixture.js`) et de 3 specs critiques (auth/navigation élève, carte prof, parcours tâches).
- **Modularisation frontend (stats/audit/about)** : nouveaux modules `src/components/stats-views.jsx`, `src/components/audit-views.jsx`, `src/components/about-views.jsx` avec imports dédiés dans `src/App.jsx`.
- **Modularisation frontend (carte complète)** : `src/components/map-views.jsx` devient le module réel du domaine carte (`MapView`, `ZoneInfoModal`, `ZoneDrawModal`, `MarkerModal`, `PhotoGallery`, `Lightbox`) avec imports mis à jour côté app.
- **Checklist UI post-modularisation** : ajout d’une section dédiée dans `docs/EXPLOITATION.md` pour valider rapidement les parcours prof/élève après découpage frontend.
- **Tests images observations** : nouveau fichier `tests/observations-images.test.js` couvrant la lecture d’image observation sur disque et le cas fichier manquant (`404`).
- **Migration SQL de retrait legacy** : nouvelle migration `migrations/006_drop_legacy_image_data.sql` pour supprimer `image_data` de `zone_photos` et `task_logs` après bascule complète.
- **Compatibilité outils post-bascule** : les scripts `image-migration-report` et `migrate-images-to-disk` détectent désormais l’absence des colonnes legacy et passent en mode no-op explicite.
- **Documentation d'exploitation production** : nouveau guide `docs/EXPLOITATION.md` avec checklist post-déploiement (`deploy:check:prod`), procédure lock o2switch et séquence complète de bascule images.
- **Modularisation frontend (tâches)** : nouveau module `src/components/tasks-views.jsx` pour isoler `TasksView`, `TaskFormModal`, `LogModal`, `TaskLogsViewer`, en conservant une façade de compatibilité via `src/components/foretmap-views.jsx`.
- **Façade carte dédiée** : ajout de `src/components/map-views.jsx` et adoption dans `src/App.jsx` pour préparer l'extraction progressive du domaine carte.
- **Déploiement prod sans arguments** : nouvelle commande `npm run deploy:check:prod` (base URL hardcodée sur `https://foretmap.olution.info`) pour les environnements qui ne permettent pas de passer `--base-url`.
- **Reporting migration images** : nouveau script `scripts/image-migration-report.js` + commande `db:migrate:images:report` pour mesurer les reliquats `image_data` avant la bascule finale.
- **Vérification post-déploiement** : script `scripts/post-deploy-check.js` + commande `npm run deploy:check` pour contrôler `/api/health`, `/api/health/db` et `/api/version` après publication.
- **Migration images progressive** : nouveau script `scripts/migrate-images-to-disk.js` + commandes `db:migrate:images:dry`, `db:migrate:images`, `db:migrate:images:clear` pour convertir `image_data` vers `image_path` sur `zone_photos` et `task_logs` sans rupture immédiate.
- **Tests script migration images** : `tests/images-migration-script.test.js` (parse des flags et génération des chemins cible).
- **Tests sécurité/admin/images** : nouveau fichier `tests/security-admin-images.test.js` couvrant les accès prof sans token/avec token invalide, la protection de `POST /api/admin/restart` et la rétrocompatibilité `image_data` pour les images legacy.
- **Préparation de déploiement** : script PowerShell `scripts/prepare-dist-deploy.ps1` pour automatiser install dépendances, build Vite et génération d’une archive ZIP prête à uploader (`deploy/`). Scripts npm associés : `deploy:prepare` et `deploy:prepare:fast`.
- **Frontend Vite** : application React dans `src/` (`App.jsx`, `components/foretmap-views.jsx`, `services/api.js`, `hooks/useForetmapRealtime.js`, `constants/`, `utils/`), entrée `index.vite.html` / `src/main.jsx`, styles `src/index.css` ; client Socket.IO via `socket.io-client` (devDependency npm, bundlé par Vite). Script `npm run dev:client` (Vite) ; proxy dev `/api` et `/socket.io` dans `vite.config.js`.
- **CI** : étape `npm run build` après les tests pour valider le bundle.
- **GET /api/admin/logs** : dernières lignes Pino via tampon mémoire (secret `DEPLOY_SECRET`, header `X-Deploy-Secret`) ; option `LOG_BUFFER_MAX_LINES` ; module [`lib/logBuffer.js`](lib/logBuffer.js). Doc [docs/API.md](docs/API.md), [README](README.md), [.env.example](.env.example). Tests dans `tests/api.test.js`.
- **Mode prof** : indicateur discret du temps réel (point coloré dans l’en-tête + infobulle : connecté, connexion, hors ligne, client absent).
- **Dependabot** : [`.github/dependabot.yml`](.github/dependabot.yml) (npm, hebdomadaire, regroupement patch/mineures, PR séparées pour les majeures) ; section *Dépendances npm* dans le [README](README.md).
- **Temps réel (Socket.IO)** : serveur HTTP + `socket.io` sur `/socket.io` ; événements `tasks:changed`, `students:changed`, `garden:changed` émis après les mutations concernées (tâches, auth inscription, élèves, zones/photos, plantes, marqueurs).
- **Frontend (comportement inchangé)** : après connexion élève, rafraîchissement ciblé des tâches / jardin (debounce) ; événement DOM `foretmap_realtime` pour recharger les stats prof ; reconnexion → `fetchAll()`. Polling ~30 s conservé en secours.
- **Tests** : `tests/realtime.test.js`.
- **Documentation** : section *Temps réel* dans [docs/API.md](docs/API.md).
- **Page À propos** : nouvel onglet (élève/prof) avec description de l'application, version affichée, mention de l'auteur, liens de documentation locaux (`/README.md`, `/CHANGELOG.md`, `/docs/*`) et lien global vers le dépôt GitHub.

### Modifié
- **Sécurité observations** : restriction de `GET /api/observations/student/:studentId` (prof ou élève concerné) et de `DELETE /api/observations/:id` (prof ou propriétaire) pour limiter l'IDOR et les suppressions non autorisées.
- **Suppression de zone** : purge explicite des fichiers photos associés avant suppression SQL afin d'éviter les fichiers orphelins sur disque.
- **Règle Cursor frontend** : `.cursor/rules/foretmap-frontend.mdc` alignée sur la stack réelle React + Vite (`src/`, `dist/`) pour éviter les corrections erronées de type legacy UMD.
- **Affichage carte responsive** : ajout d’un padding configurable par carte (`frame_padding_px` si fourni, sinon défaut par carte) pour mieux adapter le cadre d’affichage aux dimensions des plans, notamment N3.
- **Cartes multi-zones (correctif compatibilité)** : fallback robuste des fonds de carte côté frontend (ordre de secours N3/Forêt), normalisation des URLs `/api/maps` et migration `016_maps_image_urls_backfill.sql` pour éviter la disparition visuelle des zones en cas de déploiement partiel ou d’URL historique.
- **Mode prof biodiversité** : ajout d’un panneau d’import dans `PlantManager` pour charger un CSV/XLSX ou une URL Google Sheet avec choix de stratégie, prévisualisation et rapport détaillé.
- **Script résolution photos biodiversité** : remplacement des appels `fetch` (undici/Wasm) par `http/https` natif Node dans `scripts/resolve-plants-photo-direct-links.js` pour éviter les erreurs mémoire sur hébergement contraint (CloudLinux/LVE).
- **Biodiversité (liens photos stricts)** : validation backend renforcée sur `POST/PUT /api/plants` pour accepter uniquement des URLs d'image directes (et rejeter les pages/catégories), avec consigne explicite dans le formulaire prof.
- **Check post-déploiement (`deploy:check:prod`)** : ajout d’un `User-Agent` explicite et d’un retry léger sur HTTP `429` (respect de `Retry-After`) pour fiabiliser les vérifications derrière proxy/CDN.
- **Photos biodiversité (Wikimedia Category)** : résolution automatique côté frontend d’une image représentative pour les liens `commons.wikimedia.org/wiki/Category:...` (API Wikimedia), afin de réafficher des miniatures au lieu de simples liens.
- **Photos biodiversité (liens cassés)** : rendu frontend durci pour afficher en vignette uniquement les URLs d’images directes ; les pages (ex. Wikimedia `Category`) restent des liens cliquables pour éviter les miniatures cassées.
- **Nettoyage BDD photo*** : ajout de `migrations/011_plants_photo_links_cleanup.sql` (normalisation des champs photo, placeholders vides -> `NULL`, upgrade `http` -> `https`, conversion des liens Wikimedia `/wiki/File:` vers `/wiki/Special:FilePath/`).
- **Mise à jour automatique frontend** : service worker amélioré pour activer immédiatement une nouvelle version (`SKIP_WAITING`), vérifier les updates au retour onglet actif et recharger automatiquement quand le nouveau worker prend le contrôle.
- **Stratégie de cache HTML** : `/` et `/index.html` passent en `network-first` pour éviter de rester bloqué sur une ancienne interface quand le réseau est disponible.
- **Version affichée fiable** : route `GET /api/version` lit désormais `package.json` à chaque requête (fallback sécurisé sur la version de démarrage) pour refléter la version réellement déployée.
- **Retour utilisateur MAJ** : ajout d’un toast « Nouvelle version installée. » et d’un badge persistant `vX.Y.Z` dans l’en-tête.
- **Script auto-deploy cron** : ajout d’un garde-fou qui bloque le déploiement si des fichiers frontend (`src/`, Vite/public) changent sans mise à jour de `dist/` (build local obligatoire avant push).
- **Terminologie UI/docs** : renommage de l’onglet « Plantes » en « Biodiversité » et harmonisation des libellés vers « biodiversité » / « êtres vivants » selon le contexte (frontend, docs API/README, tests e2e).
- **Déploiement runtime local** : ajout d'un script `deploy:prepare:runtime` pour préparer un bundle complet (`dist` + `node_modules` prod) afin d'éviter les erreurs de build/install sur serveur (`vite` introuvable, locks panel).
- **Sécurité photos plantes** : validation backend des champs photo* avec rejet des URLs invalides et obligation HTTPS sur POST/PUT /api/plants.
- **Sécurité HTTP** : ajout d'une politique Content-Security-Policy côté serveur pour restreindre img-src aux sources sûres ('self', https:, data:, blob:).
- **Catalogue plantes (sources)** : le champ sources affiche désormais des noms de domaine cliquables (labels lisibles) au lieu des URLs brutes.
- **Catalogue plantes (photos)** : les champs URL photo (photo*) sont maintenant rendus en miniatures élégantes avec ouverture en lightbox au clic, au lieu de simples liens texte.
- **Durcissement Playwright** : configuration e2e stabilisée en CI (`workers=1`, `globalTimeout`, `forbidOnly`) et helpers de navigation/auth renforcés.
- **Diagnostic CI e2e** : dump explicite des logs serveur en cas d’échec dans `.github/workflows/ci.yml`.
- **CI** : le workflow `.github/workflows/ci.yml` exécute désormais les tests Playwright smoke après build, avec démarrage applicatif, attente santé et upload d’artefacts en cas d’échec.
- **Documentation d’exploitation/dev** : ajout des consignes d’exécution Playwright (`README.md`, `docs/LOCAL_DEV.md`, `docs/EXPLOITATION.md`) et mise à jour de l’état réel dans `docs/EVOLUTION.md`.
- **Script deploy check** : ajout de `--image-check-path` optionnel (200/404 acceptés, non bloquant) + test associé.
- **Allègement façade historique** : `src/components/foretmap-views.jsx` recentré sur les composants restants après extraction des vues stats/audit/about.
- **Skill évolution Cursor** : mise à jour de `.cursor/skills/foretmap-evolution/SKILL.md` pour refléter l’état actuel du projet.
- **Modularisation frontend** : `src/components/foretmap-views.jsx` est allégé en retirant les composants carte vers `src/components/map-views.jsx` tout en conservant le comportement existant.
- **Tests deploy check** : `tests/post-deploy-check-script.test.js` étendu avec scénarios HTTP réels (`requestJsonWithTimeout`, `checkEndpoint`).
- **Script deploy check** : `scripts/post-deploy-check.js` exporte désormais `requestJsonWithTimeout` et `checkEndpoint` pour améliorer la testabilité.
- **API/Frontend en mode disk-only** : suppression du fallback de lecture `image_data` pour les images zones et logs de tâches ; les endpoints image servent uniquement les fichiers `image_path` (ou 404).
- **Schéma de référence** : `sql/schema_foretmap.sql` aligné sur le mode disk-only (colonnes `image_data` retirées de `zone_photos`/`task_logs`).
- **Migration SQLite -> MySQL** : conversion des anciennes images base64 en fichiers disque lors de l’import, avec écriture de `image_path`.
- **Tests images** : fin des scénarios fallback legacy, remplacement par des scénarios disk-only (lecture fichier, fichier manquant, scripts post-retrait).
- **Flux image tâches** : `POST /api/tasks/:id/done` persiste désormais directement en mode disk-only (écriture fichier puis `image_path`), sans dépendance legacy `image_data`.
- **Couverture de tests migration images** : ajout de scénarios intégration pour fallback legacy `task_logs.image_data`, fichier manquant (`404`) et lecture disque après clear; extension des tests scripts `migrate-images-to-disk` et `image-migration-report` au-delà du simple parse des flags.
- **Documentation** : `README.md`, `docs/EVOLUTION.md` et `public/deploy-help.html` alignés avec la nouvelle doc d'exploitation et l'usage de `deploy:check:prod`.
- **Hotfix deploy check** : `scripts/post-deploy-check.js` n’utilise plus `fetch`/undici (Wasm) et passe en `http/https` natif pour éviter les erreurs mémoire sur certains environnements Node 22 contraints.
- **Checklist de bascule images** : ajout d’un flux recommandé (report -> dry-run -> migration -> clear) dans `README.md` et `docs/LOCAL_DEV.md`; avancement mis à jour dans `docs/EVOLUTION.md`.
- **Documentation déploiement** : ajout de l’étape de validation post-déploiement dans `README.md` et mise à jour de l’avancement dans `docs/EVOLUTION.md`.
- **Documentation migration images** : ajout des étapes de migration progressive dans `README.md`, `docs/LOCAL_DEV.md` et mise à jour de l’état d’avancement dans `docs/EVOLUTION.md`.
- **Plan d’évolution** : `docs/EVOLUTION.md` mis à jour selon l’état réel du code (réalisé / partiel / restant), avec backlog priorisé (quick wins, moyen terme, long terme) et nouvel ordre d’exécution.
- **Configuration production (hardening)** : mode professeur explicitement désactivé si `JWT_SECRET` est absent en production (`middleware/requireTeacher.js`, `routes/auth.js`) ; warnings additionnels sur `JWT_SECRET` et `DEPLOY_SECRET` au démarrage (`lib/env.js`).
- **Frontend** : extraction de `PinModal` et `AuthScreen` vers `src/components/auth-views.jsx` pour poursuivre la modularisation sans changement de comportement.
- **Outillage dev** : ajout du script `npm run dev:client` dans `package.json` pour aligner scripts et documentation.
- **Documentation config** : clarification des variables prod (`TEACHER_PIN`, `JWT_SECRET`, `FRONTEND_ORIGIN`, `DEPLOY_SECRET`) dans `README.md` et `.env.example`.
- **Bundle production (`dist/`)** : hotfix appliqué directement sur l’asset Vite versionné pour forcer le transport Socket.IO en `polling` côté client, afin d’éviter les erreurs WebSocket en hébergement sans build serveur (`npm` indisponible).
- **Temps réel (hotfix prod)** : transport Socket.IO client temporairement forcé en `polling` (au lieu de `websocket + polling`) pour contourner les erreurs WebSocket `reserved bits are on` observées derrière proxy/CDN. Ajout d'une checklist diagnostic et d'une procédure de retour arrière dans le [README](README.md).
- **Entrée SPA en production** : suppression du conflit `dist/index.html` (copie de `public/index.html`) vs entrée Vite. Le fallback Express sert désormais l’entrée Vite (`dist/index.vite.html`), et la page d’aide est déplacée dans `public/deploy-help.html`.
- **Déploiement Git (Option A)** : le dossier `dist/` est désormais versionné sur `main` (plus ignoré), afin que le cron serveur basé sur `git pull` puisse publier l’UI sans build côté hébergement.
- **Déploiement serveur (`deploy:prepare:fast`)** : si Vite est absent (devDependencies non installées), le script installe automatiquement les dépendances dev avant build pour éviter l’erreur `vite: commande introuvable` (code 127).
- **Script de déploiement** : remplacement de l’appel npm via PowerShell par un script Node.js portable (`scripts/prepare-dist-deploy.js`) compatible Linux (`sh`) et Windows.
- **Build frontend** : correction d’un doublon `compressImage` dans `src/components/foretmap-views.jsx` qui bloquait `vite build`.
- **Express** : en production (`NODE_ENV=production`) avec `dist/index.html` présent, fichiers statiques et fallback SPA depuis **`dist/`** ; sinon `public/` (page d’information si build absent).
- **`public/index.html`** : remplacé par une page courte expliquant la nécessité du build Vite (l’ancienne app monolithique + Babel a été migrée vers `src/`).
- **Modales (mode prof / tâches / stats)** : fond d’overlay opaque immédiat (plus d’animation transparent→noir ni `backdrop-filter` sur l’overlay) pour éviter un voile bloquant les clics ; `prefers-reduced-motion` force l’affichage des feuilles modales ; confirmations tâches/élève : clic réservé au fond + `stopPropagation` sur le panneau ; lightbox photo sans animation de fond. Carte prof : hauteur `100dvh - 56px` (sans réserver la barre élève).
- `lib/logger.js` : sortie Pino dupliquée vers stdout et tampon [`lib/logBuffer.js`](lib/logBuffer.js).
- `server.js` : création du serveur via `http.createServer(app)` pour attacher Socket.IO.
- **Page À propos** : correction des crédits avec l'auteur principal `Mohammed El Farrai` (majuscules respectées) et `oliviera999` mentionné comme contributeur.

---

## [1.2.0] - 2026-03-20

### Ajouté
- **Filtres/recherche tâches :** barre de filtres dans la vue tâches (recherche texte, filtre par zone, filtre par statut côté prof).
- **Échéances proches :** bannière d'urgence pour les élèves montrant les tâches dues dans les 3 prochains jours.
- **Progression visuelle élève :** barre de rang (Nouveau → Débutant → Actif → Expert) avec indicateur du prochain palier dans les statistiques élève.
- **Export CSV stats :** endpoint `GET /api/stats/export` (prof, JWT) ; bouton de téléchargement dans la vue stats prof.
- **Catalogue plantes élève :** composant `PlantViewer` (recherche, zones associées) + onglet « Plantes » dans la navigation élève.
- **Modération des logs :** endpoint `DELETE /api/tasks/:id/logs/:logId` (prof) ; bouton de suppression dans le visualiseur de rapports.
- **Carnet d'observation :** table `observation_logs`, route CRUD `routes/observations.js`, composant `ObservationNotebook` + onglet « Carnet » dans la navigation élève.
- **Tâches récurrentes :** champ `recurrence` sur la table `tasks` (migration 005), sélecteur dans le formulaire de tâche, chip dans les cartes de tâches.
- **Historique audit prof :** table `audit_log` (migration 004), route `routes/audit.js` avec `logAudit()`, enregistrement automatique des actions critiques (validation, suppression), onglet « Audit » dans la vue prof.
- **Tests nouvelles fonctionnalités :** `tests/new-features.test.js` (export CSV, modération logs, audit, observations).
- **Mode hors-ligne basique :** Service Worker (`public/sw.js`) avec cache network-first pour l'API et cache-first pour les assets statiques.
- Migrations versionnées : `003_observation_logs.sql`, `004_audit_log.sql`, `005_task_recurrence.sql`.
- Débogage : journalisation des erreurs 500 sur toutes les routes API (`lib/routeLog.js`), journalisation des étapes de migration SQL (`database.js`), scripts `npm run debug` / `debug:dev` (Node `--inspect`), configuration [`.vscode/launch.json`](.vscode/launch.json) (lancer le serveur, attacher, tests `node --test`), source maps sur le build Vite (`vite.config.js`). Documentation : `LOG_LEVEL` dans `.env.example`, sections débogage dans [README](README.md) et [docs/EVOLUTION.md](docs/EVOLUTION.md).
- Environnement local : `docker-compose.yml` (MySQL 8), `docker/mysql-init/` (bases `foretmap_local` + `foretmap_test`), `env.local.example`, scripts `docker:up` / `docker:down`, `test:local` (tests sur `foretmap_test`), doc [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md). Dépendance dev `cross-env`.
- Route `GET /api/health/db` (ping MySQL, 200 ou 503) pour le diagnostic en prod.
- Front : après 3 échecs serveur consécutifs (5xx / réseau), rafraîchissement espacé (2 min) + bandeau « Serveur indisponible » et bouton « Réessayer ».

### Modifié
- Navigation élève élargie : 4 onglets (Carte, Tâches, Plantes, Carnet) au lieu de 2.
- Navigation prof élargie : 5 onglets (Carte & Zones, Tâches, Plantes, Stats, Audit) au lieu de 4.
- Avertissements `lib/env.js`, `lib/uploads.js` et échec validation `.env` au démarrage : messages via Pino (`lib/logger.js`) au lieu de `console.*` ; frontend : erreurs API auparavant ignorées journalisées avec `console.error('[ForetMap] …')` ou toast (stats prof).
- Fallback SPA : chemin absolu `path.resolve`, logs enrichis (`resolvedPath`, `code`) si `index.html` introuvable.
- Version API : lecture de `package.json` via `path.join(__dirname, …)`.
- README : section *Débogage* (logs, inspect Node, bonnes pratiques front) ; procédure « Can't acquire lock » o2switch, racine d’app + variables BDD, section diagnostic `/api/health` vs `/api/health/db`.

### Déploiement
- **Requis avant redémarrage :** `npm run db:migrate` pour appliquer les migrations 003-005.

---

## [1.1.1] - 2026-03-18

### Ajouté
- Version de l’app en pied de page : `GET /api/version`, affichage sur l’écran de connexion et en bas de l’interface une fois connecté.
- Redémarrage déclenché après déploiement : `POST /api/admin/restart` (secret `DEPLOY_SECRET`, header `X-Deploy-Secret` ou body `secret`). Documentation dans README et `.env.example`.

---

## [1.1.0] - 2026-03-18

### Ajouté
- Auth professeur côté serveur : `POST /api/auth/teacher` (vérification PIN via `TEACHER_PIN`), JWT, middleware `requireTeacher` sur les routes sensibles (zones, plants, tasks, stats, students, map).
- CORS restreint en production via `FRONTEND_ORIGIN`.
- Découpage backend en routeurs : `routes/` (auth, zones, map, plants, tasks, stats, students), `middleware/requireTeacher.js`, `lib/helpers.js`.
- Images sur disque : `uploads/` (zones, task-logs), colonnes `image_path` en BDD, rétrocompat base64 ; `lib/uploads.js`.
- Migrations de schéma versionnées : table `schema_version`, dossier `migrations/` (001_schema_version, 002_image_path).
- Tests backend (Node `node:test` + supertest) : auth, statuts tâches (assign/unassign), suppression élève (cascade). Script `npm test`.
- Base Vite + React : `vite.config.js`, `index.html`, `src/main.jsx`, scripts `build` / `preview`.
- Validation des variables d’environnement au démarrage (`lib/env.js`), logging Pino (`lib/logger.js`), middleware d’erreur centralisé.
- CI GitHub Actions : `.github/workflows/ci.yml` (Node 20, MySQL 8, `npm ci` + `npm test`).
- Documentation API : `docs/API.md` (routes, codes d’erreur, note a11y).
- Script `npm run dev` avec nodemon.

### Modifié
- Frontend : plus de PIN en clair ; appel à `POST /api/auth/teacher`, token en `localStorage`, header `Authorization` sur les requêtes prof ; prise en charge `image_url` pour photos et logs.
- `.env.example` : `TEACHER_PIN`, `JWT_SECRET`, `FRONTEND_ORIGIN`.
- `.gitignore` : dossier `uploads/`.

---

## [1.0.1] - 2026-03-18

### Ajouté
- Routine de versionnage : CHANGELOG.md, docs/VERSIONING.md, scripts `bump:*` / `release:*`, règle Cursor.

---

## [1.0.0] - 2026-03-18

### Ajouté
- Version initiale documentée : application forêt comestible (zones, tâches, plantes, élèves, mode prof).
