-- Horodatage des messages du forum à la **milliseconde** — même défaut, même correctif que
-- `context_comments` (migration 278).
--
-- Le défaut. `forum_posts.created_at` est un `DATETIME` à la seconde et `id` un UUID tiré au
-- hasard. `GET /api/forum/unread-marker` désigne le dernier message d'autrui par
-- `ORDER BY p.created_at DESC, p.id DESC` : deux messages de la même seconde sont départagés
-- au hasard. Le client compare ce `latest_post_id` à son curseur de lecture : le point
-- « non lus » pouvait donc se rallumer après lecture, d'un chargement à l'autre, sans
-- nouveau message. Visible aussi en CI : le test « marqueur non lu » (tests/forum.test.js)
-- échouait dès que le test précédent avait publié dans la même seconde.
--
-- `gl_forum_posts` n'est pas concernée : son identifiant est un `AUTO_INCREMENT`, le
-- départage `id DESC` y est déjà monotone.
--
-- Le DEFAULT est requalifié en `CURRENT_TIMESTAMP(3)` (les insertions de
-- lib/shared/forumCore.js s'appuient sur lui). Les lignes existantes gardent `.000`.
-- Idempotent : `MODIFY COLUMN` rejoué sur une colonne déjà au bon type est sans effet.

ALTER TABLE forum_posts
  MODIFY COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    COMMENT 'Précision milliseconde (migration 291) : départage deux messages de la même seconde';
