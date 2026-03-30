-- Publication de commentaires contextuels (zones, tâches, projets) : 0 = lecture seule sur la liste
ALTER TABLE users
  ADD COLUMN context_comment_participate TINYINT(1) NOT NULL DEFAULT 1
  AFTER forum_participate;
