-- 207_usage_counters.sql
-- Compteur d'usage anonyme, commun aux produits (ForetMap, G&L, Plan Lyautey) —
-- lot 1 du plan de convergence (docs/AUDIT_CONVERGENCE_APPS_2026-09.md §5.2,
-- docs/AUDIT_PLAN_LYAUTEY_2026-09.md §8.9).
--
-- Aucun identifiant, aucun cookie, aucune adresse IP : un événement nommé, agrégé par
-- JOUR, par PRODUIT, par ÉVÉNEMENT et par clé libre (identifiant de lieu, onglet, texte
-- normalisé d'une recherche sans résultat…). Première table du dépôt conçue multi-produit
-- (colonne `product`), plutôt qu'un miroir `gl_*` par produit.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS usage_counters (
  day DATE NOT NULL,
  product VARCHAR(16) NOT NULL,
  event VARCHAR(48) NOT NULL,
  `key` VARCHAR(64) NOT NULL DEFAULT '',
  count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (day, product, event, `key`),
  INDEX idx_usage_counters_product_day (product, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
