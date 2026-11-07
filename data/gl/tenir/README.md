# `data/gl/tenir/` — fichiers de données « Tenir à deux »

Jeu de données de la mouture « Tenir à deux » de Gnomes & Licornes (règles de référence v2,
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
| `peripeties.json` | `id` | 32 (8 par plateau) |
| `missions.json` | `id` | 20 |
| `titres.json` | chemin `honneurs.<honneur>.<biome>` etc. | 16 + 8 + 20 |
| `badges.json` | `code` | 13 |
| `olu-lignes.json` | `id` | 66 |
| `parures.json` | `code` | 12 |
| `sorts.json` | `code` (table `gl_spells`) | 25 + 6 voyageur |
| `reglages-defaut.json` | clé de réglage `gameplay.tenir_*` | — |
| `passeur-plateau4.json` | `(plateau, ordre)` | 7 / 7 / 9 / 7 |

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
| `indice` | string | ≤ 120 caractères, sans nom d'espèce, sans corbeau, sans secret ; affiché au carnet de la classe |
| `polygone` | `[[x,y],…]` ou `null` | ≥ 3 points dans [0,1] ; `null` = à dessiner dans l'éditeur de zones |
| `polygone_ref` | string ou `null` | identifiant d'une zone de `src/gl/data/zones_feuillets.json` portant le même feuillet |
| `rang_case` | int ou `null` | case du chemin la plus proche (pour le voile) ; calculé par le chargeur si `null` |
| `question_code` | string | question `gl_qcm_questions` active, niveau `6ème`, biome du feuillet, **unique sur les 36 zones** |
| `theme_secours` | string | `categorie_slug` de la banque (`biome`, `ecosystemes`, `faune`, `flore`, `geologie`, `perturbations`) ; égal à la catégorie de `question_code` |
| `ordre` | int | 1..N par plateau, sans trou ; le réglage `zones_par_plateau` active les N premières |
| `especes` | `[code, …]` | 1 à 3 codes `gl_species` liés au dessin de la zone : **pistes de veillée** (étudier la fiche d'une de ces espèces révèle la zone) ; le chargeur retombe sur `lien_canal = 'espece'` du feuillet si la clé manque |
| `actif` | bool | `true`, sauf une zone **en attente d'un autre feuillet** (`false` : écrite inactive, feuillet d'un autre plateau toléré avec avertissement ; sa question de lecture est désactivée) — au 7/11 : `cz-p2-08` (`ep-I-08` est au plateau 3) |

Le chargeur exige `polygone` **ou** `polygone_ref` pour activer une zone ; une zone avec les deux à
`null` est importée mais **refusée à l'activation** tant qu'Oliv n'a pas dessiné le polygone. Les
polygones ne sont jamais envoyés aux élèves.

## `questions-lecture.json`

`{ "format", "questions": [ { zone_key, feuillet_code, question, choix: {A,B,C,D}, reponse, feedback_correct, feedback_incorrect } ] }`

- Une question par zone, `zone_key` et `feuillet_code` identiques à `chasse-zones.json`.
- `reponse` ∈ {A,B,C,D} ; 4 choix non vides et distincts.
- Porte sur le texte réel de la page (un fait, une image, une espèce, un geste), jamais sur le lore
  secret ni sur l'oiseau. Retentatives illimitées, aucune perte : `feedback_incorrect` commence par
  « Pas encore » et renvoie au passage de la page.

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
- `prefixe_double` : préfixe quand un honneur est gagné deux fois (« Très Grands … »).
- `missions` : liste des titres de sceau (20) ; `voyageur` : titres individuels du Seuil (à
  harmoniser avec `lib/glVoyageur.js`).

## `badges.json`

`{ "format", "badges": [ { code, nom, critere, regle: { type, seuil, source }, icone } ] }` —
`regle.type` ∈ `compteur | serie_hebdo | saisie_prof | reserve` ; `seuil` entier ou `null`
(`reserve`) ; `source` nomme le compteur à dériver des événements `gl_game_events` ou des tables
existantes. `icone` est un mot-clé, pas un fichier. Aucun badge ne donne de ressource.

## `olu-lignes.json`

`{ "format", "lignes": [ { id, moment, expression, texte, variables, correction? } ] }`

- `moment` ∈ `ouverture | jet | question | fouille | tenir | voile | sort | seuil | peripetie | bestiaire | oiseau | erreur`.
- `expression` ∈ `neutre | joie | curieux | surpris | agace | pensif | explique | peur`.
- `variables` : sous-ensemble de `equipe`, `n`, `biome`, calculé depuis les `{…}` du texte.
- `moment = oiseau` : ligne dite **après** le passage de l'oiseau (Olu se fige pendant).
- `moment = erreur` : erreur volontaire d'Olu, une par séance au hasard ; `correction` est la phrase
  dite quand une équipe corrige, ou en fin de tour si personne ne corrige ; `plateaux` (`[1-4]`
  ou `"tous"`) : plateaux où l'erreur se tire — les élèves doivent pouvoir la corriger avec ce
  qu'ils ont vu (le tirage filtre sur le plateau de la partie, repli sur `tous`).

## `parures.json`

`{ "format", "parures": [ { code, nom, description, prix, ressource, chapitre_min, type, asset, pelage? } ] }` —
`prix` 2 à 4, `ressource` toujours `choix`, `type` ∈ `calque | pastille`, `asset` chemin de calque
ou de pastille (`null` tant qu'il n'existe pas : la parure est alors listée mais non achetable),
`pelage` ∈ `bestiaire | neon` pour les deux pelages du chapitre 4 (appliqués au sprite de la
mascotte plutôt que superposés).

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
sorts de `gl_spells` absents du fichier. Le coût de Consécration (8 « offertes ») est porté par
`ressource: choix`. `voyageur` : grimoire individuel gratuit, un usage par chapitre, débloqué par le
niveau du Seuil (niveaux 1-6 ; Messager hors périmètre).

## `reglages-defaut.json`

`defaut` : valeurs du profil `complet`, une clé par réglage `gameplay.tenir_<clé>` ; `profils` :
`complet` (aucun écart) et `prologue` (`ecarts` appliqués par-dessus `defaut`). Le chargeur n'écrit
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
