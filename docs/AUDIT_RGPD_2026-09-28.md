# Audit RGPD — ForetMap, GL et Plan (28 septembre 2026)

> **Instantané daté** (convention : [`docs/audits/README.md`](audits/README.md)). Ne pas
> réécrire pour coller au code ultérieur ; marquer « Traité » + lien de lot sous chaque constat.
>
> **Périmètre** : code du dépôt à la date (branche `main`), base de données (schéma consolidé
> et migrations), front ForetMap / GL / Plan, scripts d'exploitation et documentation. **Hors
> périmètre** : configuration réelle du serveur o2switch (crontab installée, sauvegardes
> présentes), contrats avec les sous-traitants, registre de l'établissement — à vérifier sur
> le terrain (§ 11).
>
> **Avertissement** : cet audit est une analyse technique de conformité, pas un avis
> juridique. Le **responsable de traitement** est l'établissement (chef d'établissement) ; le
> **délégué à la protection des données (DPO)** académique doit valider le registre et
> l'analyse d'impact.

## 0. Synthèse

| Axe                                    | État               | Commentaire                                                                                                                                 |
| -------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Sécurité technique (art. 32)           | 🟢 Solide          | bcrypt 10, JWT courts et révocables, verrou par compte, EXIF retirés, SQL paramétré, cookies `HttpOnly`/`Secure`                            |
| Violation de données (art. 33-34)      | 🔴 **Ouvert**      | Dump de production (36 e-mails, 41 hachages bcrypt) toujours présent dans l'historique Git                                                  |
| Information des personnes (art. 12-14) | 🔴 Absente         | Aucune page confidentialité / mentions légales, aucun texte à l'inscription — public majoritairement **mineur**                             |
| Durées de conservation (art. 5-1-e)    | 🟠 Partielle       | Purge des journaux (365 j / 90 j) si la crontab tourne ; aucune purge des comptes, jetons expirés, journaux Moodle, fichiers orphelins      |
| Droits des personnes (art. 15-20)      | 🟠 Partiel         | Effacement par un admin (élève complet, prof / joueur GL incomplets) ; **aucun export**, aucune demande en libre-service                    |
| Minimisation / accès (art. 5-1-c, 25)  | 🟠 Fuites moyennes | Un élève voit les noms des inscrits de toutes les tâches et lit tous les journaux de tâche                                                  |
| Transferts hors UE (art. 44+)          | 🟠 À documenter    | Google Fonts et images Wikimedia chargées par le navigateur (IP des élèves vers les États-Unis) ; OpenAI / Trefle / Google OAuth optionnels |
| Traceurs (art. 82 loi I&L)             | 🟢 Conforme        | Aucun analytics, aucun cookie tiers ; cookies strictement nécessaires — **pas de bandeau requis**                                           |
| Registre / AIPD (art. 30, 35)          | ⚪ Non vérifiable  | Rien dans le dépôt ; une AIPD est recommandée (mineurs, suivi d'activité, photos)                                                           |

**Trois actions prioritaires** : (1) traiter l'incident du dump Git (§ 9-R1) ; (2) publier
une notice d'information et la lier depuis l'inscription et le pied de page (§ 9-R2) ;
(3) poser une politique de conservation outillée — fin d'année scolaire, jetons, fichiers
(§ 9-R3).

## 1. Traitements et personnes concernées

| Traitement                            | Finalité                                                                   | Personnes                                      | Base légale probable                                 |
| ------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Comptes ForetMap (élèves, profs)      | Activité pédagogique forêt comestible : tâches, observations, carnet, quiz | Élèves (majorité **mineurs**), enseignants     | Mission d'intérêt public (art. 6-1-e) — enseignement |
| GL (Gnomes & Licornes)                | Jeu pédagogique : parties, marché, sorts, forum, journal                   | Élèves joueurs, MJ                             | Idem                                                 |
| Plan Lyautey                          | Plan interactif de l'établissement                                         | Visiteurs anonymes, personnel (accès par code) | Idem ; pas de compte visiteur                        |
| Synchronisation Moodle / LTI / Google | Création et appariement de comptes                                         | Élèves, enseignants                            | Idem                                                 |
| Journaux de sécurité et d'activité    | Sécurité, traçabilité, diagnostic                                          | Tous les comptes                               | Intérêt légitime / obligation de sécurité (art. 32)  |
| Compteur d'usage                      | Statistiques agrégées                                                      | Visiteurs                                      | Anonyme — hors RGPD                                  |

Aucune donnée « sensible » au sens de l'art. 9 n'est collectée par conception. Les **champs
libres** (forum, commentaires, journaux, descriptions, messages du marché GL, motifs de
signalement) peuvent en recevoir de fait : c'est un risque de modération, pas de conception.

## 2. Inventaire des données (résumé)

Environ **50 tables** portent des données personnelles. Principales familles :

- **Identité et authentification** : `users` (e-mail, pseudo, prénom, nom, description,
  avatar, hachage, `google_sub`, `last_seen`), `gl_players`, `gl_admins`, `user_roles`,
  `group_members`, `password_reset_tokens`, `external_identities`.
- **Moodle** : `sync_pending_matches.external_snapshot_json` (fiche Moodle complète),
  `sync_actions.before_json/after_json`, `sync_runs.report_json`.
- **Journaux et présence** : `security_events` (**IP complète + user-agent**), `audit_log`,
  `user_activity_events`, `user_product_visits`, `notifications`.
- **Contenus libres et photos** : forum et commentaires (ForetMap et GL), `task_logs`,
  `species_observations` (+ photos), journaux utilisateur et joueur, messages du marché GL.
- **Noms recopiés hors de `users`** : `task_assignments` / `task_logs`
  (`student_first_name`, `student_last_name`), `gl_player_feuillet_states.discovered_by_name`,
  texte des notifications, `audit_log.details`.
- **Géolocalisation** : calculée dans le navigateur, **jamais envoyée ni stockée**
  (`src/shared/platform/useGeolocation.js`). Seuls les points de calage du plan sont stockés.
- **Invités GL** : aucune ligne en base (identifiant `guest-<uuid>` dans le jeton).

## 3. Information des personnes (art. 12-14)

- **Constat I1 — 🔴 aucune notice.** Aucune page « confidentialité », « mentions légales »,
  « données personnelles », CGU ; aucune mention dans `src/`, `public/`, les HTML d'entrée ou
  `docs/reference/`.
- **Constat I2 — 🔴 inscription muette.** Le formulaire d'inscription
  (`src/components/auth-views.jsx`, ~l. 331-400) collecte code de classe, pseudo, e-mail et
  description sans aucun texte d'information (responsable, finalités, durée, droits,
  contact). Pour un public mineur, l'information doit être **claire et adaptée à l'âge**
  (art. 12-1, considérant 58).
- **Constat I3 — 🟠 documentation fonctionnelle.** `docs/reference/` décrit la suppression par
  un administrateur mais ni les durées de conservation ni la façon d'exercer ses droits.

## 4. Durées de conservation (art. 5-1-e)

| Donnée                                                                                        | Mécanisme                                                                        | Durée                                         | Constat                                                                                          |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `security_events`, `audit_log`                                                                | `scripts/purge-audit-logs.js --apply` (crontab ligne 5)                          | 365 j                                         | 🟠 Dépend de la crontab, documentée « à installer » (`docs/CRONTAB.md`) : **à vérifier en prod** |
| `user_activity_events`                                                                        | même script                                                                      | 90 j                                          | idem                                                                                             |
| Événements de jeu GL                                                                          | même script                                                                      | 365 j                                         | idem                                                                                             |
| Notifications                                                                                 | tâche quotidienne Node                                                           | 60 j                                          | 🟢                                                                                               |
| `visit_seen_anonymous`, `lti_nonces`                                                          | purge au fil de l'eau                                                            | 1 j / expiration                              | 🟢                                                                                               |
| Sauvegardes BDD                                                                               | `scripts/db-backup.sh`                                                           | 14 j                                          | 🟠 Non chiffrées, même serveur (§ 6)                                                             |
| JWT                                                                                           | réglage                                                                          | 1 h 30, glissant ≤ 12 h (max. réglable 30 j)  | 🟢                                                                                               |
| `password_reset_tokens`                                                                       | expiration 60 min                                                                | **jamais purgés**                             | 🟠 R3                                                                                            |
| `sync_runs`, `sync_actions`, `sync_pending_matches`, `elevation_audit`, `external_identities` | —                                                                                | **illimitée**                                 | 🟠 R3                                                                                            |
| Comptes (`users`, `gl_players`)                                                               | —                                                                                | **illimitée** ; Moodle ne fait que désactiver | 🔴 R3 — aucun cycle « fin d'année scolaire »                                                     |
| Fichiers `uploads/` orphelins                                                                 | `scripts/reconcile-orphan-uploads.js` manuel, hors crontab, 4 dossiers seulement | **illimitée**                                 | 🟠 R3                                                                                            |
| Logs Pino / cron / Passenger                                                                  | sortie standard, pas de rotation par l'app                                       | selon hébergeur                               | 🟡 à documenter                                                                                  |

Écarts de documentation : `docs/EXPLOITATION.md` dit encore les événements de jeu GL hors
purge ; le tableau de `docs/CRONTAB.md` ne liste que 4 des 8 tables purgées.

## 5. Droits des personnes (art. 15-21)

| Droit                            | État      | Détail                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accès / portabilité (15, 20)     | 🔴 Absent | Aucun export JSON/CSV, ni libre-service ni admin. Seules des lectures partielles (`GET /api/auth/me`, fiche admin)                                                                                                                                                                                                           |
| Rectification (16)               | 🟢 / 🟠   | L'élève modifie pseudo, e-mail, description, avatar ; **pas ses prénom / nom** (admin seulement — acceptable si l'annuaire fait foi)                                                                                                                                                                                         |
| Effacement — élève (17)          | 🟢 / 🟠   | `DELETE /api/students/:id` : suppression définitive orchestrée (`lib/studentDeletion.js`, registre de nettoyage). **Reste** : nom dans `audit_log.details`, IP/UA dans `security_events`, images du forum / commentaires (dossiers **publics**), pièces jointes `user-journal/` et `task-logs/` sur disque, sauvegardes 14 j |
| Effacement — enseignant          | 🟠        | `DELETE /api/rbac/users/teacher/:id` : compte et jetons seulement ; contenus conservés (clés à NULL), avatar laissé sur disque, **e-mail recopié dans l'audit**                                                                                                                                                              |
| Effacement — joueur GL           | 🟠        | `DELETE /api/gl/admin/players/:id` : forum / commentaires GL non purgés (auteur polymorphe), fichiers journal et avatar laissés ; **409** si contribution à un sortilège (FK `RESTRICT`) — l'historique de jeu bloque l'effacement                                                                                           |
| Effacement en libre-service      | 🔴 Absent | Aucune demande ni bouton ; le circuit passe forcément par un admin (acceptable si **documenté** dans la notice)                                                                                                                                                                                                              |
| Opposition / limitation (18, 21) | ⚪        | Base légale « mission publique » : opposition possible mais encadrée ; aucun circuit prévu                                                                                                                                                                                                                                   |

## 6. Sécurité (art. 32)

**Acquis** : bcrypt 10 (ré-hachage `$2a$`), PIN supprimé (410), secret JWT obligatoire en prod,
révocation par `token_epoch`, compte désactivé revérifié à chaque requête, verrou par compte
après 5 échecs + rate limit IP, réponse identique compte existant ou non, aucun compte semé
par défaut, SQL paramétré, `helmet` (HSTS, nosniff, frameguard, referrer-policy), cookies
`HttpOnly` / `SameSite` / `Secure`, EXIF/GPS retirés (`lib/imageMetadata.js`), dossiers
`observations/`, `task-logs/`, `user-journal/` privés, IP tronquée dans les logs du limiteur,
masquage Pino des mots de passe et jetons, fixture anonymisé vérifié en CI.

| #    | Constat                                                                                                                                                                                                                                                                  | Gravité                               | Référence                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------- |
| S-1  | **Dump de production dans l'historique Git** : `sql/foretmap_bdd_complete.sql`, ajouté en `6b11e9fe4`, retiré en `7167ac0e2`, toujours récupérable (36 e-mails, 41 hachages bcrypt). Déjà signalé en [`AUDIT_SECURITE_2026-09-22.md`](AUDIT_SECURITE_2026-09-22.md) § 12 | 🔴 Critique                           | vérifié le 28/09 (`git log --all -- sql/foretmap_bdd_complete.sql`) |
| S-2  | Un élève non visiteur reçoit prénom + nom de **tous** les inscrits des tâches listées, sans filtre de groupe                                                                                                                                                             | 🟠 Moyen                              | `routes/tasks.js` l. 182-188                                        |
| S-3  | Tout compte connecté non visiteur lit les journaux (noms, commentaires, photos) de **n'importe quelle** tâche ; identifiants séquentiels, pas de contrôle de visibilité                                                                                                  | 🟠 Moyen                              | `routes/tasks/logs.js` l. 22-73                                     |
| S-4  | Profil `prof` : `stats.read.all` + `stats.export` — lit tous les élèves quel que soit son groupe ; à justifier (minimisation)                                                                                                                                            | 🟠 Moyen                              | `lib/rbac.js` ~l. 300-306                                           |
| S-5  | JWT et identité (e-mail, nom) en clair dans `localStorage` (`foretmap_session`, `gl_session`…) alors que la CSP n'est qu'en **Report-Only** (seul `img-src` est imposé) : aucun rempart contre un XSS                                                                    | 🟠 Moyen                              | `src/services/api.js` ; `lib/csp.js`                                |
| S-6  | `/uploads` public hors 3 dossiers : avatars d'élèves, photos de tâches, forum, commentaires ; `gl-player-journal/` n'est **pas** privé                                                                                                                                   | 🟠 Moyen                              | `lib/uploadsPrivatePaths.js`                                        |
| S-7  | Sauvegardes quotidiennes **non chiffrées**, sur le **même serveur**, sans `uploads/` ni copie hors site                                                                                                                                                                  | 🟠 Moyen                              | `scripts/db-backup.sh`                                              |
| S-8  | Files hors ligne (`foretmap_task_done_queue` avec nom, observations, brouillons) et cache d'images PWA **non vidés** à la déconnexion — tablette partagée                                                                                                                | 🟠 Moyen                              | `src/services/api.js` l. 302-309 ; `swTemplate.js`                  |
| S-9  | Mot de passe élève : 4 caractères minimum par défaut                                                                                                                                                                                                                     | 🟡 Faible / moyen                     | `lib/settings/identity.js`                                          |
| S-10 | Retrait EXIF : l'original est écrit tel quel si `sharp` est absent ou échoue ; médiathèque et packs mascottes GL contournent le retrait (personnel seulement)                                                                                                            | 🟡 Faible                             | `lib/uploads.js` ; `lib/mediaLibrary.js`                            |
| S-11 | Masquage Pino incomplet (`currentPassword`, `newPassword`, `resetToken`, code plan…) et un seul niveau d'imbrication ; `err` MySQL journalisé tel quel (peut contenir des valeurs)                                                                                       | 🟡 Faible                             | `lib/logger.js` ; `lib/routeLog.js`                                 |
| S-12 | Import par URL (Google Sheets) : `http:` accepté, pas de filtre d'adresse interne (SSRF)                                                                                                                                                                                 | 🟡 Faible                             | `lib/biodiv/speciesService.js` ~l. 358-396                          |
| S-13 | Import de joueurs GL : mots de passe renvoyés en clair une fois dans le rapport                                                                                                                                                                                          | 🟡 Faible (usage attendu, à encadrer) | `docs/API.md`                                                       |
| S-14 | `.cursorignore` ne couvre ni `*.sql` bruts ni `ci-job-*-logs.zip` ; `Datas Sources/` contient des comptes rendus nominatifs d'adultes (métadonnées bureautiques non contrôlées)                                                                                          | 🟡 Faible                             | `.cursorignore`                                                     |

## 7. Sous-traitants et transferts hors UE (art. 28, 44+)

| Destinataire                                             | Déclencheur                                                                | Données                                                         | Localisation              | Constat                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------- | ------------------------------------------------- |
| **o2switch** (+ frontal Tiger Protect)                   | Hébergement                                                                | Tout                                                            | France                    | 🟢 Contrat d'hébergement à référencer au registre |
| **Google Fonts**                                         | Chaque page (`index.vite.html`, `gl.html`, `plan.html`, polices de marque) | **IP + user-agent de chaque visiteur**                          | États-Unis                | 🔴 Transfert non nécessaire ; auto-héberger       |
| **Wikimedia** (images, API Commons depuis le navigateur) | Fiches espèces                                                             | IP des élèves                                                   | États-Unis                | 🟠 Mettre en cache / relayer côté serveur         |
| Google OAuth                                             | Connexion Google (optionnelle)                                             | E-mail, nom                                                     | États-Unis (DPF)          | 🟠 Registre ; cadre UE–US                         |
| OpenAI, Trefle                                           | Pré-saisie espèces (désactivée par défaut)                                 | Noms d'espèces, pas de donnée élève                             | États-Unis                | 🟢 Pas de donnée personnelle                      |
| Pl@ntNet                                                 | Identification par photo (désactivée par défaut, `plants.manage`)          | Photos de plantes du personnel (EXIF retirés par le navigateur) | France                    | 🟢                                                |
| GBIF, iNaturalist, Catalogue of Life, Wikipedia          | Pré-saisie serveur                                                         | Noms d'espèces                                                  | UE / États-Unis           | 🟢 Pas de donnée personnelle                      |
| Moodle / LTI (`olution.info`)                            | Sync annuaire                                                              | Identité élèves                                                 | Même hébergement probable | 🟢 Registre                                       |
| SMTP                                                     | Réinitialisation mot de passe, alertes                                     | E-mail, nom                                                     | Selon `SMTP_HOST`         | ⚪ À préciser                                     |
| **GitHub** (CI, dépôt)                                   | Développement                                                              | Aucune donnée réelle attendue… **sauf S-1**                     | États-Unis                | 🔴 lié à S-1 ; vérifier la visibilité du dépôt    |
| Outils IA de développement (Cursor, MCP de diagnostic)   | Lecture des logs prod via `docs/MCP_FORETMAP_CURSOR.md`                    | Logs (e-mails / noms possibles)                                 | États-Unis                | 🟠 Limiter aux logs masqués, documenter           |

## 8. Traceurs (art. 82 loi Informatique et Libertés)

Tous les cookies sont **strictement nécessaires** (OAuth/LTI 10 min, `anon_visit_token`
24 h signé, `plan_access` 30 j, `staff_plan_access` 7 j). Le compteur d'usage est anonyme et
sans cookie. Aucun analytics, aucune publicité : **aucun bandeau de consentement n'est
requis**. La notice (R2) doit toutefois lister ces cookies et le stockage local.

## 9. Recommandations

### R1 — 🔴 Incident « dump dans l'historique Git » (art. 33-34)

1. Évaluer la visibilité du dépôt et des forks / clones (GitHub, postes, CI) ; si le dépôt a été
   public ou partagé, **notifier la CNIL sous 72 h** via le DPO (hachages bcrypt : risque réel
   mais atténué ; e-mails : risque d'hameçonnage ciblé).
2. Réécrire l'historique (`git filter-repo --path sql/foretmap_bdd_complete.sql --invert-paths`),
   pousser en force **après coordination** (toutes les branches, tags, PR ouvertes), demander
   à GitHub la purge des caches / vues de commit.
3. Forcer la réinitialisation des mots de passe des comptes présents dans le dump
   (incrément de `token_epoch` + `password_must_reset`).
4. Consigner l'incident au **registre des violations** (même sans notification).

### R2 — 🔴 Notice d'information et mentions légales

- Page publique « Données personnelles » par produit (ForetMap, GL, Plan), rédigée en deux
  niveaux : version courte adaptée aux élèves, version complète (responsable, DPO, finalités,
  base légale, catégories, destinataires, sous-traitants, transferts, durées, droits, contact,
  réclamation CNIL). Noms affichés via `lib/brand.js` (marque jamais en dur).
- Lien depuis le formulaire d'inscription, l'écran de connexion et le pied de page / menu.
- Section « Vos données » dans `docs/reference/foretmap/` et `docs/reference/gl/`.

### R3 — 🟠 Politique de conservation outillée

- Purge **fin d'année scolaire** : comptes désactivés depuis N mois (Moodle compris) →
  suppression via le registre de nettoyage existant, puis rapport.
- Ajouter à `purge-audit-logs.js` : `password_reset_tokens` expirés/utilisés, `sync_*`
  (ex. 1 an), `elevation_audit`, `external_identities` orphelines.
- Anonymiser `security_events.ip_address` au-delà de 6 mois (tronquer) — recommandation CNIL
  sur les journaux : 6 mois à 1 an.
- Mettre `reconcile-orphan-uploads.js` en crontab et l'étendre à tous les dossiers d'upload.
- **Vérifier** la ligne 5 de la crontab en production ; aligner `EXPLOITATION.md` / `CRONTAB.md`.

### R4 — 🟠 Droits des personnes

- Export « Mes données » (JSON) en libre-service ou, a minima, export admin par compte
  (identité, tâches, observations, journaux, forum, quiz, GL).
- Compléter l'effacement : enseignant (contenus → auteur « compte supprimé », avatar),
  joueur GL (forum / commentaires GL, fichiers), fichiers `forum-posts/`,
  `context-comments/`, `user-journal/`, `task-logs/` ; ne plus recopier nom / e-mail dans
  `audit_log.details` (identifiant seul) ; remplacer le `RESTRICT` des contributions de sort
  par une anonymisation.

### R5 — 🟠 Minimisation et accès

- S-2 / S-3 : filtrer par groupe (réutiliser `getScopedStudentIds`) ou par visibilité de la
  tâche ; tests `tests/*.test.js` d'accès croisé entre deux groupes.
- S-4 : décider si `prof` garde `stats.read.all` (documenter la justification) ou passe en
  `stats.read.group`.
- S-6 : rendre privés `students/` (avatars), `gl-player-journal/`, `forum-posts/`,
  `context-comments/`, `tasks/` ou servir par route authentifiée.
- S-8 : vider files hors ligne et cache d'images à la déconnexion.

### R6 — 🟠 Transferts et sécurité complémentaire

- Auto-héberger les polices (fichiers `woff2` dans `public/`) ; retirer `fonts.googleapis.com`
  de la CSP ; proxifier ou mettre en cache les images Wikimedia.
- Passer la CSP en mode bloquant (au moins `script-src 'self'`), puis envisager le JWT en
  cookie `HttpOnly`.
- Chiffrer les sauvegardes (`gpg`/`age`) et en exporter une copie hors site ; inclure
  `uploads/`.
- S-9 à S-14 : lots de durcissement faibles.

### R7 — ⚪ Documentation de conformité (hors code)

- Fiche(s) au **registre des traitements** de l'établissement (ForetMap, GL, Plan).
- **AIPD** recommandée : public mineur, suivi d'activité et de présence, photos, échanges
  entre élèves (critères CNIL « personnes vulnérables » + « surveillance systématique »).
- Liste des sous-traitants et clauses (o2switch, Google, SMTP, GitHub).
- Procédure écrite d'exercice des droits et de gestion des violations.

## 10. Plan de lots proposé

| Lot    | Contenu                                                            | Effort             | Priorité    |
| ------ | ------------------------------------------------------------------ | ------------------ | ----------- |
| RGPD-A | R1 incident dump (hors code + réinit. mots de passe)               | ½ j + coordination | 🔴 Immédiat |
| RGPD-B | R2 notice + liens inscription / pied de page + `docs/reference`    | 1 j                | 🔴          |
| RGPD-C | S-2, S-3 filtrage par groupe + tests                               | ½ j                | 🟠          |
| RGPD-D | R6 polices auto-hébergées + images Wikimedia + CSP bloquante       | 1-2 j              | 🟠          |
| RGPD-E | R3 purges (jetons, sync, IP, orphelins, fin d'année) + crontab     | 1-2 j              | 🟠          |
| RGPD-F | R4 export « Mes données » + effacement complété                    | 2-3 j              | 🟠          |
| RGPD-G | S-6, S-8, S-7 (uploads privés, déconnexion, sauvegardes chiffrées) | 1-2 j              | 🟠          |
| RGPD-H | S-9 à S-14 durcissements faibles                                   | 1 j                | 🟡          |

## 11. À vérifier sur le terrain

- Crontab de production : présence et succès de la ligne 5 (purge) et des sauvegardes.
- Visibilité du dépôt GitHub (public / privé) et liste des personnes ayant eu accès.
- Présence de `sharp` sur le serveur (sinon EXIF non retirés).
- Existence d'une fiche au registre et d'une AIPD auprès du DPO académique.
- Hébergeur SMTP effectivement configuré.

## 12. Suivi des traitements

Les constats ci-dessus restent tels qu'observés le 28/09 ; cette section note leur
traitement, lot par lot (entrées détaillées dans `CHANGELOG.md`, `[Non publié]`).

| Constat                                 | Statut                                                                                         | Lot / preuve                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1                                     | **Traité** côté dépôt (reste : support GitHub, serveur, mots de passe)                         | Historique réécrit (`git filter-repo --invert-paths`), `main` et tags repoussés, autres branches distantes supprimées. Restent hors code : purge des `refs/pull/*` et vues en cache par le support GitHub, réalignement du clone de production, réinitialisation des mots de passe des comptes du dump, inscription au registre des violations                                                                                                                          |
| S-2                                     | **Traité**                                                                                     | Réglage admin `tasks.assignees_visibility` (`group` par défaut, `all`, `self`) — `lib/tasks/assignmentVisibility.js` ; `tests/tasks-group-visibility.test.js`                                                                                                                                                                                                                                                                                                           |
| S-3                                     | **Traité**                                                                                     | Réglage admin `tasks.logs_visibility` (`group` par défaut, `assignees`, `all`) appliqué à la liste et aux photos des journaux ; mêmes tests                                                                                                                                                                                                                                                                                                                             |
| §5 Accès/portabilité                    | **Traité**                                                                                     | Export ZIP `GET /api/auth/me/export`, `GET /api/gl/auth/me/export`, export admin `GET /api/rbac/users/:userType/:userId/export` (permission `admin.users.export`) — `lib/accounts/exportRegistry.js` ; `tests/personal-data-export.test.js`                                                                                                                                                                                                                             |
| §7 Transferts (Google Fonts, Wikimedia) | **Traité** (réglable)                                                                          | Réglage `privacy.external_assets_mode` (`local` par défaut) : polices Fontsource embarquées, relais `GET /api/media/remote` + cache pour Wikimedia, fiches tutoriels sans Google, CSP candidate sans domaines Google en mode local — `tests/remote-media.test.js`, `tests-ui/shared/externalAssets.test.js`. Restent documentés au registre : OpenAI / Trefle / Google OAuth (optionnels, côté serveur ou choix de l'utilisateur)                                       |
| S-5                                     | **Traité** (atténué : le jeton reste dans `localStorage`, choix du 28/09 sans cookie HttpOnly) | CSP complète **imposée** sur ForetMap, G&L et les plans (`lib/csp.js` : `script-src 'self' 'wasm-unsafe-eval'`, empreinte sha256 pour la vue tutoriel, variante intro G&L) ; script de marque inline retiré du build ; service worker limité au même domaine ; clé de session unique `foretmap_session` (anciennes clés migrées puis effacées, plus de `authToken` dans la fiche stockée) — `tests/csp.test.js`, `tests-ui/api.test.js`, `e2e/rgpd-session-csp.spec.js` |
| S-8                                     | **Traité** (réglable)                                                                          | Réglage `privacy.clear_local_data_on_logout` (vrai par défaut) : files hors ligne du compte, progression de visite, séance pédagogique et photos `/uploads/` du service worker effacées à la déconnexion, confirmation s'il reste des actions non envoyées — `src/utils/localDataCleanup.js` ; `tests-ui/utils/localDataCleanup.test.js`, `e2e/rgpd-session-csp.spec.js`                                                                                                |
| S-7                                     | **Traité** pour le chiffrement (restent : copie hors site, `uploads/`)                         | `scripts/db-backup.sh` chiffre en flux (`openssl enc -aes-256-cbc -pbkdf2 -iter 200000`, `.sql.gz.enc`) avec `BACKUP_ENCRYPT_KEY_FILE`, vérifie par déchiffrement, `BACKUP_ENCRYPT_REQUIRED=1` interdit le clair ; `scripts/db-restore.sh`, `scripts/encrypt-existing-backups.sh`, `scripts/lib/backup-crypto.sh` — `tests/backup-encryption.test.js`. Clé à générer sur le serveur et à copier hors serveur (`docs/EXPLOITATION.md`)                                   |
| R3 (conservation)                       | Hors périmètre de ce chantier (décision du 28/09)                                              | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
