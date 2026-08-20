# Audit — Sortilèges (Gnomes & Licornes) : ce qu'ils font, et comment leur effet s'applique

> Portée : sous-produit **GL** du monorepo ForetMap. Ce document décrit **la chaîne complète
> d'un sortilège** — du catalogue au débit — répond précisément à la question « **comment
> l'effet d'un sort s'applique-t-il aujourd'hui ?** », puis liste les points d'attention
> relevés à la lecture du code. Rédigé le 2026-08-20 sur `main` v1.100.1, puis rebasé sur
> v1.100.2 : les commits arrivés entre-temps ne touchent **aucun** fichier du chemin des
> sortilèges (seul `lib/glVitality.js` change, sur un libellé d'erreur sans rapport avec le
> débit) — les constats ci-dessous restent valables tels quels.
>
> Références principales : `lib/glSpellCast.js`, `lib/glSpellOptions.js`,
> `lib/glChapterSpells.js`, `lib/glSpellsImport.js`, `lib/glSpellBulkPatch.js`,
> `routes/gl/spells.js`, `routes/gl/games/spell-casts.js`, `lib/glVitality.js`,
> `lib/glJournalPresent.js`, `lib/glPlayerStats.js`, `middleware/requireGlAuth.js`,
> `src/gl/components/GLSpellCastWizard.jsx`, `src/gl/components/GLSpellPopover.jsx`,
> `src/gl/components/GLSpellCastResultPopover.jsx`, `src/gl/utils/glSpellCastRules.js`,
> migrations `108`, `113`, `139`, `173`.

---

## 1. Réponse courte : l'effet n'est pas appliqué par le logiciel

**Un sortilège, côté application, ne fait qu'une seule chose mécanique : il retire des
gemmes 💎 et des cœurs ❤️ aux joueurs qui l'ont payé.** Rien d'autre n'est calculé, appliqué
ou vérifié.

Tout ce qui constitue « l'effet » du sort — ce qu'il soigne, déplace, révèle, autorise — vit
dans des **champs de texte libre** de la fiche (`effet_court`, `effet_detaille`, `portee`,
`cible`, `timing`, `limite_usage`, `cumul`). L'application les **affiche** ; elle ne les
**interprète jamais**. C'est le **MJ, humain, qui applique l'effet** : soit en le racontant
(narration), soit en agissant à la main dans la console (ajustement de vitalité, déplacement
de mascotte, score d'équipe, ouverture d'une question…).

En d'autres termes, le moteur de sortilèges est un **moteur de paiement collaboratif**, pas
un moteur d'effets. La conséquence pratique est en §4.

---

## 2. Modèle de données

| Table                             | Rôle                                                                                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gl_spell_categories`             | 4 catégories (`vie`, `mouvement`, `meta_social`, `pedagogique`) — migration `108`.                                                                                                                                            |
| `gl_spells`                       | Le catalogue. Coûts **exécutables** (`cout_gemmes`, `cout_coeurs`) ; règles **exécutables** (`approval_mode`, `cast_scope`, `caster_kind`, migrations `139`/`173`) ; tout le reste est du **texte non interprété** (voir §3). |
| `gl_chapter_spells`               | Quels sorts sont disponibles dans quel chapitre (`chapter_id` × `spell_code`).                                                                                                                                                |
| `gl_spell_cast_drafts`            | Un « pot commun » en cours : `status ∈ { collecting, pending_approval, cast, rejected, cancelled }`, `roster_scope ∈ { team, game }`, traçabilité `created_by_*` / `launched_by_*` / `decided_by_*`.                          |
| `gl_spell_cast_contributions`     | Qui met combien dans le pot (`draft_id` × `player_id` → `gems`, `hearts`).                                                                                                                                                    |
| `gl_players`                      | Les soldes réellement débités (`health_points`, `power_points`, bornés 0–99 par `clampVitality`).                                                                                                                             |
| `gl_game_events`                  | Le journal : `spell_cast`, `spell_cast_request`, `spell_cast_rejected`.                                                                                                                                                       |
| `gl_chapters.sortileges_markdown` | Page libre « sortilèges » d'un chapitre — encore du texte pour l'humain.                                                                                                                                                      |

---

## 3. Champs de la fiche : exécutables vs décoratifs

| Champ                             | Statut         | Ce qu'en fait le code                                                                         |
| --------------------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| `cout_gemmes`, `cout_coeurs`      | **Exécutable** | Montant exact à réunir puis à débiter (`glSpellCast.js:216-243`, `:611-700`).                 |
| `approval_mode`                   | **Exécutable** | `mj_required` → passage par la file de validation MJ (`:66-73`).                              |
| `cast_scope`                      | **Exécutable** | `solo` = 1 contributeur max, `collective` = 2 minimum (`:611-620`).                           |
| `caster_kind`                     | **Exécutable** | `gnome` / `unicorn` : filtre les équipes et les contributeurs (`:246-283`).                   |
| `statut` (`officiel` / `propose`) | **Décoratif**  | Affiché en pastille. **Ne conditionne pas le lancement** (cf. finding S6).                    |
| `effet_court`, `effet_detaille`   | **Décoratif**  | Affichés dans le popover avant et après lancement. Jamais interprétés.                        |
| `portee`, `cible`, `timing`       | **Décoratif**  | Trois lignes de métadonnées dans le popover (`GLSpellPopover.jsx:27-33`).                     |
| `limite_usage`, `cumul`           | **Décoratif**  | Affichés. **Aucun compteur d'usage, aucune règle de cumul n'existe** (cf. finding S8).        |
| `cout_total_eq`                   | **Décoratif**  | Libellé de coût « lisible » sur la tuile du catalogue ; le débit suit les colonnes chiffrées. |
| `notes_pedagogiques`, `source`    | **Décoratif**  | Non affichés côté joueur, mais **servis par l'API** à tout compte `gl.read` (finding S12).    |

---

## 4. La chaîne complète d'un lancement

### 4.1 Prérequis d'activation

Trois verrous, tous vérifiés à **chaque** requête (`routes/gl/games/spell-casts.js:39-56`) :

1. `modules.spell_cast_enabled` — **désactivé par défaut** (`glSettings.js:130`) ; sinon `409`.
2. `gameplay.vitality_enabled` — sans jauges, pas de monnaie, donc pas de sort ; sinon `409`.
3. `gameplay.spell_cast_mj_only` — si activé, un joueur reçoit `403` (y compris en lecture,
   cf. finding S11).

S'y ajoutent : la partie doit être **`live`**, le sort doit être **rattaché au chapitre de la
partie**, et son coût doit être **non nul** (finding S7).

### 4.2 Ouverture du pot commun — `POST …/spell-casts/drafts`

- **Joueur** (`gl.action.request`) : `teamId` obligatoire, `roster_scope = 'team'` → le pot
  ne voit que les membres de l'équipe visée.
- **MJ / admin** (`gl.event.emit`, `gl.game.manage`) : `teamId` facultatif,
  `roster_scope = 'game'` → le pot voit **tous les joueurs de la partie**, toutes équipes
  confondues ; l'équipe retenue (courante, ou la première) ne sert qu'à étiqueter le journal.
- Un pot `collecting` existant pour (partie, équipe, sort, portée) est **réutilisé** plutôt
  que dupliqué.
- Restriction de peuple : refus immédiat en portée `team` si l'équipe est du mauvais peuple ;
  en portée `game`, le contrôle se fait contributeur par contributeur.

### 4.3 Alimentation — `PUT …/drafts/:id/contributions`

Chaque ligne `{ playerId, gems, hearts }` est validée puis écrite en _upsert_. Trois gardes :
solde suffisant (`CONTRIBUTION_EXCEEDS_BALANCE`), droit d'écrire pour ce joueur
(`gameplay.spell_cast_contribution_mode`), peuple autorisé si la contribution est non nulle.

**Rien n'est réservé** : la contribution est une _intention_, pas un séquestre. Les gemmes
restent dépensables au Marché tant que le sort n'est pas parti — le solde n'est revérifié
qu'au moment du débit.

### 4.4 Lancement — `POST …/drafts/:id/launch`

1. Le pot doit être **exactement** à hauteur du coût (`isDraftReady`, `:370-375`).
2. Périmètre solo/collectif vérifié.
3. Peuple des contributeurs revérifié.
4. **Si approbation MJ requise et acteur non-staff** : le pot passe `pending_approval`,
   événement `spell_cast_request`, **aucun débit**. Le MJ tranche via `…/resolve`
   (`accept` → débit, `reject` → `rejected` + événement, aucun débit).
5. **Sinon** : transaction unique — verrou `FOR UPDATE` sur chaque `gl_players` contributeur,
   revérification des soldes, débit via `applyPlayerVitalityDelta`, passage du pot en `cast`,
   insertion de l'événement `spell_cast`.

### 4.5 Ce qui arrive ensuite — **le point clé de cet audit**

L'événement `spell_cast` est diffusé en Socket.IO (`gl:game:event`, room `gl:game:{id}`) et
déclenche, chez tous les clients connectés à la partie :

- l'ouverture du **popover de résultat** (`GLSpellCastResultPopover.jsx`) : nom, emoji, coût,
  liste des lanceurs, puis **le texte `effet_court` / `effet_detaille` de la fiche**, récupéré
  par un second appel `GET /api/gl/spells/:code` ;
- une ligne au **journal de partie** : « _L'équipe X lance ✨ Nom du sort._ »
  (`glJournalPresent.js:281-296`) — **sans le texte de l'effet** ;
- une contribution aux **statistiques joueur** (`gemsLost` / `heartsLost`,
  `glPlayerStats.js:50-61`).

**Et c'est tout.** Aucune écriture d'état de jeu supplémentaire : pas de déplacement de
mascotte, pas de gain pour une cible, pas de déblocage de feuillet, pas de modificateur, pas
de durée, pas de compteur d'usage. La boucle se referme sur un texte affiché à l'écran.

L'application de l'effet repose donc **entièrement sur le MJ**, qui dispose par ailleurs des
outils manuels de la console (ajustement de vitalité par joueur ou par équipe, narration,
score, déplacement de mascotte) — mais **rien ne relie ces outils au sort qui vient d'être
lancé** : ni pré-remplissage, ni rappel, ni trace « effet appliqué ✔ ».

---

## 5. Qui peut quoi

| Rôle                | Permissions GL                                            | Sortilèges                                                                      |
| ------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `gl_player`         | `gl.read`, `gl.action.request`, `gl.mascot.position`      | Voir le catalogue ; ouvrir/alimenter/lancer un pot (selon réglages).            |
| `gl_observateur`    | `gl.read`                                                 | Voir le catalogue et les fiches ; **aucun** accès aux pots (`403`).             |
| `gl_mj`             | + `gl.game.manage`, `gl.event.emit`, `gl.content.manage`… | Tout ce qui précède, roster de toute la partie, file de validation, résolution. |
| `gl_admin`          | + `gl.settings.manage`                                    | Idem + réglages plateforme du module.                                           |
| Invité (`gl_guest`) | —                                                         | Bloqué en amont par `requireGlAuth` (`403 guestBlocked`).                       |

`isStaff()` (`glSpellCast.js:19-22`) écarte d'abord `userType === 'gl_player'`, **puis**
cherche une permission de la liste `STAFF_PERMISSIONS` (finding S13).

---

## 6. Réglages plateforme du module

| Clé                                     | Défaut      | Effet                                                                                |
| --------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `modules.spell_cast_enabled`            | `false`     | Interrupteur général du module.                                                      |
| `gameplay.spell_cast_mj_only`           | `false`     | Réserve tout le mécanisme au MJ.                                                     |
| `gameplay.spell_cast_team_scope`        | `any_team`  | Quelle équipe un joueur peut viser : **toutes** par défaut.                          |
| `gameplay.spell_cast_contribution_mode` | `both`      | Qui saisit la contribution de qui : **n'importe qui pour n'importe qui** par défaut. |
| `gameplay.spell_cast_approval_mode`     | `per_spell` | `auto` / `mj_required` / au cas par cas selon la fiche.                              |

Les deux valeurs par défaut `any_team` + `both` sont les plus permissives des trois
possibles : voir finding S4.

---

## 7. Points d'attention (findings)

Gravité : 🔴 à traiter en priorité · 🟠 gênant au quotidien · 🟡 nettoyage / clarification.

### S1 — 🟠 Un sort ne « fait » rien : seul le coût est joué

**Constat.** Décrit en §1 et §4.5. Les colonnes `effet_court`, `effet_detaille`, `portee`,
`cible`, `timing` ne sont lues que pour être affichées ; aucune n'entre dans une décision.

**Portée.** Ce n'est pas un bug — c'est un **choix d'architecture implicite, jamais écrit**.
Le risque est le décalage d'attente : le vocabulaire du catalogue (« portée », « cible »,
« timing », « limite d'usage », « cumul ») est celui d'un moteur de règles, ce qui laisse
croire que le logiciel arbitre. En classe, un sort payé dont le MJ oublie l'effet est un sort
qui a coûté des cœurs pour rien, sans trace.

**Pistes.** (a) L'assumer et le documenter (fait dans ce lot, cf. doc de référence) ;
(b) donner au MJ un **rappel actionnable** à l'acceptation/au lancement (« effet à appliquer :
… » + raccourcis vers l'ajustement de vitalité) ; (c) à terme, un petit vocabulaire d'effets
structurés (`+N ❤️ à l'équipe cible`, `déplacer de N cases`) exécutés par le serveur.

### S2 — 🔴 Deux lancements simultanés débitent deux fois

**Constat.** Dans `launchDraft`, le statut du brouillon est lu **hors transaction**, et le
`UPDATE … SET status = 'cast'` (`:663-673`) n'est **pas conditionné** au statut. Deux requêtes
concurrentes (double-clic, deux onglets, deux membres de l'équipe) passent toutes les deux la
garde `DRAFT_NOT_COLLECTING`, puis toutes les deux débitent — le verrou `FOR UPDATE` sur
`gl_players` sérialise les débits mais ne les empêche pas si le solde suffit à payer deux
fois. Même schéma pour `resolveDraftApproval`. Résultat : double débit **et** deux événements
`spell_cast`.

**État.** Un correctif existe déjà, **en brouillon non fusionné** : PR #276 (verrou du
brouillon en tête de `finalizeCastTx` + `UPDATE … WHERE status IN ('collecting',
'pending_approval')` + test de concurrence). Sa base est **v1.85.5**, très en retard sur
`main` (v1.100.1) : la reprise demande un rebase, pas une simple fusion.

**Piste.** Reprendre le correctif de la PR #276 sur la base actuelle (c'est un lot à part
entière, hors périmètre de cet audit).

### S3 — 🟠 Contribuer sur un axe non demandé fait payer sans contrepartie

**Constat.** `isDraftReady` (`:370-375`) ne contrôle un total **que si le coût correspondant
est strictement positif**. Pour un sort à `cout_gemmes = 0`, des gemmes déposées dans le pot
ne sont jamais comparées à quoi que ce soit — mais `finalizeCastTx` les **débite** (il débite
toute contribution non nulle). L'écran ne propose pas le champ (`GLSpellCastRosterSection.jsx`
n'affiche l'entrée que si `required.<axe> > 0`), donc ce n'est pas atteignable en jouant
normalement ; une requête `PUT …/contributions` fabriquée, elle, passe.

**Conséquence.** Un joueur peut brûler ses propres gemmes — ou, avec les réglages par défaut
(finding S4), **celles d'un autre joueur** — sans que le sort coûte davantage.

**Piste.** Refuser une contribution sur un axe dont le coût est nul (`400`), ou n'en débiter
que la part requise.

### S4 — 🟠 Les réglages par défaut laissent dépenser la vitalité d'autrui

**Constat.** `spell_cast_team_scope = 'any_team'` autorise un joueur à ouvrir un pot pour
**n'importe quelle équipe** ; `spell_cast_contribution_mode = 'both'` autorise **n'importe qui
à saisir la contribution de n'importe qui** dans le roster de ce pot
(`canSelectTeam:320-327`, `canEditPlayerContribution:329-337`). Le seul garde-fou est un
`window.confirm()` (`GLSpellCastWizard.jsx:216-235`) — confirmé par **la personne qui dépense**,
jamais par celle dont on prend les cœurs. Côté serveur, aucun consentement n'est demandé.

**Conséquence.** Avec les réglages sortis d'usine, un élève peut vider les cœurs et gemmes
d'un camarade d'une autre équipe. Ce n'est pas une faille d'authentification (tout est tracé :
`updated_by_player_id`, `created_by_*`, `launched_by_*`), c'est un **défaut de gouvernance des
défauts**.

**Pistes.** (a) Basculer les défauts sur `own_team` + `self_only` (le plus prudent pour une
classe) ; (b) garder `both` mais exiger un accord côté serveur (le joueur ciblé valide sa part) ;
(c) laisser tel quel et l'écrire noir sur blanc dans le guide du MJ.

### S5 — 🟡 Le tour d'équipe n'est pas contrôlé côté serveur

**Constat.** `assertTurnAllowsTeam()` est un **no-op assumé** (`:339-341`, mode classique :
toutes les équipes jouent en même temps). Mais l'écran, lui, filtre encore les équipes sur
`currentTeamId` quand `turnsEnabled` (`glSpellCastRules.js`, `filterSelectableTeams`). Un
client qui ignore ce filtre lance hors tour sans être refusé.

**Piste.** Trancher : soit le tour n'existe plus pour les sorts et le filtre d'écran tombe,
soit il existe et le serveur le vérifie. Aujourd'hui les deux moitiés se contredisent.

### S6 — 🟡 Les sorts « proposés » se lancent comme les officiels

**Constat.** `loadSpellForChapter` (`:216-243`) ne filtre pas `statut`. Un sort en cours
d'écriture (`statut = 'propose'`), s'il est rattaché à un chapitre, apparaît dans le catalogue
joueur et se lance normalement — seule une pastille le distingue.

**Piste.** Soit exclure `propose` du catalogue de jeu (le statut devient un vrai brouillon),
soit renommer le statut pour qu'il n'annonce pas une garantie qu'il n'offre pas.

### S7 — 🟡 Un sort gratuit est impossible à lancer

**Constat.** `SPELL_ZERO_COST` (`:455-457`) refuse l'ouverture d'un pot si `cout_gemmes` et
`cout_coeurs` sont nuls tous les deux. Cohérent avec un moteur de paiement — mais un sort
purement narratif, sans coût, ne peut alors **pas** passer par l'assistant, ni laisser de
trace au journal.

**Piste.** Autoriser un lancement à coût nul (débit vide, événement quand même) si l'on veut
que le journal reflète tous les sorts.

### S8 — 🟡 `limite_usage` et `cumul` promettent une règle qui n'existe pas

**Constat.** Les deux champs sont saisis, importés/exportés, affichés au joueur — et
**jamais** appliqués : aucun compteur d'usage par partie/équipe/chapitre n'existe en base.
Un sort « une fois par partie » peut être lancé dix fois si les cœurs suivent.

**Piste.** Les matérialiser (le comptage est possible : les pots `status = 'cast'` font
déjà l'historique) ou les marquer explicitement comme consignes pour le MJ.

### S9 — 🟡 La portée solo/collectif n'est pas revérifiée à l'acceptation MJ

**Constat.** `resolveDraftApproval` rejoue la complétude du pot **et** la restriction de
peuple avant de débiter (choix explicite et commenté), mais **pas** `assertCastScope`. Si le
`cast_scope` d'un sort change pendant qu'il attend le MJ, l'acceptation débite quand même.

**Piste.** Symétriser : rejouer `assertCastScope` au même endroit que la restriction de peuple.

### S10 — 🟡 Plusieurs soumissions concurrentes pour le même sort

**Constat.** `findCollectingDraft` ne cherche que les pots `collecting`. Une équipe dont le
sort attend le MJ (`pending_approval`) peut donc **en ouvrir un second** pour le même sort,
l'alimenter et le soumettre. La file de validation affiche alors deux entrées identiques, et
le MJ qui accepte les deux débite deux fois — cette fois-ci légitimement du point de vue du
code, mais sûrement pas du point de vue du jeu.

**Piste.** Refuser l'ouverture d'un nouveau pot tant qu'un pot du même sort est en attente,
ou signaler visuellement le doublon dans la file MJ.

### S11 — 🟡 En mode « MJ seul », les joueurs ne peuvent même plus regarder

**Constat.** `assertSpellCastActorAllowed` est appelé par `handleSpellCastRoute`, donc sur
**toutes** les routes du module, y compris `GET …/drafts/:id`. En `mj_only`, un joueur reçoit
`403` en simple lecture — alors que les événements Socket.IO du pot lui sont **quand même**
diffusés (room de partie). Suivi possible en direct, consultation refusée.

**Piste.** Réserver le refus aux routes d'écriture (`POST`/`PUT`/`DELETE`).

### S12 — 🟡 Notes pédagogiques servies à tout compte GL

**Constat.** `GET /api/gl/spells` et `GET /api/gl/spells/:code` (permission `gl.read`, donc
joueurs et observateurs) renvoient **toute** la ligne, `notes_pedagogiques` et `source`
comprises (`SPELL_LIST_COLUMNS`, `routes/gl/spells.js:78-83`). L'écran joueur ne les affiche
pas ; la réponse réseau, si.

**Piste.** Deux projections : une colonne « joueur » et une colonne « admin ».

### S13 — 🟡 `STAFF_PERMISSIONS` contient une permission de joueur

**Constat.** `STAFF_PERMISSIONS = ['gl.event.emit', 'gl.game.manage', 'gl.mascot.position']`
(`:11`) — or `gl.mascot.position` est **accordée à `gl_player`** (`lib/rbac.js:250`). Seule la
sortie anticipée `userType === 'gl_player'` empêche un joueur d'être reconnu comme staff. La
garde tient aujourd'hui, mais elle repose sur un type d'utilisateur plutôt que sur le droit
lui-même.

**Piste.** Retirer `gl.mascot.position` de la liste (défense en profondeur, aucun changement
de comportement attendu).

### S14 — 🟡 Le journal attribue à une seule équipe un sort payé par tout le plateau

**Constat.** L'événement `spell_cast` porte `team_id = draft.team_id`. En portée `game` (pot
ouvert par le MJ), les contributeurs peuvent venir de **plusieurs équipes** — le journal, lui,
écrit « _L'équipe X lance …_ ». Les contributions détaillées sont bien dans la charge utile,
mais la ligne lisible désigne une seule équipe.

**Piste.** Formuler différemment la ligne de journal quand `roster_scope = 'game'`.

### S15 — 🟡 Écarts documentaires mineurs

- Le message d'erreur `SPELL_CAST_SCHEMA_OUTDATED` cite les migrations **113, 139 et 173** ;
  `docs/API.md` (ligne « launch ») n'en mentionne que **113 et 139**.
- Le doc de référence fonctionnel ne disait pas ce qu'il advient **après** le lancement —
  comblé par ce lot (`docs/reference/gl/economie-marche-sorts.md`).

---

## 8. Couverture de tests

`tests/gl-spell-cast.test.js` (9 cas) et `tests/gl-spell-caster-kind.test.js` couvrent :
module désactivé, sort hors chapitre, débit + événement, `self_only`, `own_team`, `mj_only`,
roster multi-équipes, dépassement de solde, restrictions de peuple. Complété par
`gl-spells-catalog`, `gl-spells-admin-crud`, `gl-spells-validation`, `gl-spells-import-lib`,
`gl-spell-options-lib`, `gl-chapter-spells`.

**Non couvert** : la concurrence (S2 — le test existe, dans la PR #276 non fusionnée), la
contribution sur un axe à coût nul (S3), la portée solo/collectif à l'acceptation MJ (S9), le
doublon de soumission (S10).

---

## 9. Synthèse

| #   | Gravité | Point                                                                  |
| --- | ------- | ---------------------------------------------------------------------- |
| S2  | 🔴      | Double lancement concurrent → double débit (correctif dormant PR #276) |
| S1  | 🟠      | L'effet d'un sort n'est jamais appliqué par le logiciel                |
| S3  | 🟠      | Contribution sur un axe à coût nul : débitée sans contrepartie         |
| S4  | 🟠      | Défauts permissifs : dépenser la vitalité d'un autre joueur            |
| S5  | 🟡      | Tour d'équipe filtré à l'écran, non vérifié au serveur                 |
| S6  | 🟡      | Sorts `propose` lançables comme les officiels                          |
| S7  | 🟡      | Sort à coût nul impossible à lancer                                    |
| S8  | 🟡      | `limite_usage` / `cumul` jamais appliqués                              |
| S9  | 🟡      | Portée solo/collectif non revérifiée à l'acceptation MJ                |
| S10 | 🟡      | Doublons de soumission dans la file de validation                      |
| S11 | 🟡      | `mj_only` bloque aussi la lecture                                      |
| S12 | 🟡      | Notes pédagogiques exposées à tout compte `gl.read`                    |
| S13 | 🟡      | `STAFF_PERMISSIONS` contient une permission de joueur                  |
| S14 | 🟡      | Journal : attribution à une seule équipe                               |
| S15 | 🟡      | Écarts documentaires                                                   |

**Aucun correctif n'est appliqué dans ce lot** : l'audit est un préalable d'arbitrage. Les
points ouverts sont repris comme décisions à trancher dans
[`docs/reference/INCOHERENCES.md`](reference/INCOHERENCES.md) (G11 à G14), et la description
du fonctionnement actuel est ajoutée à
[`docs/reference/gl/economie-marche-sorts.md`](reference/gl/economie-marche-sorts.md).

---

## 10. Pour aller plus loin

[Architecture GL](GL_ARCHITECTURE.md) · [Presets de gameplay](GL_GAMEPLAY_PRESETS.md) ·
[Économie, marché et sortilèges (doc de référence)](reference/gl/economie-marche-sorts.md) ·
[Registre d'arbitrage](reference/INCOHERENCES.md) · [API](API.md)
