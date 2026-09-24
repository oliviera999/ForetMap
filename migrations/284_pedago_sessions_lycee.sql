-- Séances pédagogiques lycée C/D (brouillons : le prof choisit l'arbre suivi / les 6 espèces
-- puis publie). Idempotent. Étapes générées depuis lib/pedagoSessions.js (templates C et D).

-- Seed C — Lycée · Un arbre qui grandit
INSERT INTO pedago_sessions (
  id, slug, title, description, level, template_key, map_id,
  config_json, steps_json, is_published, sort_order
) VALUES (
  'pedago-session-lycee-arbre',
  'lycee-un-arbre-qui-grandit',
  'Un arbre qui grandit',
  'Séance lycée (~55 min) : mesure d’un arbre suivi, lecture de la croissance, ordre de grandeur carbone, mini-quiz.',
  'lycee',
  'lycee_arbre',
  NULL,
  '{"mapId":null,"keyIdOrSlug":null,"plantId":null,"plantIds":[],"questionCode":null,"notionId":null,"notionNiveau":"lycee","termCode":null,"highlightPlantId":null,"individualId":null,"mapRouteSlug":null,"requiresSessionId":null}',
  '[{"id":"c1","title":"Un arbre qui grandit","body":"Objectif : suivre un arbre identifié du site. On mesure la **circonférence à 1,30 m** du sol (et la hauteur si possible), puis on relie la croissance au carbone stocké.","action":{"type":"message","payload":{}},"completeWhen":"manual"},{"id":"c2","title":"Mesurer l’arbre suivi","body":"Ouvre l’arbre suivi et saisis la circonférence (et la hauteur si possible) dans une nouvelle mesure.","action":{"type":"open_individual","payload":{}},"completeWhen":"manual"},{"id":"c3","title":"Lire la croissance","body":"Lis le graphique de croissance, puis ouvre le volet « ordre de grandeur » (biomasse, carbone, CO₂). Discutez des limites : la formule vient d’arbres tropicaux.","action":{"type":"open_individual","payload":{}},"completeWhen":"manual"},{"id":"c4","title":"Mini-quiz climat / carbone","body":"Relie la mesure à une notion du programme (climat, carbone, agrosystèmes).","action":{"type":"open_quiz","payload":{"notionNiveau":"lycee"}},"completeWhen":"manual"}]',
  0,
  30
) ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  description = VALUES(description),
  level = VALUES(level),
  template_key = VALUES(template_key),
  steps_json = VALUES(steps_json),
  sort_order = VALUES(sort_order);

-- Seed D — Lycée · Classer pour de vrai
INSERT INTO pedago_sessions (
  id, slug, title, description, level, template_key, map_id,
  config_json, steps_json, is_published, sort_order
) VALUES (
  'pedago-session-lycee-classer',
  'lycee-classer-pour-de-vrai',
  'Classer pour de vrai',
  'Séance lycée (~55 min) : boîtes emboîtées sur six espèces du site, correction argumentée, mini-quiz.',
  'lycee',
  'lycee_classer',
  NULL,
  '{"mapId":null,"keyIdOrSlug":null,"plantId":null,"plantIds":[],"questionCode":null,"notionId":null,"notionNiveau":"lycee","termCode":null,"highlightPlantId":null,"individualId":null,"mapRouteSlug":null,"requiresSessionId":null}',
  '[{"id":"d1","title":"Classer pour de vrai","body":"Chaque boîte correspond à un groupe d’êtres vivants qui partagent un **caractère**. Place chaque espèce dans la plus petite boîte qui la contient.","action":{"type":"message","payload":{}},"completeWhen":"manual"},{"id":"d2","title":"Boîtes emboîtées","body":"Place les six espèces dans les boîtes, puis clique sur « Vérifier ».","action":{"type":"open_nested_groups","payload":{}},"completeWhen":"manual"},{"id":"d3","title":"Correction et discussion","body":"Pour chaque groupe, quel est le caractère partagé ? Pourquoi une espèce mal placée l’a-t-elle été ?","action":{"type":"message","payload":{}},"completeWhen":"manual"},{"id":"d4","title":"Mini-quiz classification","body":"Mini-quiz sur la classification et la biodiversité.","action":{"type":"open_quiz","payload":{"notionNiveau":"lycee"}},"completeWhen":"manual"}]',
  0,
  40
) ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  description = VALUES(description),
  level = VALUES(level),
  template_key = VALUES(template_key),
  steps_json = VALUES(steps_json),
  sort_order = VALUES(sort_order);
