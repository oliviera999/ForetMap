-- Participation au forum par compte n3beur (0 = lecture seule, 1 = peut publier / réagir / signaler / supprimer ses messages)
ALTER TABLE users
  ADD COLUMN forum_participate TINYINT(1) NOT NULL DEFAULT 1
  AFTER affiliation;
