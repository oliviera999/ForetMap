# Gnomes & Licornes — « Tenir à deux » v2 (dossier technique)

Mouture pédagogique coopérative de G&L : quatre équipes (deux gnomes, deux licornes), un tour à
phases projeté, des pages cachées à fouiller puis à **tenir à deux** (l'autre peuple répond à la
question de lecture), un voile qui avance, deux monnaies privées, un grimoire exécuté par le
serveur. Les **règles de référence** sont dans [`GL_TENIR_A_DEUX_REGLES.md`](GL_TENIR_A_DEUX_REGLES.md)
(versées telles quelles) ; la doc non technique pour le prof est dans `docs/reference/gl/`.

## Garde-fous (spec § 2) — tenus par le code et par les tests

- Le Souffle n'est **jamais personnifié** : un voile (`gl_game_tenir_state.voile_position`), des
  pages qui pâlissent. Aucune ressource n'est retirée par le voile.
- L'oiseau témoin est **muet et sans nom** côté élève (`GLKraaWitness`, `aria-hidden`, aucun
  texte) ; l'identifiant technique `kraa` est toléré dans le code et les payloads.
- **L'erreur ne punit jamais** : une mauvaise réponse révèle (`revelee`) ou se repose ; retour
  « Pas encore… » (`lib/glChasse.js › pasEncore`, `routes/gl/games/qcm.js › tenirFeedback`).
- **Aucune ressource** pour une bonne réponse de case, une lecture, une arrivée, une fouille, un
  badge, un honneur (`tests/gl-tenir-economie-globale.test.js`). Les ressources viennent des pages
  tenues, de la Trame, du carnet complet, du Marché ; elles partent par les sorts, les échanges,
  les dons, les cases Souffle, le chapardeur.
- **Bourses privées** : un élève voit la sienne et celles de son équipe, le prof tout, une
  projection rien (`lib/glTenirView.js › filterBoursesForViewer`, journal expurgé par
  `redactGameEventsForViewer` : payload `private: true` + `publicKeys`).
- **Aucun classement d'élèves** ; aucune donnée nominative dans les logs ni les tests (fixtures
  `joueur-a-<stamp>`).
- Chaînes interdites côté élève (`monstre, ennemi, attaque, poursui, corbeau, Krâ, Kraa, Grise,
faux, raté, perdu, classement`) : `lib/glTenirImport.js › findForbiddenString` à l'import,
  `tests-ui/gl/tenir-chaines-interdites.test.jsx` au rendu.
- Isolement GL/ForetMap intact : `/api/gl/*`, `src/gl/`, `lib/gl*`, tables `gl_*`.

## Mode « tenir » d'une partie

`isTenirGame(settings, game)` = réglage `gameplay.tenir_enabled` **et** `gl_games.tenir_profil`
non nul (`complet` | `prologue`). Une partie créée avec le réglage actif reçoit `complet` ;
`PUT /tenir/profil` change le profil et pose des surcharges (`tenir_overrides_json`, clés
`OVERRIDABLE_KEYS` de `lib/glTenir.js`). Résolution : défauts ← `gl_settings` ← écarts du profil
← surcharges (`resolveTenirSettings`). Surface (`tableau` | `hybride` | `tablette`) et mode de
dés par surface (`resolveSurface`, `resolveDesMode`). Au passage `draft → live`, le chemin
numéroté est imposé, l'état de partie créé (chapardeur tiré entre les tours 2 et 4), les pages de
chasse initialisées, les Héritages de la classe versés.

## Tables (migrations 330 → 335)

| Migration | Tables / colonnes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 330       | réglages `gameplay.tenir_*` ; `gl_games.tenir_profil/tenir_overrides_json/tenir_surface/projection_token_hash` ; `gl_game_tenir_state`, `gl_game_tenir_effets` ; catalogues `gl_chasse_zones`, `gl_tenir_questions_lecture`, `gl_tenir_peripeties`, `gl_tenir_missions`, `gl_tenir_titres`, `gl_tenir_badges`, `gl_tenir_olu_lignes`, `gl_tenir_parures`, `gl_tenir_passeur_pages` ; Marché `gl_market_annonces`, `gl_market_dons`, `gl_game_parures`, `gl_game_retraits` ; `gl_spells` v2 (`famille, peuple, cout, ressource, fenetre, limite_json, execution, effet_auto_json, tenir_v2`) ; brouillons de sort (`cast_round_number, effect_params_json, partner_team_id, player_id, ressource_choisie`) |
| 331       | `gl_game_rounds` à phases (`ouverture → jeu → souffle → clos`, ordre, équipe active, vent, souffle, passeur, erreur d'Olu, opérateurs) ; `gl_game_round_absences`, `gl_game_des_saisies`, `gl_game_team_spirit`, `gl_game_lumiere`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 332       | `gl_game_chasse_pages` (`endormie → revelee → trouvee → tenue`, `palie → reparee`, pâlissement par équipe), `gl_game_chasse_ouvertures`, `gl_game_chasse_empreintes`, `gl_game_chasse_pistes`, `gl_game_chasse_questions_vues`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 333       | semis du grimoire v2 (25 sorts, ouvertures cumulatives par plateau) ; `gl_game_honneurs`, `gl_player_titres`, `gl_player_badges`, `gl_game_missions`, `gl_game_chimeres`, `gl_game_heritages`, `gl_voyageur_plumes` ; `gl_voyageur_spell_uses.last_used_game_id`                                                                                                                                                                                                                                                                                                                                                                                                                                          |

| 334 | `gl_chasse_zones.especes_json` (pistes de veillée), `gl_tenir_olu_lignes.plateaux_json` (erreur du jour par plateau), `gl_game_rounds.dernier_jet_json` (fenêtre « après le jet »), `gl_resource_ledger` (grand livre des bourses), empreintes `content.tenir_catalogues_hash` |
| 335 | contenu : descriptions des neuf cases de déplacement des plateaux 1-4 (gardées par l'ancien texte), case 217 → `order_index` 355 |

Le chargeur `npm run gl:import:tenir -- --fichier tous|<nom> [--dry-run] [--forcer] [--strict]`
(`lib/glTenirImport.js`, données `data/gl/tenir/`, README des clés) reste maître des catalogues ;
la migration 333 ne pose `effet_auto_json` qu'à la création (COALESCE). Depuis la simulation du
7 novembre 2026, les catalogues sont **synchronisés au démarrage** (`lib/glTenirSync.js`, après
`initSchema` : empreinte SHA-256 par fichier dans `gl_settings`, import tolérant des fichiers
modifiés, rapport `gl.tenir.sync`, `GL_TENIR_SYNC=0` pour désactiver) et depuis
Contenus → Chapitres (`GET/POST /api/gl/admin/tenir/catalogues[/sync]`).

## Modules serveur

| Fichier                                                                                                                                  | Rôle                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/glTenir.js`                                                                                                                         | réglages résolus, profils, surfaces, dés, ressource du peuple, semaines ISO / trimestres, état de partie, retraits, présents                              |
| `lib/glTenirView.js`                                                                                                                     | bloc `tenir` de `GET /games/:id`, filtrage des bourses, permissions par spectateur                                                                        |
| `src/shared/glTenirPermissionsCore.js`                                                                                                   | permissions pures par surface / phase / acteur (miroir `lib/shared/`)                                                                                     |
| `lib/glTour.js`                                                                                                                          | tour à phases, ordre inverse du plateau, vent, jets (serveur / physique / libre), bénéficiaire au camp, arrivée (Trame, Souffle, péripétie, camp), Cordée |
| `lib/glChasse.js`                                                                                                                        | zones, fouilles (verdicts, quota), questions de chasse, pages trouvées / réparées / lues / tenues, carnet complet, pistes, carnet de la classe, oiseau    |
| `lib/glVoile.js`, `lib/glChapardeur.js`                                                                                                  | voile (avance, pâlissement, reculs), chapardeur (payload privé, nid rendu)                                                                                |
| `lib/glSeuil.js`                                                                                                                         | clôture : caravane, tour clos, Marché, retraits, honneurs                                                                                                 |
| `lib/glSpellFenetres.js`                                                                                                                 | fenêtres (message), limites, pot pré-rempli                                                                                                               |
| `lib/glSpellEffectsApply.js`                                                                                                             | exécution des effets automatiques, « Nommer » au clic du prof                                                                                             |
| `lib/glSpellCast.js`                                                                                                                     | coût par ressource, pacte, file du prof, intégration des effets                                                                                           |
| `lib/glHonneurs.js`, `lib/glTenirBadges.js`, `lib/glHeritage.js`, `lib/glVoyageurPlume.js`, `lib/glTenirOlu.js`, `lib/glTenirExports.js` | honneurs / titres / missions, badges, Héritage, Plume / Lettre, Olu, exports CSV                                                                          |
| `lib/glProjection.js`                                                                                                                    | jeton de projection (JWT `gl_guest`, 12 h, `sha256(jti)` révocable)                                                                                       |
| `lib/glMarketPlace.js`                                                                                                                   | annonces, dons, parures (sans image : pastille texte, achetable)                                                                                          |
| `lib/glTenirSync.js`, `routes/gl/admin-tenir-catalogues.js`                                                                              | synchronisation des catalogues `data/gl/tenir/` (empreintes, import tolérant, rapport, écran d'administration)                                            |
| `lib/glRandom.js`                                                                                                                        | aléa centralisé (`crypto` par défaut ; `GL_RANDOM_SEED` hors production → mulberry32, une graine par partie `seed ^ gameId`)                              |
| `lib/glClock.js`                                                                                                                         | horloge injectable (`now()`, décalage de simulation par appel ou en-tête `X-GL-Sim-Clock` si `GL_SIM_ALLOW=1` hors production) ; semaines ISO, trimestres |
| `lib/glBourses.js`                                                                                                                       | **seule** écriture des bourses (`applyBourseDeltaTx`) + grand livre `gl_resource_ledger` (delta, soldes après, cause, évènement)                          |
| `lib/glTenirInvariants.js`                                                                                                               | invariants d'une partie (bourses, livre, pions, voile, pages, relances) : fonction pure + chargeur depuis la base                                         |
| `src/shared/glCaseNumeroCore.js`                                                                                                         | numérotation humaine des cases (numéro = rang + 1), bandeau et journal alignés (miroir `lib/shared/`)                                                     |

## Routes

Toutes sous `/api/gl/games/:id/…` sauf mention (détail dans [`API.md`](API.md)) :
`tenir`, `tenir/profil`, `tenir/olu`, `tenir/retrait`, `tenir/tour/*`, `tenir/lancer`,
`tenir/des/:id/valider|refuser`, `tenir/tour/team-spirit`, `tenir/lumiere/choix`,
`tenir/tour/olu-corrige`, `tenir/peripetie/passer`, `projection-token`, `chasse/*`,
`tenir/honneurs|missions|badges|chimeres|plumes`, `spell-casts/*` (v2), `/api/gl/market/annonces|dons|parures`,
`/api/gl/voyageur/spells/flair|plume/cast`, `/api/gl/admin/classes/:classId/exports/*.csv`,
`/api/gl/admin/chasse-zones`, `/api/gl/admin/tenir/catalogues[/sync]`.

## Événements du journal (`gl_game_events`)

`tour_ouvert`, `tour_phase`, `tour_clos`, `vent_caravane`, `cartes_vers_cases`, `dice_roll`
(bénéficiaire), `avance_libre`, `des_saisie_attente`, `des_saisie_refusee`, `marker_effect`
(`tonalite`, `sentier`), `peripetie`, `arrivee_camp`, `relance_bonus`, `fouille`, `page_revelee`,
`page_trouvee`, `page_reparee`, `page_lue`, `page_tenue` (bourses privées), `carnet_complet`,
`piste`, `voile_avance`, `voile_dort`, `voile_recul`, `chapardeur` (privé), `nid_rendu` (privé),
`retrait`, `team_spirit`, `lumiere_palier`, `lumiere_choix`, `olu_erreur`, `olu_corrige`,
`spell_cast`, `spell_effect`, `spell_file`, `spell_effect_applied`, `heritage_recu` (privé),
`honneur`, `mission_reussie`, `badge` (privé), `chimere_validee`, `plume_validee`, `seuil_clos`,
`don`, `annonce_*`, `parure_*`.

Libellés lisibles (élève / MJ / projection) : `lib/glJournalPresentTenir.js`, branché dans
`lib/glJournalPresent.js` ; en partie tenir (`context.tenir`, posé par `routes/gl/journal.js`),
les libellés tenir priment sur les classiques (`move`, `spell_cast`, `marker_effect`,
`qcm_answer`…) et `tests/gl-journal-tenir-exhaustif.test.js` relève tous les types émis par le
moteur : aucun ne tombe plus sur « Un évènement s'est produit ». Le modèle de vue client
(`src/gl/utils/glAppShellHelpers.js › toGameViewModel`) conserve le bloc `tenir` de
`GET /games/:id` ; sans lui, aucun écran tenir ne se monte.

## Correctifs de la simulation du 7 novembre 2026

Trois chapitres 1 joués de bout en bout (prof et 20 élèves virtuels, surfaces hybride et
tablette, contenu réel : plateau 1, 931 QCM, 205 feuillets, 276 espèces, ~1 400 appels, aucun
5xx). Choix faits par défaut, chacun réglable :

| #   | Sujet              | Choix                                                                                                                         | Réglage                                        |
| --- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| C1  | Progression        | ±1 case **sans** appliquer la case d'arrivée ; lançable seulement si le dernier jet du tour est celui de l'équipe             | `gameplay.tenir_progression_applique_case`     |
| C2  | Relance            | même fenêtre que C1 (`gl_game_rounds.dernier_jet_json`)                                                                       | —                                              |
| C3  | Relances de case   | une seule par équipe et par tour ; au-delà +1 case sans relance (`/qcm/answer` → `tenir.bonus { cases, relance }`)            | `gameplay.tenir_relances_max_par_tour` (0 = ∞) |
| C4  | Cases positives    | +1 ressource du peuple, comme la Trame ; une perte neutre hors Souffle ne retire rien                                         | `gameplay.tenir_cases_positives`               |
| C5  | Péripéties         | aussi sur les cases `behavior` sans effet de tonalité négative ou neutre ; jamais sur un Défi ; description de la case jointe | `gameplay.tenir_peripeties_cases_neutres`      |
| C6  | Retrait            | l'élève en retrait ouvre et tient une page (gains d'équipe) ; Marché et pot inchangés                                         | —                                              |
| C7  | Zone `cz-p2-08`    | `actif: false` (feuillet `ep-I-08` au plateau 3) ; question de lecture désactivée                                             | —                                              |
| C8  | Passeur p4 ordre 4 | l'importeur du Passeur accepte un feuillet d'un plateau antérieur, avec avertissement                                         | —                                              |
| C9  | Connexions         | limiteur d'authentification 300 / 15 min / IP (NAT du lycée), journal `auth_rate_limit_reached` par fenêtre                   | `FORETMAP_AUTH_RATE_LIMIT_PER_15MIN`           |
| C10 | Parures sans image | achetables en pastille texte                                                                                                  | —                                              |

Et aussi : pistes de veillée par `especes` de zone (35 zones renseignées), erreur d'Olu filtrée
par plateau (`plateaux`), noms d'équipes typés par peuple (une fois par classe et par année),
scripts `gl-import-*.js` (xlsx) réparés (`await`), descriptions des cases de déplacement
(migration 335, contrôle `tests/content/gl-markers-coherence.test.js`).

**Banc de simulation** (garde-fou) : il ne s'exécute jamais contre la base de prod — une base
dont le nom ne finit pas par `_sim` ou `_test`, ou `NODE_ENV=production` sans `GL_SIM_ALLOW=1`,
doit être refusée. Les briques livrées ici : aléa rejouable (`GL_RANDOM_SEED`), horloge
(`X-GL-Sim-Clock`), grand livre et invariants ; le banc en série, ses scénarios et les outils
MCP G&L restent à livrer (étapes 7 à 9 du prompt, tronquées).

## Captures

Captures « après » du 7 novembre 2026 : `docs/captures/tenir-v2/apres-1-ecran-du-tour-1440x900.png`
(console MJ, écran du tour visible sans défilement), `apres-3-projection-1920x1080.png` (plateau
en lecture seule), `apres-2-ecran-equipe-tablette-1024x768.png`, `apres-5-ecran-equipe-telephone-390x844.png`.

`docs/captures/tenir-v2/` : écran du tour projeté avec voile, écran d'équipe (tablette),
projection, Marché (partie d'exemple anonyme, profil `complet`).

## Surfaces et verrous

| Surface  | Lancer / répondre / fouiller                               | Lire | Marché pendant `jeu` |
| -------- | ---------------------------------------------------------- | ---- | -------------------- |
| tableau  | prof seulement (écran du tour, équipe active)              | oui  | non                  |
| hybride  | équipe active ; fouille sur fenêtre ouverte par le prof    | oui  | oui                  |
| tablette | chaque équipe, en phase `jeu` (dés physiques validés prof) | oui  | oui                  |

Le serveur rejoue les permissions (`assertActionOuverte` pour lancer / répondre / fouiller,
`resolveLectureContext` pour lire et tenir, le routeur du Marché pour toute action) ; le client ne
fait que griser. Un élève ne force pas un mode de dés hors de sa surface, sauf vers la file de
validation du prof.

## Temps réel

`lib/realtime.js › emitGlGameEvent` est le seul point d'émission vers la salle de partie
(élèves, prof et projection partagent la même socket) : un payload `private: true` y est réduit
à ses `publicKeys` (`redactPrivateEventPayload`). Le prof relit la version complète par HTTP.
La clôture (`POST /end`) écrit `ended` et joue le Seuil dans **une seule transaction** : si le
Seuil échoue, la partie reste en cours et le geste se rejoue.

## Projection

`POST /projection-token` (prof) → URL `gl.html?projection=<jeton>` ; lecture seule de
`GET /games/:id`, `/tenir`, `/tenir/tour`, `/chasse`, `/tenir/olu`, `/tenir/honneurs|missions|chimeres`,
journal expurgé ; aucune bourse, aucun polygone, aucun motif de retrait ; révoqué à la clôture ou
sur `{ revoke: true }`.

## Tests

Voir [`GL_TESTS.md`](GL_TESTS.md) § « Tenir à deux ».
