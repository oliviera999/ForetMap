-- Carte : retrait de l'emoji recopié en tête du nom d'une zone ou d'un repère.
--
-- POURQUOI CETTE MIGRATION
-- ------------------------
-- Certains noms reprennent l'emoji déjà porté par le champ dédié (« 🧪 Bât.S » avec l'emoji
-- 🧪). La carte affiche alors deux fois le même pictogramme, et le nom, plus large que
-- nécessaire, entre en collision avec ses voisins (audit du 29/09/2026, seconde passe,
-- docs/AUDIT_ETIQUETTES_ZONES_2026-09-29.md).
--
-- Seul le cas exact est traité : le nom commence par l'emoji du champ dédié (comparaison
-- binaire, les collations « unicode_ci » confondant les caractères hors plan de base), suivi
-- d'une espace, et il reste un nom non vide après retrait.
--
-- Idempotente : une fois l'emoji retiré, la condition ne correspond plus.

UPDATE zones
   SET name = TRIM(SUBSTRING(name, CHAR_LENGTH(emoji) + 2))
 WHERE emoji IS NOT NULL
   AND CHAR_LENGTH(emoji) > 0
   AND CAST(LEFT(name, CHAR_LENGTH(emoji)) AS BINARY) = CAST(emoji AS BINARY)
   AND SUBSTRING(name, CHAR_LENGTH(emoji) + 1, 1) = ' '
   AND CHAR_LENGTH(TRIM(SUBSTRING(name, CHAR_LENGTH(emoji) + 2))) > 0;

UPDATE map_markers
   SET label = TRIM(SUBSTRING(label, CHAR_LENGTH(emoji) + 2))
 WHERE emoji IS NOT NULL
   AND CHAR_LENGTH(emoji) > 0
   AND CAST(LEFT(label, CHAR_LENGTH(emoji)) AS BINARY) = CAST(emoji AS BINARY)
   AND SUBSTRING(label, CHAR_LENGTH(emoji) + 1, 1) = ' '
   AND CHAR_LENGTH(TRIM(SUBSTRING(label, CHAR_LENGTH(emoji) + 2))) > 0;
