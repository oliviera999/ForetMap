-- Rétablit forum / commentaires contextuels par défaut sur les paliers n3beur système.
-- La migration 045 pouvait mettre 0 sur tout un profil (MIN des comptes legacy) alors que le défaut produit est participatif.
-- Les réglages volontaires post-déploiement se refont via Paramètres → Profils (PATCH RBAC).
UPDATE roles
SET context_comment_participate = 1
WHERE is_system = 1
  AND slug IN ('eleve_novice', 'eleve_avance', 'eleve_chevronne');

UPDATE roles
SET forum_participate = 1
WHERE is_system = 1
  AND slug IN ('eleve_novice', 'eleve_avance', 'eleve_chevronne');
