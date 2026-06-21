-- Nettoyage des URLs média GL legacy en base (chapitres Sélène + feuillets copiste).
-- Les fonds de plateau et scènes de récit sont résolus côté client via _keys.json
-- (convention plateau-N_* / recit_0N-chapN_*). Voir scripts/migrate-gl-chapter-media-urls.js
-- pour une migration complète incluant les URLs résolues dans le markdown.

UPDATE gl_chapters
   SET map_image_url = NULL,
       updated_at = NOW()
 WHERE slug IN (
         'tropiques-africains',
         'aride-chaud',
         'tempere-atlantique',
         'eurasie-continentale',
         'toundra-arctique'
       )
   AND map_image_url LIKE '%/uploads/media-library/image/gl-plateau-%';

UPDATE gl_chapters
   SET story_markdown = REGEXP_REPLACE(
         story_markdown,
         '!\\[([^\\]]*)\\]\\(/uploads/media-library/image/gl-scene-ch[0-9]+[^)]*\\)',
         '![\\1](scene:1)'
       ),
       updated_at = NOW()
 WHERE slug IN (
         'tropiques-africains',
         'aride-chaud',
         'tempere-atlantique',
         'eurasie-continentale',
         'toundra-arctique'
       )
   AND story_markdown REGEXP '/uploads/media-library/image/gl-scene-ch[0-9]';

UPDATE gl_lore_feuillets
   SET image_url = NULL,
       updated_at = NOW()
 WHERE image_url LIKE '%/uploads/media-library/image/gl-scene-%';
