# G&L — Analyse du « Rapport de passation : refonte de l'équilibrage »

> **Objet.** Relecture critique du rapport de refonte de l'équilibrage de _Gnomes & Licornes_,
> **recertifiée sur le code** de `main` (et non sur le dump SQL du 29/06 sur lequel le rapport
> s'appuie). Le document répond aux ⚠️ et aux questions ouvertes du rapport, signale cinq
> problèmes qu'il ne voit pas, et propose un ordre des opérations révisé.
>
> Rédigé le 2026-08-15. Toutes les affirmations « code » ci-dessous sont référencées
> `fichier:ligne` et vérifiables sans accès à la base.
>
> **Portée.** Ce document analyse et propose. Il ne modifie aucun comportement métier
> (cf. `docs/EVOLUTION.md`) : rien n'est décidé ici, tout est soumis.

---

## 0. Le point de méthode, d'abord

Le rapport certifie l'existant sur un **dump de production daté** et signale lui-même
(§5, §8-12) qu'il faut re-certifier. Une bonne partie de ces ⚠️ ne demandent pas de dump :
elles se tranchent en lisant le code, parce qu'elles portent sur ce qui est **câblé**, pas sur
ce qui est **peuplé**. C'est ce qui suit.

La distinction est importante et structure tout le reste :

| Question du type…                            | Se tranche…      |
| -------------------------------------------- | ---------------- |
| « le crédit gemme du quiz est-il auto ? »    | **dans le code** |
| « les 190 feuillets sont-ils importés ? »    | dans la base     |
| « y a-t-il un plafond de cœurs ? »           | **dans le code** |
| « les `cout_gemme` sont-ils toujours à 0 ? » | dans la base     |

---

## 1. Recertification du §5 — ce qui est réellement câblé

| #   | Affirmation du rapport                                 | Verdict                   | Preuve                                                                                                                                                     |
| --- | ------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Le quiz est le robinet principal des gemmes (70-90 %)  | ❌ **Faux dans l'app**    | Voir §2 — aucun crédit de gemme sur le chemin QCM                                                                                                          |
| 2   | Crédit gemme du quiz : auto ou manuel ? (question n°2) | ⚠️ **Ni l'un ni l'autre** | `routes/gl/games/qcm.js:166-185` : une bonne réponse incrémente `gl_team_scores`, **rien d'autre**                                                         |
| 3   | Pas de plafond de cœurs                                | ✅ **Confirmé**           | `lib/glVitality.js:1` — `VITALITY_MAX = 99`, plafond **technique** global, aucun plafond de jeu                                                            |
| 4   | Les 35 sorts sont en `approval_mode = 'auto'`          | ⚠️ **À vérifier en base** | Mais le **levier existe** : `lib/glSpellCast.js:68-73` + réglage `gameplay.spell_cast_approval_mode`                                                       |
| 5   | Sacrifice : 1 cœur → 1 gemme, illimité                 | ⚠️ **Partiellement faux** | `lib/glSpellCast.js:648-651` : un sort **débite uniquement**. Le gain de gemme n'est pas automatisé                                                        |
| 6   | Feuillets : hooks économiques présents mais dormants   | ✅ **Confirmé (câblage)** | `migrations/117_gl_lore_carnet.sql:41-42`, appliqués par `lib/glLoreFeuilletEffects.js:33-67`                                                              |
| 7   | Journal construit mais non motivé                      | ✅ **Confirmé**           | `gl_player_journals` + `_articles` + `_assets` + `_imports` ; zéro lien vitalité                                                                           |
| 8   | Cartes Team Spirit / Job : rien en base                | ✅ **Confirmé**           | Zéro occurrence dans tout le dépôt (code, SQL, docs)                                                                                                       |
| 9   | `gl_market_trades` « scaffoldé »                       | ❌ **Sous-estimé**        | Le marché est **complet et en service** : `lib/glMarket.js`, `routes/gl/market.js`, doc de référence                                                       |
| 10  | Constantes de jeu (§11.2) décrivent le runtime         | ❌ **Faux**               | `migrations/151_gl_game_constants.sql:12-14` : « source **DOCUMENTAIRE** uniquement, NON câblée » ; zéro lecture runtime                                   |
| 11  | « Chasse aux feuillets » = à construire                | ❌ **Déjà à ~70 %**       | `gl_game_feuillet_states` : `status ENUM('locked','discovered','read','held','effaced')`, `unlocked_via`, `discovered_by_player_id` (migrations 117 + 157) |
| 12  | `limite_usage` des sorts encadre les abus              | ❌ **Jamais appliqué**    | `migrations/108_gl_spells_catalog.sql:26` : `VARCHAR(255)` en texte libre, aucune lecture métier                                                           |

---

## 2. Le renversement de diagnostic (le point le plus important)

### 2.1 Le fait

**Aucune ligne de code ne crédite de gemme pour une bonne réponse au QCM.**

- `POST /api/gl/games/:id/qcm/answer` (`routes/gl/games/qcm.js:166-185`) : une bonne réponse
  insère un événement `qcm_answer`, puis un événement `score` et un `+1` dans `gl_team_scores`.
  Aucun `power_points`.
- Les cases quiz ne peuvent **structurellement** pas porter d'effet : `question` et `quiz` sont
  absents de `MARKER_EFFECT_EVENT_TYPES` (`lib/shared/glMarkerEventConfigCore.js:33-40`), et
  `present-arrival` refuse explicitement un repère question avec un 409
  (`routes/gl/games/markers.js:311-313`).
- Côté front, une bonne réponse déclenche `onQcmAnswered`, qui vaut… `reloadGame`
  (`src/gl/AppGL.jsx:825`). Rien de plus.

Les seules entrées de gemmes réellement câblées sont donc :

1. **le geste du MJ** — `POST /games/:id/vitality/player|team`, permission `gl.event.emit` ;
2. les **effets de cases non-question** (Trame, Frontière, Défi, Souffle, Événement…), appliqués
   au clic depuis le popover d'arrivée (`routes/gl/games/markers.js:356`, `:513`) ;
3. les récompenses de feuillets — **cœurs uniquement** (`gain_coeur`).

La doc de référence fonctionnelle le dit d'ailleurs déjà, en toutes lettres
(`docs/reference/gl/economie-marche-sorts.md`, schéma des flux) : les entrées sont
« Ajustements du MJ » et « Récompenses de feuillets ». Le quiz n'y figure pas.

### 2.2 Ce que ça change

**L'audit chiffré du §4 décrit le jeu de plateau papier, pas l'application.** Les ~6,7 à
10 gemmes par plateau, les 46 gemmes annuelles du thésauriseur, les 30 % d'année à sec de
l'élève en difficulté : ce sont les chiffres du **design** appliqué à la main. Ils ne sont pas
faux — ils ne mesurent simplement pas la même chose que ce que fait le logiciel.

Trois conséquences directes :

- **La question ouverte n°3 est gratuite.** « QCM → progression uniquement, jamais de gemmes » :
  il n'y a **rien à retirer**, c'est déjà l'état du code. Mieux, le QCM alimente déjà
  `gl_team_scores` au niveau **équipe** — l'axe _Savoir_ est donc déjà collectif, ce qui est
  exactement ce que demande l'architecture cible (§3).
- **L'effet Matthieu ne passe pas (dans l'app) par le niveau scolaire.** Il passe par
  l'**attention du MJ** : reçoit des gemmes celui dont le MJ pense à créditer l'équipe. C'est un
  autre biais, plus discret, et il heurte frontalement le principe 2.5 — le système actuel
  _exige_ précisément la veille continue qu'Oliv dit ne pas pouvoir tenir.
- **Aucun équilibrage n'est mesurable aujourd'hui.** Tant que le robinet est un geste humain, la
  « simulation post-patch » de l'étape 9.8 n'a pas de ligne de base à laquelle se comparer.

### 2.3 La reformulation que je propose

> La question n'est pas « **comment réduire le robinet quiz ?** » (il n'existe pas),
> mais « **quelles règles automatiser pour que le MJ n'ait plus à arbitrer ?** ».

Cette reformulation ne casse rien de la boussole (§2) ni de l'architecture à trois axes (§3) —
elle les sert. Elle déplace juste l'effort : moins de calibrage de barèmes, plus de câblage de
règles.

---

## 3. Les problématiques du rapport — avis point par point

### 3.1 La fourche pivot « Team Spirit → gemmes » (§7.1) — **oui, et c'est bon marché**

D'accord avec la recommandation de l'assistant, pour une raison que le rapport n'a pas :
**l'infrastructure existe déjà**. `POST /api/gl/games/:id/vitality/team` applique un delta
gemmes/cœurs à **tous les membres d'une équipe** en un appel (`lib/glVitality.js:46-69`).

D'où une mise en œuvre en deux temps, dont le premier ne coûte **aucune table** :

- **Étape 1 — l'écran « bilan d'activité » (recommandé pour démarrer).** Une ligne par équipe,
  un sélecteur « cartes Team Spirit gardées : 0 à 4 », un bouton. Le barème
  (par ex. 1 carte gardée = 1 gemme) vit dans un réglage, pas dans du code. Le système de cartes
  reste **100 % papier** — ce qui est un avantage : rien à saisir pendant l'activité, une seule
  saisie à la fin. Coût réel pour le prof : **6 à 8 clics par séance**, en une fois, à froid.
  C'est le principe 2.5 respecté à la lettre.
- **Étape 2 — la persistance (seulement si le besoin apparaît).** Une table
  `gl_team_activity_cards` si l'on veut l'historique, les statistiques, ou afficher aux élèves
  leur bilan. À ne pas faire d'emblée : c'est du schéma qu'il faudra maintenir pour une valeur
  encore hypothétique.

⚠️ **Une réserve sur l'option « conversion par peuple »** (Licorne → gemmes / Gnome → cœurs) :
le rapport identifie très justement cette dépendance d'ordre en §7.2 pour le bonus de feuillets.
Elle vaut **exactement pareil ici** et le rapport ne le dit pas : tant que les cœurs sont inertes
et sans plafond, « +1 cœur Gnome » est un lot de consolation face à « +1 gemme Licorne ». La
conversion par peuple doit venir **après** la refonte des cœurs, pas avec le pont.

### 3.2 « QCM → progression » (§3, question n°3) — la brique existe aussi

Le socle d'auto-déplacement est déjà là : `lib/glMarkerEffectAutoMove.js`, piloté par le réglage
`gameplay.marker_effect_auto_move_enabled`, avec la résolution de chemin numéroté
(`resolveBoardMovementConfig`). Faire avancer une équipe de N cases sur bonne réponse revient à
brancher ce helper sur le chemin `qcm/answer` — la mécanique de déplacement, elle, est écrite et
testée.

C'est, à mon sens, le meilleur rapport valeur/coût de toute la refonte : ça **matérialise l'axe
Savoir** (le savoir fait avancer le pion, pas le portefeuille), ça supprime un geste MJ, et ça ne
demande aucune table.

### 3.3 La refonte des cœurs (§7.4) — d'accord, avec un angle mort à traiter

Le plafond est simple : deux réglages (`gameplay.max_health_points`, `max_power_points`) et un
clamp dans `applyPlayerVitalityDelta`. **Attention à un piège de mise en œuvre** :
`clampVitality()` est utilisé partout, y compris pour l'affichage et les soldes du marché
(`lib/glRoster.js:21`, `lib/glMarket.js:271`…). Il ne faut pas abaisser `VITALITY_MAX` — il faut
introduire un plafond **de jeu** distinct du plafond **technique**, appliqué au seul point
d'écriture. Sinon des soldes existants (le joueur à 9 cœurs cité par le rapport) seraient
silencieusement tronqués à l'affichage sans être écrits, ce qui produit des incohérences.

**L'angle mort** : les cœurs sont **durables et inter-parties**. Ce n'est pas une hypothèse, la
doc de référence l'écrit — « deux jauges personnelles et durables (elles ne se remettent pas à
zéro entre les parties) ». Un cœur perdu en novembre pour un bavardage traîne donc **jusqu'en
juin**. Cela contredit deux principes du rapport à la fois :

- le corollaire de 2.5 — « les états par défaut doivent être **pleins**, le prof n'intervient que
  sur l'exception » : ici, l'état par défaut dérive vers le bas et personne ne le remonte ;
- le caractère **restauratif** revendiqué en §7.4 : la réparation existe en théorie, mais rien ne
  garantit qu'elle survienne, et l'élève sanctionné en novembre part avec un handicap permanent —
  exactement le « miroir noir » que le rapport craint.

💡 **Proposition** : un réglage **« remise à plein des cœurs au début de chaque chapitre »**. La
sanction porte alors sur la séance ou le chapitre — horizon qu'un élève de 6ème perçoit — et pas
sur l'année. Le pardon devient **structurel**, ce qui est très cohérent avec le non-catastrophisme
du §10 (« tout est toujours réparable »). Et cela rend le plafond bien plus facile à calibrer :
on équilibre sur un chapitre, pas sur une année de dérive cumulée.

### 3.4 La chasse aux feuillets (§7.2) — largement déjà construite

`gl_game_feuillet_states` porte déjà l'essentiel : un statut par (partie, équipe, feuillet) avec
`locked / discovered / read / held / effaced`, le canal de déblocage (`unlocked_via`), le
découvreur (`discovered_by_player_id`, `discovered_by_name`, `discovered_source`), et les
horodatages. Le **verrou de consultation** (« consultable seulement une fois trouvé ») est donc
déjà le modèle en place.

Il manque, concrètement : un champ **`indice`** sur `gl_lore_feuillets`, l'écran **« liste des
feuillets du chapitre »** (trouvés / à trouver), et le **bonus de complétion**.

✅ **Bonne nouvelle pour la question ouverte n°4** : la clef primaire est
`(game_id, team_id, feuillet_code)`, donc l'état est **par équipe** — mais la complétion **classe
entière** se calcule par simple agrégation sur les équipes de la partie, **sans changement de
schéma**. La recommandation « bonus à la classe » du rapport est donc aussi la moins chère.
Les deux arguments convergent : je la retiens sans réserve.

⚠️ **Un piège à désamorcer avant l'import des 190 feuillets.** Le réglage
`gameplay.lore_gemme_costs_enabled` est à **`true` par défaut** (migration 117) et
`lib/glLoreFeuilletEffects.js:47-49` débite `cout_gemme` à la consultation. Si le corpus est
importé avec des coûts non nuls, **consulter un contenu pédagogique devient payant** — et payant
dans la monnaie que, précisément, les élèves en difficulté n'ont pas. C'est la violation la plus
directe possible du principe 2.7 (« les feuillets ne sont pas des robinets de gemmes » — ni des
péages) et du principe 2.1. → **Importer avec `cout_gemme = 0`**, et arbitrer explicitement le
sort du réglage (le mettre à `false`, ou retirer la mécanique).

### 3.5 Le tri des sorts (§7.5) — d'accord, avec deux nuances de coût

- **Le passage en `mj_required` est un vrai quick win, et je recommande de ne pas l'ajourner.**
  Le mécanisme est écrit (`lib/glSpellCast.js:68-73, 745-750`) et il y a même un réglage global
  qui court-circuite le catalogue (`gameplay.spell_cast_approval_mode` : `auto` | `mj_required` |
  `per_spell`). Sécuriser les 5 sorts à impact scolaire réel, c'est un `UPDATE` sur
  `gl_spells.approval_mode` — quelques minutes. Le rapport classe ce point en « risque n°1 »
  (§4.5) tout en le rangeant dans les quick wins volontairement reportés (§6.1). **C'est le seul
  arbitrage du rapport que je conteste** : un risque n°1 dont le correctif coûte dix minutes ne
  devrait pas attendre une refonte d'architecture.
- **Les quotas par trimestre, en revanche, ne sont pas gratuits.** `limite_usage` est du texte
  libre jamais lu (§1, ligne 12). Un vrai plafond demande du code : comptage sur
  `gl_game_events`, ou une petite table de quotas. À budgéter, ne pas supposer acquis.
- **Sur la suppression de sorts** : `Sacrifice` mérite d'être re-regardé avant d'être « gardé ».
  Le rapport le décrit comme une porte dérobée illimitée (1 cœur → 1 gemme) ; dans l'app, il
  **coûte** un cœur et ne rend rien automatiquement (§1, ligne 5). Le sort tel qu'implémenté est
  donc simplement… un malus. C'est un cas où le tri doit se faire sur le comportement réel du
  code, sorts en main.

### 3.6 Le journal (§7.3) — d'accord, une remarque de séquencement

La combinaison (a) collection + (b) clef narrative est la bonne, et l'argument « pas de gemmes »
est solide. Une observation : (a) _« le journal se remplit à la rencontre »_ est un **log
automatique**, donc ce n'est pas une motivation — c'est un décor. La motivation, c'est (b).
La question ouverte n°8 (auto / libre / les deux) se répond alors d'elle-même : **les deux, mais
ce sont deux objets différents**. La collection s'auto-remplit (elle donne à voir le chemin
parcouru) ; l'écriture libre est le geste qui, lui, a un effet narratif. Ne pas les fusionner
dans un même écran, sinon le geste se noie dans le log.

---

## 4. Cinq problèmes que le rapport ne voit pas

### 4.1 🔴 Les cœurs de tous les élèves sont publics — et ils vont porter la conduite

`lib/glMarket.js:258-274` (`listClassmates`) renvoie `healthPoints` et `powerPoints` de **tous
les camarades de la classe** à **n'importe quel joueur**, via le Marché.

Aujourd'hui, c'est anodin : les cœurs ne veulent rien dire. À partir du moment où la décision §6.3
s'applique (« les cœurs portent le comportement individuel réel, substitut de Pronote »), cet
écran devient **l'affichage permanent, à toute la classe, de l'état disciplinaire de chacun**.
Un élève à 1 ❤️ est identifiable par ses 28 camarades, en continu, sans qu'aucun adulte n'ait
rien fait.

C'est le « miroir noir » que le rapport redoute en §7.4 — mais en pire, parce qu'il est
automatique, permanent et sans intention. → **Prérequis absolu à la décision §6.3** : masquer les
cœurs des tiers (n'exposer que les gemmes dans le Marché, ou n'exposer aucun solde et laisser la
négociation le révéler).

### 4.2 ✅ Le Marché annule la sanction — _corrigé_

> **Traité depuis.** Le réglage `gameplay.market_hearts_enabled` (défaut **`false`**,
> migration `174`) restreint le Marché aux gemmes. Le constat ci-dessous décrit l'état
> antérieur, conservé pour la traçabilité de la décision.

`gl_market_trades` permettait à deux joueurs de la même classe de s'échanger **cœurs et gemmes**
(`lib/glMarket.js:206-222`). Un élève qui perd un cœur pour un écart de conduite peut donc en
**racheter un** à un camarade, contre des gemmes, en trois clics.

Ce n'est pas un abus marginal : c'est la conséquence logique de faire porter deux sémantiques
incompatibles au même compteur — une monnaie s'échange, une sanction non. → Si les cœurs portent
la conduite, **restreindre le Marché aux gemmes**. (Bénéfice collatéral : cela renforce
l'asymétrie de valence du §3 — gemmes aspirationnelles et liquides, cœurs défensifs et
inaliénables.)

### 4.3 🟠 Des données de conduite dans une base de jeu

`recordVitalityChangeEvent` persiste un champ `reason` en **texte libre** dans `gl_game_events`,
sans limite de rétention. Le rapport propose d'y déverser l'équivalent des observations Pronote,
c'est-à-dire des appréciations de comportement sur des **mineurs de 11-12 ans**, dans une base
applicative qui n'a pas été conçue pour ça, sur un hébergement qui n'est pas celui de l'ENT.

Ce n'est pas un blocage — c'est un arbitrage à poser **avant** d'implémenter, pas après :
liste **fermée** de motifs (pas de texte libre saisi à chaud), pas de motif visible des pairs,
et une politique de purge. Techniquement peu coûteux si décidé tôt, très pénible à rattraper une
fois trois mois d'événements accumulés.

### 4.4 🟠 « 42 vs 35 cases » n'est pas un écart de constante : c'est une erreur enseignée

Le rapport range l'écart en note de bas de page technique (§11.2). Or `gl_game_constants` est
**documentaire et non câblée** (migration 151), et surtout la migration crée
`gl_game_constant_refs` : **13 liens constante → question du QCM lore**, dont
`('nb_cases_plateau','qcm_lore','LQCM0105')`.

Autrement dit, la constante ne règle aucun comportement, mais elle est la **source de vérité de
questions posées aux élèves**. Si les plateaux réels comptent ~35 cases, une question du QCM
enseigne et valide une réponse fausse. C'est un **bug de contenu pédagogique**, corrigeable
immédiatement et **indépendamment de toute la refonte**.

### 4.5 🟡 Le trou de mesure

L'étape 9.8 demande une « simulation post-patch avant tout déploiement ». Il manque la ligne de
base : personne ne peut dire aujourd'hui combien de gemmes circulent réellement dans une classe.

Bonne nouvelle, la matière première est là : `lib/glPlayerStats.js:38-103`
(`applyVitalityChangeEvent`) **reconstruit déjà les flux de vitalité** en rejouant
`gl_game_events`. Un tableau de bord d'économie (entrées/sorties par joueur, par équipe, par
chapitre) est donc à portée de main — et il devrait venir **avant** la refonte, pas après, sans
quoi on calibrera à l'aveugle et on ne saura pas mesurer l'effet des changements.

---

## 5. Ordre des opérations révisé

L'ordre du §9 est bon sur le fond ; je propose de le réordonner autour d'un principe : **ce qui
ne dépend pas de la fourche pivot ne doit pas l'attendre.**

| Lot   | Contenu                                                                                                                                                                          | Dépend de la fourche ? | Coût   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------ |
| **0** | **Sécurisation** — `mj_required` sur les 5 sorts à impact réel ; masquer les soldes des tiers ; ~~Marché limité aux gemmes~~ (fait, §4.2) ; corriger `nb_cases_plateau` côté QCM | **Non**                | Faible |
| **1** | **Mesure** — tableau de bord d'économie sur `gl_game_events`, ligne de base                                                                                                      | Non                    | Faible |
| **2** | **Cœurs** — plafond de jeu distinct du plafond technique + remise à plein par chapitre                                                                                           | Non                    | Moyen  |
| **3** | **Savoir → progression** — bonne réponse ⇒ avancée, via l'auto-move existant                                                                                                     | Non                    | Moyen  |
| **4** | **Team Spirit → gemmes** — écran « bilan d'activité », sans nouvelle table                                                                                                       | **Oui**                | Moyen  |
| **5** | **Feuillets** — import des 190 avec `indice`, `cout_gemme = 0`, écran de chasse, bonus classe                                                                                    | Non                    | Moyen  |
| **6** | **Sorts** — élagage, consolidation « Répit », quotas par trimestre (vrai code)                                                                                                   | Partiellement          | Moyen  |
| **7** | **Journal** — collection auto + écriture libre à effet narratif                                                                                                                  | Non                    | Moyen  |
| **8** | **Re-simulation** sur données réelles, comparées à la ligne de base du lot 1                                                                                                     | Oui                    | Faible |

Le lot 0 traite le risque n°1 du rapport et les deux 🔴 du §4 ci-dessus. Aucun de ses quatre
points n'attend une décision d'architecture ; tous se défont facilement si l'architecture change.

---

## 6. Réponses proposées aux questions ouvertes du §8

| #   | Question                                       | Réponse proposée                                                                                                          |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Valide-t-on « Team Spirit → gemmes » ?         | **Oui**, en version « bilan d'activité » sans table (§3.1). Réversible, testable en une séance.                           |
| 2   | Crédit gemme du QCM : auto ou manuel ?         | **Inexistant** — tout crédit est un geste MJ (§2.1). Question résolue.                                                    |
| 3   | QCM décorrélé des gemmes : confirmé ?          | **Déjà le cas**. Reste à brancher l'axe _progression_ (§3.2).                                                             |
| 4   | Bonus de complétion : classe ou équipe ?       | **Classe** — c'est la reco du rapport _et_ la moins chère (agrégation, zéro schéma) (§3.4).                               |
| 5   | Arrivée : mini-victoire conservée ?            | **Oui**, garder les deux horizons. Les revoir en même temps que le prix (le +3 gemmes du §4.4 devient un lot du n°4).     |
| 6   | Plafond de cœurs ?                             | **Oui**, 5. Surplus **perdu** (le plus simple, donc le plus tenable) — avec remise à plein par chapitre (§3.3).           |
| 7   | Granularité de la perte de cœur                | **Un seul type, −1, réparable.** Tout palier supplémentaire est du temps de prof, donc du risque d'injustice (2.5).       |
| 8   | Journal : auto, libre, ou les deux ?           | **Les deux, séparés** : la collection s'auto-remplit, l'écriture libre porte l'effet narratif (§3.6).                     |
| 9   | Cartes Question / Joker                        | Hors code — à documenter côté règles papier avant tout câblage.                                                           |
| 10  | Cartes réinitialisées à chaque activité ?      | **Oui** — c'est ce qui fait du bilan d'activité le battement régulier de l'économie, et ce qui rend le barème calibrable. |
| 11  | Consécration : financement, seuil, garde-fou   | **La mécanique existe déjà** — voir ci-dessous.                                                                           |
| 12  | Import des 190 feuillets lancé ?               | À vérifier en base (§7), mais **ne pas lancer avant** d'avoir tranché `cout_gemme` (§3.4).                                |
| 13  | Le système de cartes demande-t-il une veille ? | Réponse de conception : le format « bilan de fin d'activité » garantit que **non** (§3.1).                                |

### Sur la n°11 — la Consécration est déjà techniquement possible

La décision §6.4 (« financée par les gemmes que d'autres joueurs offrent au consacré ») décrit
exactement ce que fait déjà le **pot commun de sortilèges** : `lib/glSpellCast.js` gère des
brouillons de lancement avec **contributions de plusieurs joueurs**, un réglage de portée
(`spellCastTeamScope`, qui peut couvrir **toutes les équipes**) et une **approbation MJ** avant
débit. Une Consécration = un sort à `approval_mode = 'mj_required'`, portée « toutes équipes »,
financé par contributions.

Reste donc à trancher **la règle sociale, pas la technique** : seuil, nombre de consacrés,
garde-fou anti-concours de popularité. Sur ce dernier point, la piste « distribution forcée »
(chacun doit offrir à quelqu'un) est la seule des trois pistes du rapport qui garantit
qu'un élève en marge reçoive quelque chose — les deux autres (abondement du prof, éligibilité au
progrès) atténuent le biais sans le supprimer.

---

## 7. Ce qui reste à certifier en base

Le code ne dit pas ce qui est **peuplé**. Quatre requêtes suffisent à lever les ⚠️ restants :

```sql
-- (a) L'import des 190 feuillets a-t-il été lancé ? (question ouverte n°12)
SELECT COUNT(*) AS total,
       SUM(statut = 'actif') AS actifs
  FROM gl_lore_feuillets;

-- (b) Les feuillets sont-ils payants ? (piège du §3.4)
SELECT COUNT(*) AS avec_cout_gemme,
       MAX(cout_gemme) AS cout_max,
       SUM(gain_coeur <> 0) AS avec_gain_coeur
  FROM gl_lore_feuillets
 WHERE cout_gemme <> 0 OR gain_coeur <> 0;

-- (c) Les sorts à impact réel sont-ils encore en 'auto' ? (risque n°1 du §4.5)
SELECT spell_code, nom, cout_gemmes, cout_coeurs, approval_mode, limite_usage
  FROM gl_spells
 WHERE statut <> 'inactif'
 ORDER BY approval_mode, cout_gemmes DESC;

-- (d) La réalité économique actuelle (ligne de base du lot 1)
SELECT MIN(health_points) AS coeur_min, MAX(health_points) AS coeur_max,
       ROUND(AVG(health_points), 1) AS coeur_moy,
       MIN(power_points) AS gemme_min, MAX(power_points) AS gemme_max,
       ROUND(AVG(power_points), 1) AS gemme_moy,
       COUNT(*) AS joueurs
  FROM gl_players
 WHERE is_active = 1;
```

Le réglage global d'approbation se lit par ailleurs dans `gl_settings`
(`gameplay.spell_cast_approval_mode`) : s'il vaut déjà `mj_required`, le risque n°1 est neutralisé
sans toucher au catalogue.

---

## 8. Ce que je retiens en trois lignes

1. **L'app n'implémente pas l'économie que le rapport audite.** Le robinet maître n'est pas le
   quiz, c'est le geste du MJ — donc le vrai problème d'équilibrage est un problème
   d'**automatisation des règles**, et il heurte le principe 2.5 bien plus que l'effet Matthieu.
2. **Trois briques jugées « à construire » existent déjà** : les états de chasse aux feuillets, le
   pot commun de sortilèges (= Consécration), l'application d'un delta à toute une équipe
   (= Team Spirit → gemmes). La refonte est moins chère que le rapport ne le pense.
3. **Deux points rouges étaient à traiter avant la décision « cœurs = conduite »** : les soldes de
   tous les élèves sont publics, et le Marché permettait de racheter un cœur perdu — **ce second
   point est corrigé** (§4.2). Sans cela, la mécanique de conduite se retourne contre les élèves
   qu'elle cherche à ménager.

---

_Document d'analyse. Aucune décision n'y est actée ; il complète le rapport de passation et
le rapport d'audit chiffré `Audit_Equilibrage_Coeurs_Gemmes_GL.md`._
