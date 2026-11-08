# Moteur de badges commun — ForetMap et Gnomes & Licornes

> Pour qui : développeurs. Doc fonctionnelle (profs, admins) :
> [`reference/foretmap/badges.md`](reference/foretmap/badges.md).

Les badges de la forêt sont la **première instance** d'un moteur générique. Gnomes & Licornes
(G&L) aura le même type de système — paliers, badges décernés par le MJ, célébration avec OLU,
vitrine sans classement — mais pour d'**autres réalisations** (quêtes, sorts, chapitres…). Le
code est donc coupé en trois étages : ce qui est commun, ce qui est propre à un produit, et ce
qui reste dans chaque produit (routes, droits, écrans).

## 1. Les trois étages

| Étage                     | Fichiers                                                                                                                                                                                                                                                                                                                          | Contient                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Noyau partagé** (pur)   | `src/shared/rewards/rewardsCore.js` → miroir `lib/shared/rewardsCore.js`                                                                                                                                                                                                                                                          | Paliers 🌸/🌼/🍎, forme des clés, lecteur de clés, palier atteint, entrée publique, contrôle d'un catalogue, libellés (pluriel, progression), texte d'annonce |
| **Moteur serveur**        | `lib/rewards/core/engine.js` (`createRewardsEngine`)                                                                                                                                                                                                                                                                              | Évaluation (`INSERT IGNORE`, jamais de retrait), progression, vitrine, badge décerné (mot obligatoire), « vu », fusion de comptes                             |
| **Interface commune**     | `src/shared/rewards/RewardsPanel.jsx`, `RewardCelebration.jsx`, `useRewardsCelebration.js`, `src/shared/utils/oluRewardsVoice.js`                                                                                                                                                                                                 | Panneau par famille (consultation ou élève), célébration regroupée avec OLU, une seule célébration par badge et par page                                      |
| **Instance d'un produit** | Forêt : `lib/rewards/foretEngine.js`, `catalog.js`, `metrics.js`, `routes/rewards.js`, `src/components/rewards/` ; G&L : `lib/glRewards.js`, `glRewardsCatalog.js`, `glRewardsMetrics.js`, `glRewardsHooks.js`, `glRewardsBatch.js`, `routes/gl/rewards.js`, `src/gl/components/GLRewardsPanel.jsx`, `mj/GLTenirRewardsPanel.jsx` | Catalogue, familles, mesures SQL, table de rangement, éligibilité, routes et droits, écrans qui chargent les données                                          |

Le noyau et le moteur ne connaissent **aucun** catalogue, aucune table, aucune route.

## 2. Créer l'instance d'un produit

```js
const { createRewardsEngine } = require('../rewards/core/engine');

const glRewards = createRewardsEngine({
  product: 'gl',
  catalogue: GL_REWARD_CATALOGUE, // entrées { key, family, emoji, title, description, tiers?, unit?, source, metric? }
  families: GL_REWARD_FAMILIES, // [{ key, label }] dans l'ordre d'affichage
  store: { table: 'gl_player_rewards', ownerColumn: 'player_id' },
  createMetricContext: (db, playerId) => ({ value: async (metric) => /* une requête agrégée */ 0 }),
  isEligible: async (playerId, db) => true, // familles de `restrictedFamilies` seulement
  restrictedFamilies: [],
  loadOwnerNames: async (ids, db) => [{ id, name }], // vitrine du MJ
});
```

- **Table de rangement** : mêmes colonnes que `user_rewards` (`reward_key VARCHAR(64)`,
  `source_type`, `source_ref`, `awarded_at`, `awarded_by_user_id`, `note`, `seen_at`), clé
  primaire `(<propriétaire>, reward_key)`. Les noms de table et de colonne sont contrôlés au
  chargement (identifiants simples uniquement).
- **Catalogue** : contrôlé au chargement (`assertValidCatalogue`) — clés uniques, sources
  `auto` / `event` / `manual`, 1 à 3 paliers, clés enregistrées ≤ 64 caractères.
- **Mesures** : une requête agrégée par mesure, mémorisée le temps d'une évaluation (voir
  `lib/rewards/metrics.js`, `createMetricContext`).
- **Paliers par instance** (8 novembre 2026) : `tiers` de `createRewardsEngine` (défaut 🌸/🌼/🍎
  de la forêt, contrôlé par `assertValidTiers`) ; `publicCatalogueEntry(entry, tiers)`,
  `rewardShortLabel(reward, tiers)` et `rewardAnnouncementText(…, { tiers })` les reprennent ; G&L
  joue **Fil** 🧵, **Nœud** 🪢, **Étoffe** 🧶 (noms de la Trame).

L'instance expose : `evaluate`, `award`, `computeValues`, `listRewards`, `markSeen`,
`buildProgress`, `buildShowcase`, `awardManual` (lève `RewardAwardError` avec un statut HTTP),
`prepareMerge`, `publicCatalogue`, `describeReward`, `parseRewardKey`.

## 3. Ce qui reste dans chaque produit

- **Routes et droits** : la forêt sert `/api/rewards/*` (JWT ForetMap, `rewards.award`,
  périmètre des groupes) ; G&L servirait `/api/gl/rewards/*` avec son authentification
  (joueur, MJ). L'isolement des produits ne change pas : un jeton `product: 'gl'` reste refusé
  hors de `/api/gl/*`.
- **Interrupteur de module** : la forêt lit `ui.modules.rewards_enabled` ; G&L lit
  `modules.rewards_enabled` (`lib/glSettings.js`, 503 quand il est éteint).
- **Annonces** : la forêt notifie (`lib/rewards/announce.js`, texte du noyau
  `rewardAnnouncementText`) ; G&L ne notifie pas : la célébration se joue à l'ouverture de
  l'écran (`GET /api/gl/rewards/me` évalue puis sert les badges non vus), un évènement privé
  `badge` entre au journal.
- **Écrans** : chaque produit charge ses données (`GET …/me`) et les passe au panneau commun,
  avec son narrateur. Phrases d'OLU propres à ses familles : `extraPools` de
  `RewardCelebration` / `RewardsPanel` (ex. `{ quetes: ['…'] }`) — le reste du corpus est
  partagé. Charte : [`MASCOT_NARRATEUR_OLU.md`](MASCOT_NARRATEUR_OLU.md) §2.2bis.

## 4. Garanties communes (testées)

`tests/rewards-new-badges.test.js` branche le moteur sur un **produit factice** (table
temporaire, catalogue de quêtes) : idempotence, jamais de retrait, palier enregistré gardé,
vitrine triée par nom, badge décerné numéroté avec mot obligatoire, fusion qui renumérote,
familles restreintes, rien d'écrit dans la table de la forêt. C'est le contrat que l'instance
G&L devra respecter.

## 5. L'instance Gnomes & Licornes (livrée le 8 novembre 2026)

- Table `gl_player_rewards` (migration 339, mêmes colonnes que `user_rewards`, clé
  `(player_id, reward_key)`) ; instance `lib/glRewards.js` (`createRewardsEngine({ product: 'gl', … })`),
  catalogue `lib/glRewardsCatalog.js` (16 badges, 8 familles ; `Tisserand` / `Révélateur` réservés
  dans `RESERVED_REWARDS`, hors catalogue actif), mesures `lib/glRewardsMetrics.js` bornées au
  joueur (fouilles, pages trouvées / tenues / réparées en sa présence, lectures, « pas encore »
  suivis d'une réussite, dons, sorts d'aide, espèces et biomes étudiés, semaines de veillée,
  chapitres, deux peuples).
- Routes `/api/gl/rewards/me`, `/me/seen`, `/games/:id` (vitrine du prof triée par nom, « à un
  pas du palier suivant »), `POST /games/:id/award` (mot obligatoire) — `docs/API.md` § Badges G&L.
- Évaluation au fil de l'eau (`lib/glRewardsHooks.js`, hors transaction, jamais bloquante), de
  nuit (`rewards_evaluate` enchaîne la forêt puis `runGlRewardsEvaluateJob`), rattrapage
  `scripts/gl-rewards-backfill.js` (`gl_player_badges` → paliers équivalents ; l'ancienne table
  et `lib/glTenirBadges.js` restent en lecture seule, hérités).
- Écrans : `RewardsPanel` dans Mes traversées et l'écran d'équipe, `RewardCelebration` avec Olu
  (`src/gl/constants/glRewardsOlu.js`, jamais en projection), vitrine `GLTenirRewardsPanel` dans
  la console MJ, export `badges.csv`. **Aucun badge ne donne de ressource, aucun classement.**
- Tests : `tests/gl-rewards-engine.test.js`, `tests/gl-rewards-backfill.test.js`,
  `tests-ui/gl/GLRewardsPanel.test.jsx`, `tests-ui/gl/GLTenirRewardsPanel.test.jsx`, et le
  contrat commun `tests/rewards-new-badges.test.js`.
