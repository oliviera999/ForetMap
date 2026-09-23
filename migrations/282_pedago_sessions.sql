-- Séances pédagogiques (pilotes A/B) : orchestrent les onglets existants.
-- Idempotent. Les étapes sont figées par template ; le prof configure carte/clé/plantes/quiz.

CREATE TABLE IF NOT EXISTS pedago_sessions (
  id CHAR(36) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT DEFAULT NULL,
  level ENUM('college','lycee','universite') NOT NULL DEFAULT 'college',
  template_key VARCHAR(64) NOT NULL COMMENT 'college_reconaitre | college_qui_mange',
  map_id VARCHAR(32) DEFAULT NULL,
  config_json LONGTEXT NOT NULL,
  steps_json LONGTEXT NOT NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 100,
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pedago_sessions_slug (slug),
  INDEX idx_pedago_sessions_published (is_published, sort_order),
  INDEX idx_pedago_sessions_level (level),
  CONSTRAINT fk_pedago_sessions_map FOREIGN KEY (map_id) REFERENCES maps (id) ON DELETE SET NULL,
  CONSTRAINT fk_pedago_sessions_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed A — Collège · Reconnaître sans toucher
INSERT INTO pedago_sessions (
  id, slug, title, description, level, template_key, map_id,
  config_json, steps_json, is_published, sort_order
) VALUES (
  'pedago-session-college-reconaitre',
  'college-reconaitre-sans-toucher',
  'Reconnaître sans toucher',
  'Sortie collège (~45 min) : règle de visite, clé d’identification, fiche espèce, mini-quiz.',
  'college',
  'college_reconaitre',
  NULL,
  '{"keyIdOrSlug":null,"plantId":null,"plantIds":[],"notionNiveau":"cycle4","questionCode":null,"notionId":null}',
  '[{"id":"a1","title":"Règle de visite","body":"On décrit ce qu’on **voit**, sans cueillir ni manipuler. Pas de goût, pas de toucher : la clé repose sur des caractères observables à distance.","action":{"type":"message","payload":{}},"completeWhen":"manual"},{"id":"a2","title":"Clé d’identification","body":"Suis la clé étape par étape jusqu’à une espèce. Si aucune clé n’est configurée, ouvre l’onglet Clés et choisis-en une.","action":{"type":"open_id_key","payload":{}},"completeWhen":"manual"},{"id":"a3","title":"Fiche espèce","body":"Ouvre la fiche de l’espèce : danger, risque sanitaire, notes « sur ce site ».","action":{"type":"open_plant","payload":{}},"completeWhen":"manual"},{"id":"a4","title":"Mini-quiz","body":"Réponds à une question de classification ou d’identification (cycle 3 ou 4).","action":{"type":"open_quiz","payload":{"notionNiveau":"cycle4"}},"completeWhen":"manual"}]',
  1,
  10
) ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  description = VALUES(description),
  level = VALUES(level),
  template_key = VALUES(template_key),
  steps_json = VALUES(steps_json),
  sort_order = VALUES(sort_order);

-- Seed B — Collège · Qui mange qui sur le site
INSERT INTO pedago_sessions (
  id, slug, title, description, level, template_key, map_id,
  config_json, steps_json, is_published, sort_order
) VALUES (
  'pedago-session-college-qui-mange',
  'college-qui-mange-qui',
  'Qui mange qui sur le site',
  'Sortie collège (~45 min) : trois fiches du site, réseau de la carte, mini-quiz écologie.',
  'college',
  'college_qui_mange',
  NULL,
  '{"mapId":null,"plantIds":[],"plantId":null,"notionNiveau":"cycle4","questionCode":null,"notionId":null,"highlightPlantId":null}',
  '[{"id":"b1","title":"Trois fiches du site","body":"Avant le réseau : ouvre trois fiches présentes sur la carte de la sortie (notes de site si renseignées). Commence par la première.","action":{"type":"open_plant","payload":{"plantIndex":0}},"completeWhen":"manual"},{"id":"b1b","title":"Deuxième fiche","body":"Ouvre la deuxième espèce choisie pour la séance.","action":{"type":"open_plant","payload":{"plantIndex":1}},"completeWhen":"manual"},{"id":"b1c","title":"Troisième fiche","body":"Ouvre la troisième espèce, puis passe au réseau.","action":{"type":"open_plant","payload":{"plantIndex":2}},"completeWhen":"manual"},{"id":"b2","title":"Réseau de la carte","body":"Observe le réseau filtré sur la carte de la séance. Au collège, concentre-toi sur prédation, herbivorie et pollinisation.","action":{"type":"open_foodweb","payload":{}},"completeWhen":"manual"},{"id":"b3","title":"Mini-quiz écologie","body":"Mini-quiz sur une notion d’écologie / réseaux (cycle 4).","action":{"type":"open_quiz","payload":{"notionNiveau":"cycle4"}},"completeWhen":"manual"}]',
  1,
  20
) ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  description = VALUES(description),
  level = VALUES(level),
  template_key = VALUES(template_key),
  steps_json = VALUES(steps_json),
  sort_order = VALUES(sort_order);
