# Lot 4 — réécriture du corpus à la voix d'OLU : brief de session

> **Ce document est un prompt de démarrage**, à donner tel quel à une session ultérieure. Il fige
> l'état constaté au moment de sa rédaction (v1.95.1, PR #305) pour que la session suivante ne
> refasse ni l'enquête ni les arbitrages déjà tranchés.

---

## Le prompt

```
Tu prends le lot 4 du chantier OLU sur ForetMap : la réécriture du corpus d'aide et des
parcours de découverte à la première personne, dans la voix d'OLU.

AVANT D'ÉCRIRE UNE LIGNE, lis dans cet ordre :
  1. docs/MASCOT_NARRATEUR_OLU.md — §2 (charte de voix, exemples de conversion, ce qu'OLU ne
     dit jamais), §7 (stratégie de réécriture, les trois gisements), §13 (anti-patterns).
     Le §6bis décrit ce qui est déjà à l'écran, le §11.2 pourquoi le blocage BDD est levé.
  2. docs/LOT4_PROMPT_CORPUS_OLU.md (ce fichier) — état constaté, périmètre, garde-fous.
  3. CLAUDE.md et .cursor/rules/ — conventions projet (tests dans le même lot, doc de
     référence obligatoire dès qu'un comportement visible change, versionnage).
  4. docs/reference/foretmap/visite-et-mascottes.md — ce que les profs lisent aujourd'hui ;
     il porte un « point d'attention » disant que les textes ne sont pas encore à la voix
     d'OLU : il devra tomber à la fin de ce lot.

PÉRIMÈTRE — trois fichiers, rien d'autre :
  - src/constants/discoveryTour.js  : 13 parcours, 21 étapes uniques (dont RELAUNCH_STEP,
    partagé par référence dans les 13 parcours). body + bodyTeacher + title.
  - data/help.default.json          : les 7 panneaux `panels` uniquement.
  - src/constants/help.js           : miroir client des panneaux, à garder STRICTEMENT
    aligné sur help.default.json (il l'est aujourd'hui : 7 panneaux, mêmes titres).

NE PAS TOUCHER (tranché, §7.3) : les 21 `tooltips`, les `mapCanvasHints`, les `realtime`.
Registre fonctionnel, consultés en action, une ligne — la voix n'y a pas sa place.
`quickTips` (3) et `chrome` (4) : à examiner au cas par cas, me demander avant de trancher.

ORDRE DE TRAVAIL — impératif :
  1. Réécris D'ABORD le seul parcours `map` (5 étapes). Arrête-toi, montre-moi le avant/après
     en tableau, et attends ma validation du ton. C'est le pilote : le risque n°1 du lot est
     le ton, pas la technique.
  2. Puis les 12 autres parcours.
  3. Puis les 7 panneaux (help.default.json + miroir help.js).

CONTRAINTES DE VOIX (détail au §2 du plan) :
  - 1 à 3 phrases par bulle. Le corpus actuel est déjà court : ne pas l'allonger.
  - AUCUN emoji dans les textes d'OLU (l'expression passe par le portrait). Les emoji
    décoratifs d'interface existants ne sont pas concernés.
  - Point d'exclamation : au plus un par parcours. Le tiret cadratin et la parenthèse portent
    l'ironie mieux que l'exclamation.
  - Tutoiement. Terminologie « n3beur » / « n3boss » via getRoleTerms() — OLU les emploie, il
    ne les explique pas.
  - `bodyTeacher` : OLU change de SUJET (organisation, outillage), pas de ton.
  - Au plus UN passage « lourd de sens » par parcours, construit en trois temps (le fait nu,
    le poids en une phrase, la sortie concrète ou drôle). Voir l'exemple du noyer au §2.3.
  - Jamais : « n'hésite pas à », s'excuser d'exister, demander validation, commenter sa
    propre blague.

CONTRAINTES TECHNIQUES — les ignorer casse silencieusement :
  - Ne touche NI `target`, NI `placement`, NI `role`. Les cibles sont des sélecteurs CSS
    réels ; une étape dont la cible est absente du DOM est silencieusement ignorée.
  - Le champ `expression` existe déjà sur chaque étape (lot 3). Ajuste-le si le nouveau texte
    l'exige, en restant dans les 8 valeurs canoniques de src/utils/mascotExpressions.js.
    Un test vérifie déjà que seules ces valeurs sont employées.
  - RELAUNCH_STEP est UN objet partagé par les 13 parcours : son texte doit fonctionner
    partout. Ne le dupliquer sous aucun prétexte.
  - Limites Zod (lib/helpContent.js) : panel `title` ≤ 80, item `text`/`textTeacher` ≤ 500,
    tooltip ≤ 300, quickTips ≤ 180, chrome.panelTitlePrefix ≤ 8. Dépasser = texte rejeté.
  - Le nombre d'items par panneau doit rester identique entre help.default.json et
    src/constants/help.js (aujourd'hui : map 4, tasks 4, plants 3, visit 4, profiles 2,
    groups 5, groupFilters 3). Ajouter un item est possible, mais alors dans les DEUX.

CE QUI N'EST PLUS UN PROBLÈME (ne pas le réinstruire) :
  - Le gel des défauts par la BDD est corrigé (v1.95.1) : seule la surcharge est persistée,
    donc réécrire les défauts sera visible partout où un prof n'a rien réécrit.
  - La production ne contient AUCUNE personnalisation de texte (vérifié : registre identique
    aux défauts). Rien à reporter, rien à fusionner.
  - AUCUN test n'assied d'assertion sur une chaîne du corpus — vérifié sur tests/, tests-ui/
    et e2e/. La réécriture ne casse aucun test existant ; les tests structurels
    (expressions canoniques, cibles intactes) doivent continuer de passer.

LIVRABLES ATTENDUS, dans le même lot :
  - Les trois fichiers réécrits.
  - Un test de non-régression du corpus : pas d'emoji dans les body/bodyTeacher des parcours,
    au plus un « ! » par parcours, longueurs sous les limites Zod, miroir help.js ↔
    help.default.json cohérent (même nombre d'items, mêmes titres).
  - docs/reference/foretmap/visite-et-mascottes.md : retirer le point d'attention « les textes
    ne sont pas encore à sa voix » et décrire ce que lisent réellement élèves et profs.
  - docs/MASCOT_NARRATEUR_OLU.md : lot 4 marqué livré (§12 + bandeau d'avancement).
  - CHANGELOG.md sous [Non publié], npm run bump:minor, commit, push, PR draft.
  - Vérifier les autres PR ouvertes qui bumpent package.json / la tête du CHANGELOG pour
    éviter les conflits de merge (règle projet).

APRÈS DÉPLOIEMENT, à rappeler à l'exploitant : si une instance a déjà enregistré des bulles
d'aide avant la v1.95.1, sa ligne en base est encore dense et masque la réécriture. La
commande `node scripts/compact-help-registry.js --apply` la compacte à rendu identique.

DEUX QUESTIONS À ME POSER, pas à trancher seul :
  - `quickTips` et `chrome` : lesquelles portent la voix, lesquelles restent fonctionnelles ?
  - Faut-il rendre les parcours éditables par les profs (§11.4) ? Après passage à la première
    personne, l'écart avec l'aide (éditable) devient visible. Ma position actuelle : l'assumer
    et le documenter, pas l'implémenter dans ce lot.
```

---

## État constaté au moment de la rédaction (v1.95.1)

| Fait                                   | Valeur                                                       |
| -------------------------------------- | ------------------------------------------------------------ |
| Parcours / étapes uniques              | 13 / 21 (dont `RELAUNCH_STEP` partagé 13 fois)               |
| Textes de parcours                     | 21 `body` + 14 `bodyTeacher`                                 |
| Corpus d'aide                          | 21 infobulles, 7 panneaux, 25 items, 7,3 Ko                  |
| Production                             | registre **identique aux défauts** — aucune personnalisation |
| Tests couplés au texte                 | **aucun** (vérifié sur `tests/`, `tests-ui/`, `e2e/`)        |
| Miroir `help.js` ↔ `help.default.json` | aligné (7 panneaux, mêmes titres)                            |

## Ce que les sessions précédentes ont déjà tranché

- **Lots 1, 2, 3, 5 livrés** : bulle + machine à écrire, `MascotSpeaker` + réglage
  `content.help.narrator`, expression par étape + portrait dans les parcours, studio prof
  (Paramètres → Narrateur OLU) + portrait dans l'en-tête d'aide.
- **Dégel du registre** (v1.95.1) : la base ne stocke que la surcharge — c'est ce qui rend le
  lot 4 utile au lieu d'être annulé au premier enregistrement d'un prof.
- **Écarté** : mettre les parcours en base pour ce lot. Analyse dans l'historique — la structure
  (`target`, `placement`, `role`) n'est pas de l'éditorial, et le corpus perdrait Git (revue,
  diff, rollback). Si le besoin d'édition se confirme, la bonne forme est une surcharge **par
  clé** (`content.tour.<parcours>.<étape>.body`) réutilisant l'écran de réglages générique, pas
  un studio dédié — et sûrement pas un snapshot complet.
- **Portrait statique** (pas d'animation) : le réglage n'accepte qu'une image fixe par cadrage.

## Ce que le lot 4 ne doit pas faire

- Toucher au lot 6 (GL) : commits `feat(gl)` séparés, corpus GL par onglet, réglage GL dédié.
- Rendre les parcours éditables (chantier à part entière, cf. §11.4).
- Donner une mémoire à OLU (§11.6 — recommandation : non, c'est le corpus × 2).
