SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Niveau de contenu des comptes personnels non élèves (demande du 22/11/2026).
--
-- Structure seule : aucune donnée n'est posée ni modifiée. NULL = aucun choix explicite, le
-- niveau est alors CALCULÉ à chaque lecture (niveau de classe le plus haut des groupes du
-- compte, héritage du parent compris ; aucun groupe avec un niveau → cycle 3). Le défaut
-- n'est jamais écrit ici : un changement de groupe le fait évoluer tant que la personne n'a
-- rien choisi.
--
--   - `users.pedago_content_level` : un niveau de l'échelle unique de l'apprenant
--     (`cycle3` … `es_terminale`, `universite`) ou `complet` (vue gestion complète, sans
--     aucune borne). Domaine : `STAFF_CONTENT_LEVEL_ENUM` (src/shared/enums/pedagoEnums.js),
--     contrôlé par l'API (`PATCH /api/auth/me/profile`). Ignoré pour un compte élève.
--
-- Pourquoi pas `users.biodiv_pedago_level` : autre échelle (étape collège / lycée /
-- université, sans cycle 3 / cycle 4) et autre sens (confort d'affichage de l'élève, qui ne
-- peut que simplifier et ne touche ni le vocabulaire ni les questions).
--
-- VARCHAR plutôt qu'ENUM : la liste suit l'échelle de l'apprenant (référentiel), sans ALTER à
-- chaque niveau ajouté. Idempotent : ADD COLUMN IF NOT EXISTS. Rejouable deux fois sans
-- erreur. Aucun trigger, aucun DEFINER, aucune table `gl_*`.
-- =====================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pedago_content_level VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'Niveau de contenu choisi par un compte non eleve (NULL = niveau des groupes, sinon cycle 3)';
