# `data/gl/tenir/` — fichiers de données « Tenir à deux »

Jeu de données de la mouture « Tenir à deux » de Gnomes & Licornes (règles de référence v3,
`docs/GL_TENIR_A_DEUX_REGLES.md`, § 16). Tous les fichiers sont en UTF-8, JSON indenté, avec une
clé `format` en tête qui nomme la version du format. Aucune donnée d'élève, aucun identifiant de
compte, aucun secret.

Contrôle : `python3 -I scripts/check-tenir-data.py data/gl/tenir` (stdlib seulement ; si le client
`mysql` et la base `fm` sont joignables, les codes de feuillets et de questions sont vérifiés en base,
sinon un avertissement est émis et la vérification se limite au fichier).

## Garde-fous communs (toutes les chaînes visibles)

- Jamais « corbeau », « Krâ », « Kraa » dans un indice, une question, un titre, une ligne d'Olu, une
  péripétie, une mission, une parure (dans le code, l'identifiant `kraa` est toléré ; côté élève
  c'est « l'oiseau » ou rien).
- Jamais « faux », « raté », « perdu », « monstre », « ennemi » (l'erreur ne punit pas ; le Souffle n'est
  jamais personnifié).
- Aucun contenu du tiers `secret` du glossaire (`gl_lore_glossary_terms.niveau = 'secret'`).
- Le script vérifie ces chaînes sur tous les champs texte de tous les fichiers (sauf `titre_prive`
  des zones, jamais montré, et les justifications du fichier du Passeur, réservées au prof).

## Chargement (principe commun)

Chaque fichier a un chargeur **idempotent** : l'upsert se fait sur la clé indiquée ci-dessous
(`INSERT … ON DUPLICATE KEY UPDATE`), les lignes absentes du fichier sont **désactivées** (jamais
supprimées) quand une colonne `actif` existe, et **aucun état de partie** n'est touché
(`gl_game_*`). Relancer un chargeur deux fois produit la même base.

**Tolérance** (depuis la simulation du 7 novembre 2026) : une ligne invalide est **écartée et
rapportée** (`errors[]`, compteur `ecartees`), les lignes valides sont écrites, un fichier ne
bloque plus les suivants ; une ligne écartée n'est jamais désactivée en base. Une question de
lecture dont la zone est absente ou inactive est écartée avec un avertissement. `--strict`
(`npm run gl:import:tenir -- --fichier tous --strict`) garde le tout-ou-rien pour la CI de contenu.

**Synchronisation au démarrage** (`lib/glTenirSync.js`) : après les migrations, l'empreinte
SHA-256 de chaque fichier est comparée à celle mémorisée dans `gl_settings`
(`content.tenir_catalogues_hash`) ; un fichier modifié est rechargé (import tolérant) et le rapport
est journalisé (`gl.tenir.sync`, comptes seulement) et stocké (`content.tenir_catalogues_report`).
`GL_TENIR_SYNC=0` désactive ; l'écran Contenus → Chapitres (carte « Catalogues Tenir à deux »)
montre comptes, écarts et dernier rapport, et permet de resynchroniser (`POST
/api/gl/admin/tenir/catalogues/sync`).

| Fichier | Clé d'upsert | Nombre attendu |
| --- | --- | --- |
| `chasse-zones.json` | `zone_key` | 36 (8 / 8 / 10 / 10) |
| `questions-lecture.json` | `zone_key` | 36 |
| `qcm-feedbacks-zones.json` | `question_code` + lettre (colonnes `feedback_b…e` de `gl_qcm_questions`) | 9 questions, 36 retours |
| `questions-vives.json` | `question_code` (`VQCM0001…`, table `gl_qcm_questions`) | 80 (15 par biome des plateaux 1 et 2, 5 ailleurs) |
| `peripeties.json` | `id` | 32 (8 par plateau) |
| `missions.json` | `id` | 20 |
| `titres.json` | chemin `honneurs.<honneur>.<biome>` etc. | 16 + 8 + 20 |
| `badges.json` | `code` | 16 |
| `olu-lignes.json` | `id` (`actif: false` : la ligne reste au fichier, Olu ne la dit plus) | 101 (77 de commentaire, 24 « première fois ») |
| `parures.json` | `code` | 12 |
| `sorts.json` | `code` (table `gl_spells`) | 25 (19 actifs) + 5 voyageur |
| `reglages-defaut.json` | clé de réglage `gameplay.tenir_*` | — |
| `passeur-plateau4.json` | `(plateau, ordre)` | 7 / 7 / 9 / 7 |
| `defis-cases.json` | `code` (table `gl_tenir_defis_cases`) | 16 (4 par plateau) |
| `trame-reseaux.json` | `biome` (tables `gl_trame_reseaux`, `gl_trame_cartes`, `gl_trame_liens`) | 8 réseaux, 12 cartes chacun |
| `trame-fils.json` | `plateau` (tables `gl_trame_fils_cartes`, `gl_trame_fils_liens`) | 4 plateaux, 9 cartes chacun |
| `trame-reparer.json` | `code` de mesure, `plateau` (tables `gl_trame_mesures`, `gl_trame_reparer_especes`, `gl_trame_reparer_a_classer`) | 11 mesures, 6 espèces à ranger par plateau |
| `trame-ranger.json` | `code` du jeu (tables `gl_trame_ranger_familles`, `gl_trame_ranger_jeux`, `gl_trame_ranger_cartes`) | 12 jeux : 8 « Le bon rôle » (un par biome, 8 cartes), 4 « Le bon pays » (un par plateau, 8 à 10 cartes) |
| `trame-adaptations.json` | `biome` (tables `gl_trame_adaptation_jeux`, `gl_trame_adaptation_cartes`, `gl_trame_adaptation_liens`) | 8 jeux (un par biome), 9 cartes, 6 ou 7 fils |

Le dossier d'attente `ensemble-unifie/` (données des PR de l'ensemble unifié) n'existe plus : ses
derniers fichiers ont été intégrés aux catalogues par la PR 2 (17 novembre 2026).

## `chasse-zones.json`

```json
{ "format": "chasse-zones v1 — coords normalisées 0-1, origine haut-gauche", "zones": [ { … } ] }
```

Une zone :

| Clé | Type | Contrainte |
| --- | --- | --- |
| `zone_key` | string | unique, `cz-p<plateau>-<nn>` |
| `plateau` | 1-4 | |
| `feuillet_code` | string | feuillet `actif`, `plateau_number` = `plateau`, type `feuillet` (ou `scene` dessinable), jamais `offert_ouverture` / `offert_cloture`, jamais `ep-I-02`, `ep-VI-*`, `ep-I-13`, `ep-III-06`, `ep-I-16`, `ep-I-17`, `ep-III-01`, `ep-I-03`, `ep-I-04`, ni une page `biome` (`page-*`) |
| `titre_prive` | string | titre + détail du dessin ; **jamais envoyé aux élèves** |
| `indice` | string | ≤ 120 caractères (les 36 indices livrés : ≤ 99), sans nom d'espèce, sans corbeau, sans secret ; **énigme scientifique** (« Là où… » : un fait observable sur le vivant ou le milieu du dessin) ; affiché en entier au carnet de la classe |
| `polygone` | `[[x,y],…]` ou `null` | ≥ 3 points dans [0,1] ; `null` = à dessiner dans l'éditeur de zones |
| `polygone_ref` | string ou `null` | identifiant d'une zone de `src/gl/data/zones_feuillets.json` portant le même feuillet |
| `rang_case` | int ou `null` | case du chemin la plus proche (pour le voile) ; calculé par le chargeur si `null` |
| `question_code` | string | question `gl_qcm_questions` active, niveau `6ème`, biome du feuillet, **unique sur les 36 zones** |
| `theme_secours` | string | `categorie_slug` de la banque (`biome`, `ecosystemes`, `faune`, `flore`, `geologie`, `perturbations`) ; égal à la catégorie de `question_code` |
| `ordre` | int | 1..N par plateau, sans trou ; le réglage `zones_par_plateau` active les N premières |
| `especes` | `[code, …]` | 1 à 3 codes `gl_species` liés au dessin de la zone. **La première fiche donne la réponse** de la question de zone (ensemble unifié, M22) ; toutes servent aux **pistes de veillée** (étudier la fiche d'une de ces espèces révèle la zone) ; le chargeur retombe sur `lien_canal = 'espece'` du feuillet si la clé manque |
| `glossaire` | `[code, …]` (facultatif) | 1 à 3 codes de termes `gl_glossary_terms` (`GL####`) qui donnent la réponse quand elle n'est pas dans une fiche (M22). Après un « pas encore », l'écran dit « La réponse se trouve au mot … du glossaire » (à défaut de terme : « … dans la fiche … ») — un lien, jamais la réponse. Un terme absent de la base est un avertissement, pas un refus |
| `actif` | bool | `true`, sauf une zone **en attente d'un autre feuillet** (`false` : écrite inactive, feuillet d'un autre plateau toléré avec avertissement ; sa question de lecture est désactivée). Depuis le 17 novembre 2026 (L5), les 36 zones sont actives : `cz-p2-08` porte le feuillet `ep-I-06` (son polygone, celui de `zf-p2-07`, est écrit en clair car `polygone_ref` exige le même feuillet) |

Le chargeur exige `polygone` **ou** `polygone_ref` pour activer une zone ; une zone avec les deux à
`null` est importée mais **refusée à l'activation** tant qu'Oliv n'a pas dessiné le polygone. Les
polygones ne sont jamais envoyés aux élèves.

## `questions-lecture.json`

`{ "format", "questions": [ { zone_key, feuillet_code, question, choix: {A,B,C,D}, reponse, feedback_correct, feedback_incorrect?, retours? } ] }`

- Une question par zone, `zone_key` et `feuillet_code` identiques à `chasse-zones.json`.
- `reponse` ∈ {A,B,C,D} ; 4 choix non vides et distincts.
- Porte sur le texte réel de la page (un fait, une image, une espèce, un geste), jamais sur le lore
  secret ni sur l'oiseau. Retentatives illimitées, aucune perte : `feedback_incorrect` commence par
  « Pas encore » et renvoie au passage de la page.
- `retours` (facultatif, ensemble unifié) : `{ "A": "Pas encore : …", … }`, un retour **propre à un
  mauvais choix**, qui prime sur le retour commun. Jamais pour la bonne lettre (c'est
  `feedback_correct`) ; chaque retour commence par « Pas encore ». Quand les trois mauvais choix
  ont le leur, `feedback_incorrect` devient facultatif.

## `qcm-feedbacks-zones.json`

`{ "format", "note", "feedbacks": { "<question_code>": { "b": "…", "c": "…", … } }, "remplacement": { … } }`

- Retours de **mauvais choix** des questions fixes de zones de chasse. Le retour de la bonne
  lettre reste vide (c'est `feedback_correct` qui sert). Un retour ne commence jamais par
  « Non » : à l'écran, l'app écrit « Pas encore. » devant.
- **Écriture gardée** : une colonne n'est écrite que si elle est vide ou commence par « Non »
  (retour d'origine). Une retouche d'auteur n'est jamais écrasée ; relancer ne réécrit rien.
- Une question absente de la base est écartée avec un avertissement (erreur en `--strict`).
- `remplacement` : nouvelle rédaction de `GQCM0766` (suricate). Elle est posée par la migration
  344, gardée par l'ancien énoncé exact ; le chargeur ne fait que la relire (chaînes interdites).

## `questions-vives.json`

`{ "format", "principe", "niveau", "questions": [ { question_code, biome_slug, categorie_slug, question, choix: [ … ], reponse, explication } ] }`

- Questions de **case** écrites pour des 6e : elles partent d'une curiosité (un record, une
  astuce, une idée reçue), jamais d'un nom à réciter. Une question de taxonomie est refusée.
- `question_code` : `VQCM` + 4 chiffres ; `biome_slug` : un des 8 biomes joués ; `categorie_slug` :
  une catégorie de `gl_qcm_categories` ; 15 questions par biome des plateaux 1 et 2 (lot 2 de
  l'ensemble unifié, `VQCM0041` à `VQCM0080`), 5 pour les autres.
- Tirage d'une case en mode tenir (M9) : une question vive du biome de la case pas encore posée
  dans la partie passe en premier ; ensuite, sous le plafond de difficulté du plateau.
- `choix` : 4 ou 5 textes non vides et distincts ; **le premier est le bon** (`reponse` = `"A"`).
  La présentation mélange les choix.
- `explication` : une seule par question, sans amorce « Non ». Elle devient `feedback_correct`
  et le retour de chaque mauvais choix (l'affichage écrit « Pas encore. » devant).
- À la création : `niveau` du fichier (`6ème`), `statut = 'actif'`, `usage_tenir = 1`. À la mise
  à jour, `statut` et `usage_tenir` sont **gardés** (case « Posée en partie » du prof). Une
  question `VQCM` retirée du fichier passe `inactif`.

## `peripeties.json`

`{ "format", "peripeties": [ { id, plateau, biome_slug, texte, passable } ] }` — `biome_slug` ∈
`jungle_afc | savane | sahara | foret_mediterraneenne | foret_caducifoliee | landes | taiga | toundra`,
cohérent avec le plateau (1 : jungle_afc/savane, 2 : sahara/foret_mediterraneenne, 3 :
foret_caducifoliee/landes, 4 : taiga/toundra). `passable` toujours `true` (bouton « on passe »).
Tirage : une péripétie du biome de la case, sans répétition dans la partie tant qu'il en reste.

## `missions.json`

`{ "format", "missions": [ { id, texte, type, titre_sceau } ] }` — `type` ∈
`cooperative | absurde | classe` ; `titre_sceau` est le titre donné à la réussite (présent dans
`titres.json → missions`). Les missions sont papier ; l'app ne stocke que la saisie prof « mission
réussie » (équipe × chapitre → sceau + titre).

## `titres.json`

- `honneurs.<eclaireurs|gardiens|passeurs|esprit>` : `libelle`, `critere`, puis un titre par biome
  de chapitre `tropiques | aride | tempere | grands_froids` (plateaux 1 à 4, voir `biomes`).
- `sceaux_peuple.<eclaireuses|mains>` : même structure, avec `peuple` (`unicorn` / `gnome`).
- Lexique (L2, 17 novembre 2026) : les **clés** gardent leur nom, les `libelle` disent
  « Avant-garde » (`eclaireurs`), « Compagnons » (`passeurs`), « Révélatrices » (`eclaireuses` :
  pages trouvées + zones révélées). Mêmes noms dans `lib/glHonneursLibelles.js`.
- `prefixe_double` : préfixe quand un honneur est gagné deux fois (« Très Grands … »).
- `missions` : liste des titres de sceau (20) ; `voyageur` : titres individuels du Seuil (à
  harmoniser avec `lib/glVoyageur.js`).

## `badges.json`

`{ "format", "badges": [ { code, nom, critere, regle: { type, seuil, source }, icone } ] }` —
`regle.type` ∈ `compteur | serie_hebdo | saisie_prof | reserve` ; `seuil` entier ou `null`
(`reserve`) ; `source` nomme le compteur à dériver des événements `gl_game_events` ou des tables
existantes. `icone` est un mot-clé, pas un fichier. Aucun badge ne donne de ressource. Lexique
(L2) : `passeur_de_seuil` s'appelle « Grand voyageur », `revelateur` « Voyant des fils » (les codes
ne changent pas). Ensemble unifié (M21) : `gardien_des_fils` compte aussi les fils de
l'adaptation (source `defis_trame_fils`), et `bon_rangeur` (« Bon rangeur », source
`defis_trame_ranger` : jeux de « Le bon rôle » ou « Le bon pays » rangés ; nom à confirmer).

## `olu-lignes.json`

`{ "format", "lignes": [ { id, moment, expression, texte, variables, correction?, cle?, seance_escalier? } ] }`

- `id` : 48 caractères au plus.
- `moment` ∈ `ouverture | jet | question | fouille | tenir | voile | sort | seuil | peripetie | bestiaire | oiseau | erreur | bourse_pleine | defi_case_recu | defi_case_releve | defi_case_pas_encore | defi_trame_reussi | premiere_fois` (`bourse_pleine` : E5, au moins trois membres d'une équipe au plafond, dit une fois par séance à l'écran d'équipe, jamais en projection).
- `moment = premiere_fois` (ensemble unifié, M8) : ligne dite **une seule fois par partie** — par équipe quand elle porte `{equipe}` —, à la première occurrence de l'évènement `cle`. `cle` (obligatoire, une ligne par clé, liste `PREMIERE_FOIS_CLES` de `lib/glTenirOlu.js` : `avancer`, `question_pas_encore`, `chercher`, `chaud_froid`, `peripetie`, `defi_case`, `trame`, `role`, `tenir`, `erreur_du_jour`, `voile`, `sous_le_voile`, `page_temoin`, `palissement`, `sorts`, `lumiere`, `marche`, `un_de_pose`, `un_de_joue`, `main`, `camp`, `cordee_offerte`, `lettre`, `comptes`) ; `seance_escalier` (0 à 6) : séance du chapitre 1 où la nouveauté s'ouvre, 0 = hors escalier — dans une partie qui monte l'escalier, la ligne ne se dit pas avant cette séance. `cle` et `seance_escalier` sont refusées sur tout autre moment. Identifiants `olu-pf-<cle>`. Olu dit le geste, jamais de morale. Deux clés n'ont aucun évènement : `main` (en attente) et `comptes` (« Le Marché et le Seuil s'ouvrent depuis le compte de chacun. »), que la tablette d'équipe dit elle-même, une fois par onglet, quand un tour est ouvert et que le Marché l'est aussi.
- `expression` ∈ `neutre | joie | curieux | surpris | agace | pensif | explique | peur`.
- `variables` : sous-ensemble de `equipe`, `n`, `biome`, calculé depuis les `{…}` du texte.
- `moment = oiseau` : ligne dite **après** le passage de l'oiseau (Olu se fige pendant).
- `moment = erreur` : erreur volontaire d'Olu, une par séance au hasard ; `correction` est la phrase
  dite quand une équipe corrige, ou en fin de tour si personne ne corrige ; `plateaux` (`[1-4]`
  ou `"tous"`) : plateaux où l'erreur se tire — les élèves doivent pouvoir la corriger avec ce
  qu'ils ont vu (le tirage filtre sur le plateau de la partie, repli sur `tous`).

## `parures.json`

`{ "format", "parures": [ { code, nom, description, prix, rare, chapitre_min, type, asset, pelage? } ] }` —
`prix` de 2 à 8 **gemmes** (ensemble unifié, M19 : une seule monnaie, plus de champ `ressource` ;
un fichier qui en porterait un autre que `gemmes` est refusé), `rare` booléen (6 gemmes ou plus,
trois parures rares au plus — aujourd'hui les deux pelages, 7 et 8), `type` ∈ `calque | pastille`,
`asset` chemin de calque ou de pastille (`null` tant qu'il n'existe pas : la parure se porte alors
en pastille texte et reste achetable), `pelage` ∈ `bestiaire | neon` pour les deux pelages du
chapitre 4 (appliqués au sprite de la mascotte plutôt que superposés). Une parure achetée reste à
l'élève toute l'année (`gl_player_parures`) ; il la pose sur la mascotte de son équipe du moment
depuis la garde-robe du Seuil.

## `sorts.json`

`{ "format", "vocabulaire", "sorts": [ … ], "ouverture_par_chapitre", "voyageur": [ … ] }`

Un sort : `code` (SL0xx ; repris de `gl_spells` pour SL002 Progression, SL005 Relance, SL004
Question, SL006 Tablette, SL007 Musique, SL010 Esquive, SL018 Consécration, SL021 Conseil, SL027
Mentorat, SL033 Héritage ; SL036 à SL050 pour les nouveaux, SL022/029/034/035 laissés libres),
`nom`, `famille`, `peuple`, `cout`, `ressource`, `fenetre`, `limite: { par, n, portee } | null`,
`cible`, `execution`, `effet_court`, `effet_auto_json` (objet ou `null` pour les sorts du prof),
`chapitre_ouverture` (1-4 ou `"retour"`), `nouveau`. Les valeurs admises sont listées dans
`vocabulaire`. Le chargeur upserte `gl_spells` (statut `officiel`, `approval_mode` dérivé de
`execution`), réécrit `gl_chapter_spells` depuis `ouverture_par_chapitre` et passe en `propose` les
sorts de `gl_spells` absents du fichier. **Une seule monnaie** (ensemble unifié, M1, PR 4) :
`ressource` vaut toujours `gemmes` (`cartes` pour le seul sort de classe, sorti du grimoire) ; les
valeurs `coeurs`, `peuple`, `choix` et `pacte` sont refusées par le chargeur. La Consécration
coûte 8 gemmes : c'est le but de l'année, affiché grisé dès le chapitre 1. Ensemble unifié (M6, 17 novembre 2026) : **19 sorts** au grimoire ; un sort
`actif: false` (Nommer, Héritage, Boussole, Tablette, Musique, Lumière) reste au fichier, passe en
`propose` et n'est ouvert à aucun chapitre ; la Cordée (fenêtre `jeu`, `effet_auto_json.prochain_tour`)
agit au tour suivant et `offerte_plateau_4` la rend gratuite une fois par équipe au plateau 4.

**Mentorat et Lettre** (M23) : leurs textes vivent dans `effet_auto_json` — `{ type: "mentorat",
consigne, critere_prof, retour_pas_encore, retour_valide }` et `{ type: "lettre", presentation,
amorces: [{ code, titre, texte }], retour_pas_encore, retour_valide, relecture_prof: [ … ] }`.
`critere_prof` et `relecture_prof` ne sortent que dans la file du prof ; tous les autres champs
passent le crible des chaînes interdites. Le sort se paie une fois (Mentorat 3, Lettre 2) et ne se
rembourse jamais.

`voyageur` : grimoire individuel gratuit, un usage par chapitre, débloqué par le niveau du Seuil
(Messager hors périmètre). Cette section est **documentaire** (la vérité est `lib/glVoyageur.js`).
La Plume en est sortie ; « Seconde chance » porte une `condition` : elle n'existe que si
`tenir_delai_fiche_secondes` > 0.

## `reglages-defaut.json`

`defaut` : valeurs du profil `complet`, une clé par réglage `gameplay.tenir_<clé>` ; `profils` :
`complet` (aucun écart) et `court` (`ecarts` appliqués par-dessus `defaut`). Le profil `prologue`
a disparu (ensemble unifié, M8) : l'escalier du chapitre 1 le remplace — réglage `escalier`
(`true` : une partie créée au plateau 1 ouvre ses règles séance après séance). `pages_par_semaine`
(4) est la limite de veillée unique ; elle remplace `pages_veillee_par_semaine` et
`defis_pages_par_semaine`. `max_health_points` a quitté le fichier (ensemble unifié, M1 : une seule
monnaie ; `max_power_points`, 8, est le plafond de la bourse) — un fichier qui le porterait encore
est chargé, la clé est ignorée et signalée. Le chargeur n'écrit
une clé que si elle est absente de `gl_settings` (les réglages déjà modifiés depuis le compte MJ ne
sont jamais écrasés) ; l'application d'un profil sur une partie copie `defaut` + `ecarts` dans
l'état de la partie.

## `passeur-plateau4.json`

`plateaux.<1-4>.pages[]` : `{ feuillet_code, ordre_voyage, titre, biome_slug, ordre, justification?, avertissement? }`.
Plateaux 1-3 : toutes les pages de route (`mode_apparition = carnet_route`, type `scene`, statut
`actif`) dans l'ordre de voyage de la base. Le chargeur du Passeur (seul) accepte une page d'un
plateau **antérieur** avec un avertissement (`ep-VI-09`, plateau 2 en base, lu au plateau 4). Plateau 4 : 7 pages choisies (sur 35), sans lore secret
ni corbeau nommé, chacune avec sa `justification` (réservée au prof). Le mot du Passeur affiche la
page `ordre` = numéro du tour, modulo la longueur de la liste, sans reprendre une page déjà lue dans
la partie. Une page marquée `avertissement` nomme le corbeau dans son **titre** : l'afficher sans
titre côté élève, ou la passer.

## `defis-cases.json`

Défis des cases « Défi d'équipe » (lot 2 du 15 novembre 2026, § 7 du prompt d'implémentation).
Structure : `plateaux: { "1": [ … ], "2": [ … ], "3": [ … ], "4": [ … ] }`, quatre défis par
plateau.

| Champ | Rôle |
| --- | --- |
| `code` | clé d'upsert, `d-p<plateau>-<nom>` |
| `titre`, `consigne`, `preparation` | **visibles** de l'équipe (écran d'équipe, Seuil) et, à la clôture du tour, de la projection |
| `critere` | **réservé au prof** : jamais servi à un élève, à une tablette ni à la projection |
| `notion` | notion de programme travaillée |
| `duree_s` | durée du sablier que le prof peut afficher (10 à 3600 secondes) |

Une équipe reçoit un défi du plateau quand elle s'arrête sur une case marquée
`event_config_json.tenir.defi = true` (ou la franchit, réglage `defi_declenchement = passage`),
tiré **sans répétition dans la partie** ; la liste épuisée recommence. Le prof juge « Relevé » (le
voile recule de `defi_recul` cases) ou « Pas encore » (rien). **Jamais de ressource.** Tous les
champs sont relus contre la liste des chaînes interdites, `critere` compris.

## Catalogues de la Trame (`trame-*.json`)

Défis de la Trame (lot 3 du 15 novembre 2026, § 8 du prompt d'implémentation). Chargeurs dans
`lib/glTrameImport.js`, test de contenu `tests/content/gl-trame-catalogues.test.js`. Mécanique
(classement des flèches, cascade, récompenses) et marche à suivre pour **ajouter un réseau** :
`docs/GL_DEFIS.md` § 7.

### `trame-reseaux.json`

Un réseau trophique par biome joué (`reseaux[]` : `biome`, `plateau`, `nom`, `note`).

| Champ | Rôle |
| --- | --- |
| `especes[]` | **12 cartes, dans l'ordre** : `code` (espèce de `gl_species`, ou `DEC`), `nom`, `role` (`producteur`, `consommateur`, `decomposeur`), `precision`, `generique` (vrai pour `DEC`), `regime` (`charognard`) |
| `liens_acceptes[]` | `{ de, vers }` : **de la ressource vers celui qui la mange** (« est mangé par ») |
| `a_discuter[]` | `{ de, vers, pourquoi }` : liens rares ou débattus, ni justes ni refusés |
| `scenarios_trame_alteree[]` | trois cartes à retirer, parmi les **neuf premières** |

- **Niveaux** : 5, 7, 9 et 12 premières cartes. Chaque niveau doit porter au moins un producteur,
  au moins un décomposeur, et chaque carte qui n'est pas un décomposeur doit être touchée par un
  lien accepté du niveau. Changer l'ordre des cartes change les niveaux.
- **Décomposeurs** : toute carte peut pointer vers une carte de rôle `decomposeur` sans que le
  lien soit écrit. Les **charognards** (vautours, gypaète) sont des consommateurs : seuls leurs
  liens écrits comptent.
- **Espèces** : chaque `code` (hors carte `generique`) doit exister dans `gl_species` et être du
  biome du réseau. En import tolérant sur une base sans le corpus, c'est un avertissement : la
  carte garde le nom et le rôle du fichier.
- Les liens acceptés entre deux espèces réelles sont aussi versés dans `gl_species_interactions`
  (`herbivorie`, `predation`, ou `decomposition` vers un décomposeur réel), sans jamais rien
  supprimer.

### `trame-fils.json`

« Les fils cachés » : causes → effets (`chapitres[]` : `plateau`, `titre`, `note`,
`cartes: [[code, texte]]`, `liens: [[de, vers]]`). Liens entre cartes du même plateau, jamais
d'une carte vers elle-même ; les **cycles sont permis** (la rétroaction du plateau 4 est voulue).

### `trame-reparer.json`

« Réparer la trame » : `mesures[]` (`code`, `texte`), puis par plateau (`chapitres[]`) :
`especes[]` (`code`, `menace`, `mesures[]` acceptées, au moins une), `a_classer[]` (**six**
espèces, `categorie` ∈ `en_danger`, `fragile`, `pas_menace`) et la `lecon` du plateau. La liste à
ranger est écrite dans le fichier : l'app ne la tire pas au hasard et ne lit pas le statut en
base. La clé `classement` (statuts par catégorie) est une note de construction, jamais servie.

### `trame-ranger.json`

« Le bon rôle » et « Le bon pays » (ensemble unifié, M21) : ranger des cartes dans des catégories.

| Clé | Rôle |
| --- | --- |
| `familles.role` | `nom`, `consigne`, `categories[]` (`code`, `nom`, `aide`) : `producteur`, `consommateur`, `decomposeur` |
| `familles.pays` | `nom`, `consigne`, `categories_depuis: "biomes"` : les catégories d'un jeu sont des slugs de biomes joués, leur libellé vient du registre des biomes |
| `jeux[]` | `code` (clé d'upsert), `famille`, `unite` (le biome pour `role`, `p<plateau>` pour `pays`), `plateau`, `biome` (`role`), `categories[]` (`pays` : les pays du plateau, et ceux déjà traversés qui reviennent), `titre`, `bilan` (affiché à la réussite), `cartes[]` |
| `cartes[]` | `code` (fiche `SP####` du biome du jeu — du pays de la carte pour `pays` —, ou carte générique `DEC-…` avec `generique: true`), `nom`, `categorie` (jamais servie), `pourquoi` (servi quand la carte est bien rangée), `indice` (obligatoire pour `pays`) |

Contrôles : 4 à 12 cartes par jeu ; chaque rôle a au moins une carte ; une carte `DEC-…` est
générique, et elle seule ; une espèce absente de la base est un avertissement (une erreur en
strict), une espèce d'un autre biome une erreur.

### `trame-adaptations.json`

« Les fils de l'adaptation » (M21) : le moteur des fils cachés, lu du milieu vers l'espèce
(`biomes[]` : `biome`, `plateau`, `titre`, `note`, `cartes: [[code, texte]]`, `liens: [[de,
vers]]`). Chaque fil va d'une contrainte du milieu au problème qu'elle pose, puis à l'espèce qui
porte la solution. Toute carte tient à un fil ; aucun lien posé dans les deux sens ; la `note`
est une note d'auteur, jamais servie. `consigne`, `sens` et `moteur` en tête du fichier sont des
notes de construction (la consigne servie à l'élève vit dans `lib/glTrameDefis.js`).
