# Backlog d’idées — revue et reformulation

> Fichier de travail : idées anciennes confrontées au code et à la doc, pour en dériver
> ensuite des plans d’implémentation détaillés.
>
> **Périmètre :** ForetMap + Gnomes & Licornes (GL).  
> **Statuts :** `absent` | `partiel` | `déjà fait` | `non pertinent` | `besoin données`.  
> Les entrées `déjà fait` / `non pertinent` restent en note courte ; les autres portent une
> reformulation exploitable pour un plan ultérieur.

---

## Lot 1 — 2026-09-08

Sources : prompts anciens (dés↔sorts, visite guidée, feuillets, mascottes, cartes 6ème,
audit économie cœurs/gemmes).

---

### IDEE-001 — Sortilège depuis la fenêtre de dés (avant / après le jet)

| Champ                 | Contenu   |
| --------------------- | --------- |
| **Produit**           | `gl`      |
| **Statut**            | `partiel` |
| **Priorité suggérée** | `haute`   |

**Intention d’origine**  
Dans la fenêtre de jet de dés, un bouton (icône magie) permet de lancer un sort **avant** ou
**après** le jet. Avant : Vitesse, Grande vitesse. Après : Relance, Progression.

**État du code**

- Dés virtuels : dock / popover (`GLVirtualDiceDock`, `GLVirtualDicePopover`), API
  `dice-roll`, module `modules.virtual_dice_enabled`.
- Sortilèges : assistant / pot / file MJ (`GLSpellCastWizard`, `lib/glSpellCast.js`), module
  `modules.spell_cast_enabled` — **indépendants** de la fenêtre de dés.
- Champ catalogue `timing` sur `gl_spells` : affiché, **jamais appliqué** par le logiciel
  (consigne MJ uniquement — cf. `docs/reference/gl/economie-marche-sorts.md`).
- Effets des sorts (déplacement extra, relance, etc.) : **MJ manuel**, pas d’automatisation.

**Critique / pertinence**  
Pertinent : le joueur pense « magie près du dé », pas « autre onglet ». Attention : lier
fortement dés et sorts sans garde-fous augmente la charge MJ et les abus (surtout si un effet
touche le réel). Garder la validation MJ pour les sorts sensibles ; ne pas faire croire que
le logiciel applique Vitesse / Relance tant que l’effet n’est pas câblé.

**Reformulation**  
Depuis le popover de dés, proposer un accès magie contextualisé :

1. **Avant le jet** : ne lister que les sorts dont le timing catalogue est « avant jet »
   (ex. Vitesse, Grande vitesse) et dont le module sorts est actif.
2. **Après le jet** (résultat affiché, avant clôture du tour) : idem pour « après jet »
   (ex. Relance, Progression).
3. Réutiliser le flux de pot / validation existant ; ne pas dupliquer un second lanceur.
4. Phase 1 acceptable : ouvrir l’assistant pré-filtré + rappel du timing au MJ.
   Phase 2 (optionnelle) : automatiser les effets purement plateau (pas scolaires).

**Critères d’acceptation**

- [ ] Icône magie visible dans le popover dés quand `spell_cast` + `virtual_dice` sont actifs.
- [ ] Avant jet : seuls les sorts « avant » du catalogue (filtrés) sont proposés.
- [ ] Après jet : seuls les sorts « après » sont proposés ; indisponible si aucun jet ouvert.
- [ ] Le débit gemmes/cœurs et la file « à appliquer » restent ceux du flux sorts actuel.
- [ ] Doc de référence (`economie-marche-sorts`, guide MJ) mise à jour.

**Pistes techniques**  
`src/gl/components/GLVirtualDicePopover.jsx`, `useGLVirtualDice.js`, `GLSpellCastWizard.jsx`,
filtre sur `gl_spells.timing`, tests `tests/gl-*.test.js` + UI dés/sorts.

**Source** | Lot 1 — prompt dés / magie

---

### IDEE-002 — Mode visite / découverte à la première connexion (par onglet)

| Champ                 | Contenu                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| **Produit**           | `gl` (miroir ForetMap déjà proche)                                       |
| **Statut**            | `déjà fait` (nuance `partiel` si on exige un verrouillage UI progressif) |
| **Priorité suggérée** | `basse` (seulement pour l’écart « révélation structurelle »)             |

**Intention d’origine**  
À la première connexion, pour chaque onglet découvert la première fois, présenter les
éléments petit à petit. Pouvoir relancer le mode visite depuis le bouton d’aide sur chaque
page.

**État du code**

- Visites guidées par onglet : `src/gl/constants/glDiscoveryTour.js`, `GLTourContext`,
  moteur `useGuidedTour` + overlay projecteur (étapes successives).
- Mémoire première visite : `localStorage` (`gl_discovery_seen_v1`).
- Relance : bouton « ? » (`GLHelpDock`) → `onStartTour(tab, { force: true })`.
- Intro cinématique + tutoriels éditoriaux : modules `intro` / `tutorials` / `help`.

**Critique / pertinence**  
L’intention « découverte guidée + relance aide » est **déjà livrée**. L’interprétation plus
forte (« masquer / déverrouiller les contrôles un par un ») n’existe pas et serait lourde
(accessibilité, MJ pressé, invités). Ne la poursuivre que si un besoin terrain clair
apparaît.

**Reformulation (écart optionnel uniquement)**  
Si besoin terrain : mode « première découverte renforcée » où certains panneaux secondaires
restent repliés jusqu’à l’étape de visite correspondante, sans bloquer les actions critiques
du plateau. Sinon : **ne pas replanifier** — enrichir le corpus d’étapes manquantes plutôt
que de reconstruire le moteur.

**Critères d’acceptation (écart optionnel)**

- [ ] Liste explicite des éléments « révélés progressivement » par onglet.
- [ ] Bypass MJ / admin et respect `prefers-reduced-motion`.
- [ ] Relance « ? » conserve le comportement actuel.

**Pistes techniques**  
`glDiscoveryTour.js`, `GuidedTourOverlay`, éventuellement classes CSS `data-gl-tour-locked`.

**Source** | Lot 1 — prompt mode visite

---

### IDEE-003 — Chasse aux feuillets : indices, liste chapitre, bonus avant arrivée, marché

| Champ                 | Contenu   |
| --------------------- | --------- |
| **Produit**           | `gl`      |
| **Statut**            | `partiel` |
| **Priorité suggérée** | `haute`   |

**Intention d’origine**  
Pour chaque chapitre / niveau joueur, la liste complète des feuillets à trouver est visible
avec des **indices**. Consultation / échange seulement une fois trouvé. Si tous les feuillets
du chapitre sont trouvés **avant** qu’une première équipe arrive au repère d’arrivée :
bonus gemmes (licornes) / cœurs (gnomes). Échange possible sur le marché.

**État du code**

- Découverte, verrouillage, carnet (trouvés / verrouillés), coûts/récompenses réglables :
  **faits** (`gl_lore_feuillets`, `gl_game_feuillet_states`, `GLSeleneCarnetView`, zones).
- Marché feuillets : **fait** (`lib/glMarket.js`, côtés feuillet).
- Champ **`indice`**, écran « chasse aux indices », **bonus de complétion avant 1ʳᵉ arrivée** :
  **absents** (écart déjà noté dans `docs/GL_EQUILIBRAGE_ANALYSE_RAPPORT.md` §3.4).
- Bonus « 1ʳᵉ équipe à l’arrivée = 3 gemmes » : promis en contenu / constantes documentaires,
  **souvent non câblé** runtime (voir audit mécaniques).

**Critique / pertinence**  
Très pertinent pédagogiquement. Le marché et le verrou existent déjà : ne pas les refaire.
Le bonus « tous trouvés avant arrivée » crée une course utile **à condition** que l’économie
ait des robinets fiables (sinon bonus cosmétique ou inflationnaire selon le moment).
Préférer un bonus **classe** ou **équipe découvreuse** clairement défini (éviter double
paiement avec la 1ʳᵉ arrivée case).

**Reformulation**

1. Ajouter un **indice** éditable par feuillet (texte court, visible même verrouillé).
2. Vue « chasse du chapitre » : liste complète des feuillets du chapitre courant, statut
   trouvé / à trouver, indice ; contenu intégral seulement si découvert.
3. Règle bonus : si, pour le chapitre, **tous** les feuillets requis sont `discovered+`
   pour au moins une équipe (ou pour la classe — **à trancher**) **avant** le premier
   `present-arrival` sur un repère `arrivee` de ce plateau, créditer le bonus peuple
   (gemmes licornes / cœurs gnomes) une seule fois, journalisé.
4. Conserver l’échange marché uniquement sur feuillets détenus / éligibles (déjà le modèle).

**Critères d’acceptation**

- [ ] Indice visible pour les feuillets non trouvés ; pas le corps du feuillet.
- [ ] Liste chapitre = 100 % du pool jouable du chapitre (pas seulement les trouvés).
- [ ] Bonus déclenché au plus une fois, avec événement journal + vitalité.
- [ ] Si une équipe a déjà touché l’arrivée, le bonus complétion ne se déclenche plus.
- [ ] Marché : pas d’échange d’un feuillet encore `locked` pour l’équipe vendeuse.
- [ ] Doc `chapitres-et-progression` + économie mises à jour.

**Pistes techniques**  
Migration colonne `indice`, import corpus (`gl:import:lore-feuillets`), UI carnet / chasse,
hook sur découverte feuillet + `present-arrival` arrivée, `lib/glVitality.js`, tests GL.

**Décision ouverte**  
Bonus à l’**équipe** qui complète vs **toute la classe** ? Montant du bonus ? Feuillets
« hors chasse » (copiste / liasses) exclus du dénominateur ?

**Source** | Lot 1 — prompt feuillets

---

### IDEE-004 — Revoir les animations mascotte par comportement (pack + planches)

| Champ                 | Contenu                               |
| --------------------- | ------------------------------------- |
| **Produit**           | `commun` (visite ForetMap + packs GL) |
| **Statut**            | `partiel` / `besoin données`          |
| **Priorité suggérée** | `moyenne`                             |

**Intention d’origine**  
À partir d’un pack mascotte exporté et de planches de sprites, revoir les animations par
comportement pour des animations cohérentes et logiques.

**État du code**

- Packs extensibles : états (`states`) + déclencheurs (`triggers` periodic/tap) dans le
  schéma GL ; côté visite : `stateFrames` / `customStates` / `customTriggers`.
- Exemple dépôt : `docs/packs/olu-planches-pack.json` (déjà des états idle/walking/running/
  talk… ; `running` réutilise les frames `walking` à fps plus élevé — candidat à révision).
- Studio : `GLMascotPackManager` / éditeur WYSIWYG ; catalogue visite + sprite library.

**Réponse à la question « nouveaux comportements : fixes ou non ? »**  
**Non, ce n’est pas fixe.** On peut ajouter de nouveaux **états** (clés libres) et de
nouveaux **déclencheurs** (jusqu’à 16 côté GL, types `periodic` | `tap`). En revanche, les
**événements d’interaction visite** du profil (`interactionProfile` / clés runtime plateau)
sont une palette plus stable : on mappe un comportement custom vers un état, on n’invente
pas librement tous les hooks moteur sans code.

**Critique / pertinence**  
Pertinent dès que les planches sont disponibles. Sans assets fournis dans le fil, on ne
peut pas recalibrer les frames ici. Partir du pack OLU / gnome existants + planches
manquant(e)s à déposer.

**Reformulation**  
Passer en revue chaque comportement du pack cible : mapping frame→état, fps, loop,
durée des triggers, distinction marche/course/talk/réaction. Produire un pack validé
(Zod) + preview studio + test de non-régression catalogue. Documenter la table
comportement → animation.

**Critères d’acceptation**

- [ ] Chaque comportement métier listé a une animation dédiée (pas de réemploi incohérent
      sauf intention documentée).
- [ ] Preview studio et runtime plateau / visite jouent les bons états.
- [ ] Pack importable ; `npm run sync:*-pack-lib` si miroir CJS concerné.
- [ ] Tests catalogue / pack verts.

**Pistes techniques**  
`docs/packs/*`, `public/assets/mascots/`, `src/gl/utils/glMascotPack.js`,
`src/utils/visitMascotPack*`, skills mascot spritesheet.

**Bloquant**  
Fournir / pointer le pack exporté + planches du lot (non retrouvés comme pièces jointes
dans cette session — seuls les packs déjà versionnés sont visibles).

**Source** | Lot 1 — prompt mascotte + question comportements

---

### IDEE-005 — Jeu de cartes (2 types) — enseignement scientifique 6ème

| Champ                 | Contenu                                        |
| --------------------- | ---------------------------------------------- |
| **Produit**           | `gl` (hypothèse) / éventuellement hors produit |
| **Statut**            | `absent`                                       |
| **Priorité suggérée** | `moyenne` (après robinets économie)            |

**Intention d’origine**  
Set de cartes de jeu de 2 types. Classe 6ème, enseignement scientifique : travail en
groupe, répartition de rôles, objectif conserver un maximum de cartes.

**État du code**  
Aucune table / UI / mécanique « cartes Team Spirit / Job » dans le dépôt. Les audits
(`audit-mecaniques-2026-08.md` option B1, `GL_EQUILIBRAGE_ANALYSE_RAPPORT.md`) traitent
déjà l’idée **Team Spirit → gemmes** comme pont papier→app, non construit. La composition
d’équipes (`roles` dans les recettes) est un brassage de profils, **pas** ce jeu de cartes.

**Critique / pertinence**  
Pertinent comme **activité de séance** et comme **robinet d’économie** (bilan → gemmes),
mais le prompt est incomplet (règles des 2 types, lien exact avec le plateau, digital vs
papier). Numériser un jeu de cartes complet est cher ; un **écran bilan** « cartes gardées
0–N → crédit gemmes » est le pont le moins cher (déjà recommandé dans les audits).

**Reformulation (cible produit)**

1. Clarifier les 2 types (ex. Team Spirit / Job) et les règles de conservation.
2. Court terme : activité **papier** + saisie MJ/joueur du score de cartes → crédit gemmes
   (barème configurable, une fois par plateau).
3. Moyen terme (optionnel) : inventaire digital des cartes par équipe.  
   Ne pas bloquer l’équilibrage global sur la version digitale complète.

**Critères d’acceptation (phase bilan)**

- [ ] Barème documenté (cartes gardées → gemmes) dans les réglages ou constantes de jeu.
- [ ] Saisie en fin d’activité, journalisée, plafonnable.
- [ ] Pas d’effet scolaire réel automatique.
- [ ] Doc économie + guide MJ.

**Bloquant**  
Set de cartes mentionné non trouvé dans le dépôt / pièces jointes de session — à fournir
ou décrire (noms des 2 types, barème).

**Source** | Lot 1 — prompt cartes 6ème

---

### IDEE-006 — Audit / équilibrage cœurs–gemmes, sorts, 5 plateaux / an

| Champ                 | Contenu                                                          |
| --------------------- | ---------------------------------------------------------------- |
| **Produit**           | `gl`                                                             |
| **Statut**            | `partiel` (audits écrits) + `besoin données` (re-certif terrain) |
| **Priorité suggérée** | `haute`                                                          |

**Intention d’origine**  
Analyser depuis la BDD le fonctionnement cœurs/gemmes, l’équilibre de jouabilité lié aux
sortilèges, 5 plateaux sur l’année, scénarios trop / pas assez de ressources ; audit
général des mécaniques ; synthèse pour équilibrage futur. Rappel : sorts à impact réel.

**État du code / doc**

- Audits déjà structurants :
  - `docs/reference/gl/audit-mecaniques-2026-08.md` (certif 23/08/2026),
  - `docs/GL_EQUILIBRAGE_ANALYSE_RAPPORT.md`,
  - `docs/reference/gl/economie-marche-sorts.md`.
- Constat central encore valide conceptuellement : économie longtemps **inerte** en séance
  (peu ou pas de crédits auto) alors que les sorts **débitent** et que certaines cases
  **promettent** des gains conditionnels non exprimables par le moteur.
- Correctifs déjà faits selon audit août : validation MJ sur sorts à impact scolaire ;
  plafond de vitalité réglable.
- Constantes « 5 plateaux » : surtout **documentaires**, pas un simulateur runtime.

**Critique / pertinence**  
Ne **pas** refaire un audit from scratch : s’appuyer sur les docs ci-dessus, puis
**re-certifier** sur un dump / parties récentes (post-correctifs) et trancher les options
A–E de l’audit mécaniques. L’équilibrage « futur » est surtout un problème de **câblage des
promesses** (QCM, 1ʳᵉ arrivée, feuillets) + **garde-fous sorts réels**, pas de retoucher
des chiffres d’inflation imaginaire.

#### Synthèse détaillée (pour plan futur)

**Ce qui fait gagner**

| Source                               | Câblé ?                      | Notes                                         |
| ------------------------------------ | ---------------------------- | --------------------------------------------- |
| Ajustement MJ                        | oui                          | Principal robinet réel observé historiquement |
| Effets de cases non-question         | partiel                      | Texte vs config machine souvent divergents    |
| QCM bonne réponse                    | non (score équipe seulement) | Promesses « +gemme si réussi » non tenues     |
| 1ʳᵉ arrivée / bonus feuillet complet | non / absent                 | Constantes ou design non runtime              |
| Récompense feuillet (`gain_coeur`)   | oui si réglage               | Utile mais asymétrique (cœurs, pas gemmes)    |

**Ce qui fait perdre / consommer**

| Source                        | Câblé ?          | Notes                                          |
| ----------------------------- | ---------------- | ---------------------------------------------- |
| Coût des sorts (gemmes/cœurs) | oui              | Effet fictionnel = MJ ; scolaire = MJ required |
| Consultation feuillet payante | oui si coûts > 0 | Dangereux si pas de revenus                    |
| Marché (échange gemmes)       | oui              | Cœurs non échangeables par défaut              |
| Malus cases                   | partiel          | Même problème promesse / moteur                |

**Scénarios (5 plateaux / an)**

1. **Statu quo inerte** : peu de gains auto → sorts chers inaccessibles ou entièrement
   dépendants du MJ → frustration / sentiment d’arbitraire.
2. **On ouvre tous les robinets case/QCM tels quels** : risque d’accumulation si les
   promesses « +1/+2 gemmes » deviennent vraies sans plafond ni puits — surtout avec sorts
   fictionnels peu chers.
3. **Pont activité (cartes / bilan) + plafonds** : revenus prévisibles par séance, lisibles
   en 6ème, pilotables (option B des audits).
4. **Sorts à impact réel** : même rares, ils obligent validation MJ + quotas ; sinon
   avantage scolaire achetable = hors jeu équitable.

**Résumé pour équilibrage futur**

1. Re-mesurer les flux sur parties post-août 2026 (événements vitalité, sorts, feuillets).
2. Câbler ou retirer les **promesses affichées** (fiabilité > richesse).
3. Choisir **un** robinet principal prévisible (bilan cartes / arrivée / QCM plafonné).
4. Garder sorts scolaires sous MJ + plafonds ; séparer clairement fiction / réel.
5. Simuler 5 plateaux avec le barème choisi avant de toucher les coûts du catalogue.

**Reformulation (livrable suivant)**  
Produit attendu : note d’arbitrage « Économie GL — décision » (pas un nouvel audit
exploratoire) : robinet retenu, barèmes, plafonds, liste des cases à réparer, sorts
concernés, plan de tests sur 1 puis 5 plateaux.

**Critères d’acceptation**

- [ ] Dump / journal de parties daté cité (ou constat « pas de nouvelles données »).
- [ ] Tableau gains/pertes **câblés vs promis** à jour.
- [ ] Décision écrite sur QCM→gemmes, 1ʳᵉ arrivée, bonus feuillets, pont cartes.
- [ ] Liste des sorts à impact réel et mode d’approbation vérifiés en base.
- [ ] Scénarios min / médian / max sur 5 plateaux chiffrés avec le barème choisi.

**Pistes techniques**  
Scripts d’analyse journal `gl_game_events`, `lib/glVitality.js`, `lib/glSpellCast.js`,
`glMarkerEventConfigCore`, docs reference déjà cités.

**Source** | Lot 1 — prompt audit économie

---

### IDEE-007 — Tous les feuillets de Sélène récupérables (tout moment, toute partie)

| Champ                 | Contenu                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| **Produit**           | `gl`                                                                   |
| **Statut**            | `partiel` (canaux nombreux, **exhaustivité non garantie** aujourd’hui) |
| **Priorité suggérée** | `haute`                                                                |

**Intention d’origine**  
Les feuillets de Sélène doivent **tous** être récupérables d’une manière ou d’une autre,
**quel que soit le moment du jeu** et **quelle que soit la partie**.

**État du code**

- Canaux existants : zones carte, ouverture (`offert_ouverture`), clôture / liasse copiste,
  étude espèce, marquage appris (acquisition ③ → pool chapitre), marché, remise MJ de
  liasse.
- Choix produit **explicite** dans `lib/glFeuilletAcquisition.js` : _« Pas de filet de
  clôture : l’exhaustivité n’est pas garantie »_.
- Classification admin des **orphelins** (`glFeuilletChannelClassify`) : feuillet sans
  zone, sans `lien_*`, sans biome/plateau/pays → **inattaignable** par les canaux connus.
- Pool d’acquisition limité au **chapitre courant** (biome ∪ plateau ∪ pays) : un feuillet
  hors scope du chapitre joué n’entre pas dans le tirage ③.
- Liste joueur scopée aux biomes des chapitres déjà joués ∪ déjà trouvés : un feuillet
  « d’un autre arc » peut rester invisible / hors périmètre.
- Doc référence (`chapitres-et-progression.md`) décrit les canaux mais **ne promet pas**
  l’exhaustivité ; la liasse copiste est même **volontairement tardive** (fin plateau 5).

**Critique / pertinence**  
Pertinent et **renverse** le choix « exhaustivité non garantie ». Attention aux tensions :

1. **Spoiler** : certains feuillets (fin, liasse copiste) sont tardifs **par design** —
   « récupérable » ≠ « lisible dès la séance 1 ». On peut les rendre _obtenables_ via un
   filet **sans** lever le verrou narratif trop tôt (ex. remise MJ / fin de partie / hunt
   avec spoiler max).
2. **« Quelle que soit la partie »** : une classe qui ne joue pas le plateau 5, ou qui
   change de partie entre chapitres, ne doit pas perdre définitivement l’accès au corpus.
3. **Ne pas tout déverser dans le pool ③** : noyer le tirage aléatoire avec 200 feuillets
   casse la chasse. Mieux : **couverture corpus** (zéro orphelin) + **filet de clôture**
   (MJ / fin de chapitre / fin d’année) + éventuellement chase (IDEE-003).

**Reformulation**  
Garantir une **couverture d’obtention à 100 %** du catalogue `actif` (hors archivés) :

- Tout feuillet a **au moins un** canal déclaré (zone, lien, pool, ouverture, clôture, ou
  filet admin).
- Un **filet MJ** (seul) permet d’attribuer les restants : unitaire, multi-sélection ou
  lot ; destinataires = joueur(s) et/ou équipe(s) ; y compris feuillets hors chapitre
  courant.
- Une partie qui s’arrête avant le plateau 5 peut récupérer liasse / restants **via le MJ**.
- L’admin vise un **compteur d’orphelins = 0** (garde-fou d’édition).
- Les remises MJ sont **exclues** du bonus de chasse (IDEE-003).

**Critères d’acceptation**

- [ ] Aucun feuillet `actif` classé `orphan` en prod après backfill / rattachement.
- [ ] Le MJ peut remettre **tout** feuillet manquant (hors chapitre inclus) en unitaire,
      multi ou lot, à des joueurs et/ou des équipes.
- [ ] Filet utilisable **avant** la fin d’année / hors plateau 5.
- [ ] Les feuillets « sensibles spoiler » restent sous contrôle MJ (pas de remise auto).
- [ ] `unlocked_via = mj_grant` exclu du bonus chasse.
- [ ] Doc référence : promesse d’exhaustivité + comment le MJ complète une classe.
- [ ] Test : corpus fixture → 0 orphelin ; scénario « partie courte » → remise complète
      possible via MJ.

**Pistes techniques**  
`glFeuilletAcquisition.js` (retirer / inverser le commentaire « pas de filet »),
`glFeuilletBundleGrant.js`, `glFeuilletChannelClassify.js`, console MJ, vue d’ensemble
admin feuillets, réglage éventuel `lore_feuillet_closure_net_enabled`, IDEE-003 (indices).

**Décisions tranchées** (2026-09-08)

| #   | Décision                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Filet **MJ seul** (pas de remise auto fin de chapitre en V1).                                                                                                                         |
| D2  | Remise **hors chapitre** autorisée. Modes : **unitaire**, **sélection multiple**, ou **lot** (filtre chapitre / plateau / liasse / tous). Cibles : **joueur(s)** et/ou **équipe(s)**. |
| D5  | Les grants MJ **ne comptent pas** pour le bonus de chasse (IDEE-003).                                                                                                                 |

**Source** | Lot 1+ — prompt exhaustivité feuillets (2026-09-08)

---

## Index rapide

| ID       | Titre                                | Statut                   | Priorité |
| -------- | ------------------------------------ | ------------------------ | -------- |
| IDEE-001 | Magie dans la fenêtre de dés         | partiel                  | haute    |
| IDEE-002 | Mode visite / découverte             | déjà fait (± écart UI)   | basse    |
| IDEE-003 | Feuillets : indices + bonus + marché | partiel                  | haute    |
| IDEE-004 | Animations pack mascotte             | partiel / besoin données | moyenne  |
| IDEE-005 | Jeu de cartes 6ème                   | absent                   | moyenne  |
| IDEE-006 | Équilibrage cœurs/gemmes & sorts     | partiel + besoin données | haute    |
| IDEE-007 | Feuillets tous récupérables          | partiel                  | haute    |

---

## Plans d’implémentation détaillés

> Ces plans sont la marche à suivre pour un agent / une PR. Ordre recommandé des lots
> code : **007 → 003 → 001**, et **006 en parallèle** (arbitrage doc, peu de code tant
> que les décisions ne sont pas tranchées). 004 / 005 restent bloqués aux assets / règles.

### Dépendances

```text
IDEE-006 (arbitrage économie) ─────────────────────────────┐
                                                           ├─► barèmes bonus feuillets / sorts
IDEE-007 (exhaustivité + filet) ──► IDEE-003 (chasse/indices/bonus)
IDEE-001 (dés ↔ sorts) — indépendant, après ou en parallèle de 006 pour les sorts « plateau »
```

---

### Plan A — IDEE-007 : exhaustivité des feuillets

#### A.0 Objectif

Aucun feuillet `actif` du carnet de Sélène n’est structurellement inatteignable. Toute
équipe peut, dans **n’importe quelle** partie, compléter son carnet via canaux de jeu
**ou** filet (MJ / clôture), sans dépendre d’avoir joué exactement les 5 plateaux ni d’un
tirage ③ chanceux.

#### A.1 Décisions tranchées (2026-09-08)

| #   | Décision                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Filet **MJ seul** (pas d’auto fin de chapitre en V1) + panneau « manquants ».                                                                                                                                                                                              |
| D2  | Remise **hors chapitre** OK. Modes UI : **individuel**, **sélection multiple**, **lot** (filtres chapitre / plateau / liasse / tous actifs).                                                                                                                               |
| D2b | Cibles : **joueur(s)** et **équipe(s)** (pas seulement l’équipe). Attribution joueur = découverte au nom du joueur pour son équipe (état équipe + `discovered_by_*`), sauf règle contraire à expliciter en implémentation si un inventaire strictement personnel apparaît. |
| D3  | Hors chapitres joués : remettables par le MJ ; en chasse joueur, visibles seulement si chapitre ouvert **ou** déjà trouvés (inchangé côté liste joueur).                                                                                                                   |
| D4  | Orphelins corpus : warning fort / mode strict à l’édition (phase A3).                                                                                                                                                                                                      |
| D5  | Grants MJ **exclus** du dénominateur / déclencheur du bonus chasse (IDEE-003).                                                                                                                                                                                             |

#### A.2 Phases

**Phase A1 — Mesure & hygiene corpus (sans changer le runtime joueur)**

1. Script ou endpoint admin : liste des orphelins + feuillets jamais découverts sur N
   dernières parties (diagnostic).
2. Backfill data : rattacher biome / plateau / `lien_*` / zone / `offert_ouverture` pour
   viser **0 orphelin** (comme le backfill cop-bio déjà fait).
3. Documenter dans `data/gl/README.md` la règle « tout feuillet actif a un canal ».

**Phase A2 — Filet MJ générique (cœur livrable)**

1. Nouveau helper (étendre `glFeuilletBundleGrant` ou `grantFeuilletsByMj`) :
   - entrée : `gameId` ;
     cibles = liste d’`teamId` et/ou de `playerId` (résolution joueur → son équipe) ;
     codes = un code **ou** liste (sélection multiple) **ou** lot via filtre
     (`chapterId` \| `plateau` \| `liasse` \| `all` / manquants seulement) ;
     option `respectSpoiler`.
   - `unlocked_via = 'mj_grant'` (valeur stable, **exclue du bonus chasse**).
   - idempotent : déjà trouvé → no-op pour cette cible.
2. Console MJ : panneau « Remise de feuillets » —
   - liste manquants (par équipe / joueur) ;
   - sélection unitaire / multi / « tout le filtre » ;
   - choix destinataires (équipes et/ou joueurs de la partie).
3. Permission `gl.game.manage` ; journal `feuillet_discovered` + métadonnées
   (`via: mj_grant`, acteur MJ, cibles).
4. **Pas** de coûts gemmes / effacement sur remise filet (comme liasses).
5. **Pas** de phase auto fin de chapitre (hors scope V1 — D1).

**Phase A3 — Garde-fou édition + promesse produit**

1. À l’UPSERT admin / import : si `classifyFeuilletChannel` → `orphan`, warning fort
   (bloquant en mode strict réglable).
2. Inverser le commentaire acquisition : exhaustivité = **objectif produit** ; picking ③
   reste non exhaustif en séance ; le filet MJ complète.
3. Mettre à jour `docs/reference/gl/chapitres-et-progression.md` (présent) +
   `AUDIT_FEUILLETS_ACCES.md` (addendum) + `API.md`.

#### A.3 Fichiers / zones

- `lib/glFeuilletAcquisition.js`, `lib/glFeuilletBundleGrant.js`,
  `lib/glFeuilletChannelClassify.js`
- `routes/gl/games/*` ou `routes/gl/lore.js` (endpoint grant)
- `src/gl/components/GLGameMasterConsole.jsx` (+ éventuel sous-composant)
- Admin feuillets (vue d’ensemble orphelins)
- Tests : `tests/gl-feuillet-acquisition*.test.js`, nouveau `gl-feuillet-closure-grant.test.js`
- Doc : `chapitres-et-progression.md`, `API.md`, `CHANGELOG`

#### A.4 Critères de done

- [ ] 0 orphelin sur corpus de référence (fixture test + procédure prod)
- [ ] MJ peut remettre tous les manquants d’une équipe en une action filtrée
- [ ] Partie plateau 1 seule : liasse / feuillets tardifs remettables sans passer en P5
- [ ] Tests + doc référence

#### A.5 Risques

- Spoiler si filet « tous » trop tôt → mitiger par D1/D5 + spoiler max.
- Inflation du carnet sans gameplay → le filet doit rester exception / fin de séance.
- Double attribution marché / grant → upsert idempotent (déjà le modèle états).

---

### Plan B — IDEE-003 : chasse, indices, bonus (après A1 au minimum)

#### B.0 Objectif

Rendre la chasse lisible (liste + indices), conserver verrou / marché, ajouter bonus
peuple si complétion **avant** première arrivée — **sans** que le filet MJ (007) valide
le bonus.

#### B.1 Phases

**B1 — Donnée `indice`**

1. Migration `NNN_gl_lore_feuillets_indice.sql` (TEXT nullable).
2. Import XLSX + édition admin + export template.
3. API liste : exposer `indice` même si `progressStatus: locked` ; jamais le corps.

**B2 — UI chasse**

1. Vue / mode « À trouver » dans le carnet : 100 % du pool **chapitre courant** (aligné
   `resolveChapterFeuilletPool`), pastille statut, indice.
2. Feuillets hors pool : hors liste chasse (sauf déjà trouvés) — cohérence avec 007 D3.

**B3 — Bonus complétion avant arrivée**

1. Détecteur : tous les feuillets du **dénominateur chasse** (exclure liasses filet /
   `offert_ouverture` ? → encore à trancher à l’implémentation 003) sont découverts
   pour l’équipe **par un canal de jeu** (`unlocked_via` ∉ {`mj_grant`, …}) **et** aucun
   event d’arrivée `arrivee` encore pour la partie (ou pour le chapitre).
2. Crédit unique : gemmes si licorne, cœurs si gnome (montants réglables / constantes).
3. Flag `completion_bonus_granted` (table partie ou event dédup).
4. **Exclusion ferme (D5)** : un feuillet obtenu uniquement via `mj_grant` ne satisfait
   pas le bonus ; si le MJ a comblé des trous, le bonus ne se déclenche pas « pour autant ».

**B4 — Marché**

1. Vérifier / renforcer : vendeur doit détenir un état découvert+ ; pas de vente `locked`.
2. Doc marché alignée.

#### B.2 Tests & doc

- Tests accès preview + indice, bonus (cas : complète avant / après arrivée / avec grant MJ).
- `chapitres-et-progression.md`, `economie-marche-sorts.md`.

---

### Plan C — IDEE-001 : magie dans la fenêtre de dés

#### C.0 Objectif

Raccourci UX dés → sorts filtrés par timing ; **sans** prétendre automatiser les effets
scolaires.

#### C.1 Phases

**C1 — UX + filtre (livrable minimal)**

1. Normaliser / documenter les valeurs `timing` du catalogue (avant_jet / apres_jet /
   libre / …) — audit des libellés existants en base.
2. Bouton icône magie dans `GLVirtualDicePopover` :
   - avant jet → ouvre assistant / liste filtrée `avant_*` ;
   - après jet (résultat visible) → filtre `apres_*`.
3. Si module sorts off : bouton masqué.
4. Tests UI + éventuel test filtre pur.

**C2 — Rappels MJ**

1. À l’ouverture depuis les dés, préremplir le contexte « lié au jet #n / équipe ».
2. File « à appliquer » inchangée.

**C3 (optionnel) — Effets plateau auto**

1. Uniquement sorts fictionnels whitelist (Vitesse = +N cases, Relance = reroll dé).
2. Hors scope tant que 006 n’a pas tranché l’économie / charge MJ.

#### C.2 Hors scope C1

Automatiser Esquive / Consécration / etc. — **interdit** sans MJ.

---

### Plan D — IDEE-006 : équilibrage (piste doc + mesures)

#### D.0 Objectif

Note d’**arbitrage** (pas un 3ᵉ audit exploratoire), fondée sur
`audit-mecaniques-2026-08.md` + dump récent.

#### D.1 Étapes

1. Extraire du journal prod (post-correctifs) : counts `vitality_*`, `spell_cast`,
   `marker_effect` non nuls, `feuillet_*`.
2. Mettre à jour le tableau « promis vs câblé » des cases.
3. Trancher : robinet principal (B1 cartes / arrivée / QCM plafonné / MJ-only).
4. Fixer barèmes IDEE-003 bonus + coûts sorts fictionnels.
5. Rédiger `docs/reference/gl/economie-arbitrage-YYYY-MM.md` (ou section dans audit) avec
   décision + plan de câblage (PR futures).
6. **Pas de bump de coûts en prod** avant scénarios 5 plateaux chiffrés.

#### D.2 Lien avec le reste

- Sans robinet fiable, le bonus feuillets (003) et les sorts depuis les dés (001) restent
  cosmétique ou punitifs.
- 007 filet ne doit pas devenir un robinet économique (pas de `gain_coeur` sur grant).

---

### Plan E — IDEE-004 / 005 (rappel court)

- **004** : attendre pack + planches ; puis table comportement→frames ; pas de changement
  schéma majeur (états déjà extensibles).
- **005** : clarifier les 2 types de cartes ; V1 = écran bilan → gemmes (pont économie),
  pas le moteur de cartes complet.

---

## Prochains lots

_À compléter au fur et à mesure des prompts suivants._
