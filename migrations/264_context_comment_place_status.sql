-- Statut de traitement d'un message reçu sur un lieu (zone ou repère).
--
-- Pourquoi ces colonnes plutôt qu'une table. L'objet ne change pas : c'est le **même
-- message**, celui que quelqu'un a déposé sur un lieu depuis la carte ou depuis le plan des
-- personnels. Une table « traitements » n'apporterait qu'une jointure et une clé de plus pour
-- porter trois champs qui n'existent jamais sans leur message. La charte du non-développement
-- (`docs/AUDIT_STRATEGIE_PLATEFORME_2026-09.md` §7, point 3) demande qu'une table nouvelle se
-- justifie par écrit : ici, aucune ne se justifie.
--
-- Pourquoi tout court. Jusqu'ici la seule sortie d'un signalement était la **suppression** :
-- elle efface l'information au lieu de la clore, et n'apprend rien à son auteur. Un agent qui
-- signalait une porte condamnée ne savait jamais si c'était lu
-- (`docs/AUDIT_COMMUNICATION_2026-09-18.md` §3, angles morts 2 et 3).
--
-- `place_status` vide = « nouveau », c'est-à-dire l'état de tous les messages existants : le
-- défaut de colonne suffit, aucun rattrapage n'est nécessaire. Les trois autres valeurs
-- (`pris_en_compte`, `traite`, `sans_suite`) sont validées côté serveur
-- (`lib/placeMessages.js`), pas par un ENUM : en ajouter une plus tard ne doit pas coûter une
-- migration bloquante sur une table qui porte aussi les commentaires de G&L.
--
-- `place_status_by_*` trace QUI a traité, pour le journal d'audit et la console. Ce couple
-- n'est **pas** servi à l'auteur du message : il apprend que c'est traité, pas par qui —
-- décision de ce lot, révisable.
--
-- Colonnes portées par `context_comments`, table partagée avec G&L (`gl_chapter`, `gl_scene`…).
-- Elles restent vides pour ces contextes : seuls `zone` et `marker` les emploient.
--
-- Idempotent : ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

ALTER TABLE context_comments
  ADD COLUMN IF NOT EXISTS place_status VARCHAR(16) NOT NULL DEFAULT ''
    COMMENT 'Traitement d''un message de lieu : vide (nouveau) | pris_en_compte | traite | sans_suite',
  ADD COLUMN IF NOT EXISTS place_status_at DATETIME NULL DEFAULT NULL
    COMMENT 'Horodatage du dernier changement de statut',
  ADD COLUMN IF NOT EXISTS place_status_by_user_type VARCHAR(16) NULL DEFAULT NULL
    COMMENT 'Type de compte ayant posé le statut (jamais servi à l''auteur du message)',
  ADD COLUMN IF NOT EXISTS place_status_by_user_id VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'Identifiant du compte ayant posé le statut';

-- Le journal des lieux trie par date sur un contexte filtré, et se restreint aux messages
-- encore à traiter : c'est cette requête-là que l'index doit servir.
CREATE INDEX IF NOT EXISTS idx_context_comments_place_status
  ON context_comments (context_type, place_status, created_at);
