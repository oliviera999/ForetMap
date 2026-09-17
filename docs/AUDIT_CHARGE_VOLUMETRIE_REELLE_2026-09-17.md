# Audit — charge des listes sur volumétrie réelle (17 septembre 2026)

**Ce que cet audit vérifie** : les constats de charge des listes (`AUDIT_CHARGE_BIODIVERSITE_2026-09.md`,
`AUDIT_STABILITE_PERF_2026-09.md`) reposaient sur une base **semée**. Un dump de production
importé puis anonymisé permet de les rejouer sur la volumétrie réelle. C'est ce que fait cet
audit.

> **Reproduire ces mesures.** La chaîne d'outillage est livrée
> (`npm run db:import:dump` → `db:anonymize` → `db:fixture:export` / `db:fixture:load`), mais
> l'archive `sql/fixtures/foretmap-anonymise.sql.gz` **n'est pas versionnée à ce jour** : le
> risque de ré-identification par les textes libres demande un arbitrage explicite. En
> attendant, il faut réimporter un dump pour rejouer ces chiffres.

**Verdict** : à la volumétrie d'aujourd'hui, **la charge des listes n'est pas un problème
mesurable**. L'alerte que j'avais formulée la veille — « près d'un mégaoctet pour ouvrir
l'onglet Biodiversité » — **ne survit pas à la mesure** : elle portait sur une taille brute,
alors que toute réponse part compressée. Le correctif de septembre sur la rafale du catalogue,
lui, se confirme et se quantifie enfin : **61 requêtes par ouverture avant, 4 après**.

Troisième résultat, inattendu : la suite e2e **ne teste pas la configuration de
production**. Toute spec qui crée un élève suppose l'inscription libre ouverte, alors que
`ui.auth.allow_register` vaut `false` en production (§ 7).

---

## 1. Méthode

Base : copie anonymisée d'un dump de production, chargée dans `foretmap_local` — **480 comptes, 118 zones, 534 plantes,
94 tâches, 650 questions de quiz, 31 groupes**. Application démarrée en `NODE_ENV=production`
(SPA servie depuis `dist/`), machine 4 vCPU / 15 Gio, MariaDB locale.

Toutes les valeurs ci-dessous sont mesurées, pas estimées. Les mesures réseau sont faites
**avec `Accept-Encoding: gzip`**, c'est-à-dire comme un navigateur — point sur lequel la
première version de ce constat s'était trompée (§ 4).

## 2. Poids des réponses

| Route             | Éléments | Brut   | **Sur le fil (gzip)** | Ratio |
| ----------------- | -------- | ------ | --------------------- | ----- |
| `GET /api/plants` | 534      | 912 Ko | **126 Ko**            | 7,3×  |
| `GET /api/zones`  | 118      | 369 Ko | **94 Ko**             | 3,9×  |
| `GET /api/tasks`  | 84       | 159 Ko | **17 Ko**             | 9,5×  |

Le middleware `compression` est monté pour tout `/api` (`server.js`), à deux exceptions près
(`/socket.io`, exports). Raisonner sur la taille brute revient donc à multiplier le coût réseau
réel par 4 à 10.

Composition du catalogue : aucun champ ne domine. Les six plus lourds — `taxonomy` (79 Ko),
`sources` (33), `description` (31), `photo` (21), `remark_1` (17), `photo_species` (17) — pèsent
ensemble 22 % du total. Il n'y a donc pas de « gros champ » à retirer qui changerait l'ordre de
grandeur : la charge est large et plate, répartie sur 534 lignes.

## 3. Temps de réponse et requêtes SQL

| Route             | À froid (cache vide) | À chaud (moyenne de 5) |
| ----------------- | -------------------- | ---------------------- |
| `GET /api/plants` | 41 ms                | 25 ms                  |
| `GET /api/zones`  | 43 ms                | 29 ms                  |
| `GET /api/tasks`  | 28 ms                | 16 ms                  |

**Pas de N+1** : journal général MariaDB activé, les trois routes totalisent **11 requêtes**
pour un appel chacune. `GET /api/plants` sert ensuite depuis `plantsListCache` — zéro requête
SQL sur les appels suivants.

Le `SELECT *` de `routes/plants.js` est un choix **déjà arbitré** (audit 2026-09, §2.4/§3.7) et
commenté dans le code : le front rend la fiche complète, le formulaire d'édition et les vues
biodiversité depuis les lignes de cette liste, sans second appel. Retirer des colonnes
reviendrait à réintroduire des allers-retours.

Coût de lecture côté client : `JSON.parse` des 902 Ko prend **4,4 ms** sur cette machine
(moyenne de 10). Même en comptant un facteur 5 à 10 pour un téléphone d'entrée de gamme, on
reste dans les dizaines de millisecondes.

## 4. Ce que la mesure infirme

La veille, dans `AUDIT_ENVIRONNEMENT_TESTS_2026-09-16.md` § 5.2, j'écrivais : « près d'un
mégaoctet pour ouvrir l'onglet Biodiversité sur un téléphone en 4G ». **C'est faux**, pour deux
raisons :

1. la mesure omettait `Accept-Encoding: gzip` — un navigateur reçoit **126 Ko**, pas 912 ;
2. elle présentait « sans pagination » comme un défaut, alors que l'absence de pagination est
   un choix documenté, et que la liste est servie depuis un cache mémoire.

Le chiffre brut n'était pas faux, son interprétation l'était. Une taille de sérialisation n'est
pas un coût réseau. Le constat est corrigé dans le document d'origine.

## 5. Ce que la charge confirme

`load/artillery-biodiv.yml` rejoue l'ouverture du catalogue **avant** et **après** le correctif
de septembre (grille dépliée qui montait chaque fiche → vignettes muettes). Rejoué ici sur la
volumétrie réelle, 100 s, plateau à 5 arrivées/s :

| Indicateur              | Valeur                             |
| ----------------------- | ---------------------------------- |
| Requêtes                | **12 122**, toutes en 200          |
| Échecs                  | **0**                              |
| Temps de réponse médian | 2 ms                               |
| p95 / p99 / max         | **10,9 ms** / 22 ms / 49 ms        |
| Utilisateurs virtuels   | 380 (186 « avant », 194 « après ») |

L'arithmétique du total donne la mesure du correctif : 186 × 61 + 194 × 4 = 12 122, soit
exactement le nombre observé. Une ouverture de catalogue coûtait **61 requêtes**, elle en coûte
**4** — un facteur **15**. C'est la première fois que cet écart est mesuré sur des données
réelles ; l'audit de septembre le décrivait sur une base semée.

À noter : le scénario « avant » ne monte que 20 fiches au lieu des 78 réelles, et laisse de côté
le volet « commentaires de contexte » qui demande un jeton. L'écart réel était donc **plus
large** que ce facteur 15.

## 6. Ce qui reste à surveiller

Rien de tout cela ne dit que la production va bien — cette machine n'est pas o2switch, et les
limites LVE CloudLinux ne se simulent pas ici. Trois points méritent une surveillance, aucun
n'appelle de correctif aujourd'hui :

1. **Croissance du catalogue.** À 534 plantes, 126 Ko compressés. La relation est à peu près
   linéaire : un corpus triplé approcherait 380 Ko par ouverture. Un seuil d'alerte autour de
   **1 500 plantes** paraît raisonnable pour rouvrir la question de la pagination.
2. **Le cache est par processus.** `plantsListCache` vit dans la mémoire du processus Node. En
   cas de passage à plusieurs instances, chacune garde sa copie du catalogue enrichi — coût
   mémoire multiplié, et invalidations à coordonner.
3. **Les mesures prod restent aveugles.** `GET /api/admin/diagnostics` donne l'état réel, mais
   demande `DEPLOY_SECRET` (cf. `AUDIT_ENVIRONNEMENT_TESTS_2026-09-16.md` § 6.4). Tant qu'une
   session n'y a pas accès, aucun de ces chiffres ne peut être confronté à la production.

## 7. La suite e2e ne teste pas la configuration de production

Rejouer la suite e2e sur cette base devait dire si la pauvreté du jeu semé expliquait une
partie des échecs. Elle a répondu autre chose, et de plus utile.

Sur base réelle, `e2e/a11y.spec.js` donne **8 échecs pour 4 réussites** (16,8 min). Les seize
erreurs sont identiques :

```
Error: locator.click: Test timeout of 60000ms exceeded.
  - waiting for getByRole('button', { name: 'Créer un compte' })
  at fixtures/auth.fixture.js:57
```

L'échec n'est ni dans l'écran testé, ni dans l'accessibilité : il est à la **première ligne**
du parcours, `loginAsNewStudent`. Le bouton « Créer un compte » n'existe pas.

**Cause** : `ui.auth.allow_register` vaut **`false`** en production. Le réglage est simplement
absent de la base semée, donc actif par défaut. Vérifié par bascule : le même scénario, qui
expirait à 60 s, passe en **8,2 s** une fois le réglage à `true`.

Conséquence, qui dépasse ce fichier de test : **toute spec qui passe par `loginAsNewStudent`
suppose l'inscription libre ouverte.** La suite e2e ne vérifie donc jamais l'application telle
qu'elle tourne réellement — elle vérifie une configuration où n'importe qui crée son compte.
C'est aussi l'explication des échecs en cascade observés lors de la première tentative de
suite complète sur cette base.

Deux sorties possibles, à arbitrer (aucune n'est engagée ici) :

1. **Forcer le réglage dans `e2e/global-setup.js`.** Une ligne, la suite redevient jouable sur
   n'importe quelle base. Mais elle continue de ne pas tester la configuration réelle.
2. **Créer les élèves par l'API d'administration** plutôt que par le formulaire public. Plus de
   travail sur les fixtures, et la suite se rapproche de la production — c'est ainsi que les
   comptes naissent réellement.

La deuxième est la bonne à terme ; la première débloque immédiatement. Le choix appartient au
mainteneur, parce qu'il engage ce que la suite e2e est censée démontrer.

## 8. Recommandation

**Ne rien changer au code pour l'instant.** Les deux leviers évidents — pagination et réduction
des colonnes — ont chacun une raison documentée de ne pas être actionnés, et la mesure ne montre
aucune douleur à la volumétrie actuelle. Ce qui a de la valeur, c'est que ces scénarios tournent
désormais sur des données réelles : `load/artillery-biodiv.yml` peut être rejoué à chaque doute,
depuis n'importe quelle session, sans qu'un dump circule.

---

_Index des audits : [`docs/audits/README.md`](audits/README.md). Fixture et procédure :
[`docs/LOCAL_DEV.md`](LOCAL_DEV.md) § 3._
