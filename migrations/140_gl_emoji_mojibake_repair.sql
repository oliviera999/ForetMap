-- Réparation mojibake emoji GL (ancien xlsx / Excel : 16 bits bas → plan supplémentaire)
-- Ex. U+F32B+VS → 🌫️ (U+1F32B), U+F9F5 → 🧵 (U+1F9F5)

UPDATE gl_chapter_markers
SET emoji = REPLACE(emoji, '️', '🌫️')
WHERE emoji LIKE '%%';

UPDATE gl_chapter_markers
SET emoji = REPLACE(emoji, '淋', '🧵')
WHERE emoji LIKE '%淋%';

UPDATE gl_chapters
SET sortileges_markdown = REPLACE(sortileges_markdown, '️', '🌫️')
WHERE sortileges_markdown LIKE '%%';

UPDATE gl_chapters
SET sortileges_markdown = REPLACE(sortileges_markdown, '淋', '🧵')
WHERE sortileges_markdown LIKE '%淋%';

UPDATE gl_chapters
SET story_markdown = REPLACE(story_markdown, '️', '🌫️')
WHERE story_markdown LIKE '%%';

UPDATE gl_chapters
SET story_markdown = REPLACE(story_markdown, '淋', '🧵')
WHERE story_markdown LIKE '%淋%';

UPDATE gl_chapters
SET biotope_markdown = REPLACE(biotope_markdown, '️', '🌫️')
WHERE biotope_markdown LIKE '%%';

UPDATE gl_chapters
SET biotope_markdown = REPLACE(biotope_markdown, '淋', '🧵')
WHERE biotope_markdown LIKE '%淋%';

UPDATE gl_chapters
SET biocenose_markdown = REPLACE(biocenose_markdown, '️', '🌫️')
WHERE biocenose_markdown LIKE '%%';

UPDATE gl_chapters
SET biocenose_markdown = REPLACE(biocenose_markdown, '淋', '🧵')
WHERE biocenose_markdown LIKE '%淋%';
