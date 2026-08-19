-- =====================================================================
-- GL — Une présentation de QCM ne se joue qu'une fois
--
-- CONTEXTE. `POST /api/gl/games/:id/qcm/answer` vérifiait la signature du
-- `presentationToken` puis créditait l'équipe, sans jamais marquer le jeton comme
-- consommé. Pendant les 15 minutes de validité du jeton, renvoyer la MÊME requête
-- (même jeton, même bonne réponse) rajoutait +1 au score à chaque appel : le score
-- d'équipe était donc arbitrairement gonflable depuis le navigateur, sans rien
-- forger — il suffisait de rejouer un appel légitime.
--
-- CORRECTIF. Chaque présentation porte un identifiant unique (`jti`). La première
-- réponse en partie l'inscrit ici ; la clé primaire fait échouer l'insertion des
-- suivantes, auxquelles la route répond 409 « Présentation déjà utilisée ».
-- L'insertion et l'attribution du score sont dans la même transaction : soit le
-- jeton est consommé et le point compté, soit ni l'un ni l'autre.
--
-- Le diagnostic est celui de docs/AUDIT_APP_ET_JEU_2026-08.md §6.2 (b) ; l'approche
-- reprend celle de la PR #275, restée à l'état de brouillon. Son fichier portait le
-- numéro 171 : sur une base déjà migrée au-delà, le runner l'aurait sauté sans bruit
-- (`num < current`), d'où la renumérotation en fin de chaîne.
--
-- La table est purgeable : une ligne ne sert plus une fois le jeton expiré (15 min).
-- L'index secondaire est là pour ce ménage éventuel, pas pour la lecture.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_qcm_presentation_uses (
  jti VARCHAR(64) NOT NULL,
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NULL,
  question_code VARCHAR(32) NOT NULL,
  used_at DATETIME NOT NULL,
  PRIMARY KEY (jti),
  KEY idx_gl_qcm_presentation_uses_game (game_id, used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
