# Images de plateaux GL (zones feuillets)

Placez ici les 5 images filigranées du matériel de jeu, puis référencez-les dans `map_image_url` des chapitres (admin **Contenus → Chapitres**).

| Plateau | Biome | Fichier attendu |
|--------|-------|-----------------|
| 1 | Tropiques africains | `watermarked_img_13496490473232250296.jpg` |
| 2 | Sahara & Méditerranée | `watermarked_img_16999739831612660178.jpg` |
| 3 | Forêts & landes atlantiques | `watermarked_img_6895487107210024833.jpg` |
| 4 | Taïga & toundra arctique (été puis nuit polaire) | médiathèque : `GL_plateau-4_fond.png` (clé `plateau-4_fond`) |
| 5 | Toundra arctique — **mis de côté** | `watermarked_img_12187730459568620673.jpg` (plus joué) |

URL servie : `/gl/boards/<fichier>`.

Associez chaque chapitre à son **plateau narratif (1–5)** dans le formulaire chapitre.

Depuis la fusion des chapitres 4 et 5 (octobre 2026), l'année se joue en **4 plateaux**. Le
plateau 4 n'a plus d'image dans ce dossier : son fond vient de la médiathèque, sous la clé
`plateau-4_fond`. Cette clé **prime** sur tout autre `plateau-4_*`, sans code à changer
(`src/gl/utils/resolvePlateauBoardSlug.js`). L'ancien fond « taïga & désert froid »
(`watermarked_img_15989862586475956910.png`, clé `plateau-4_taiga-desert_froid`) n'est plus
utilisé. Le chapitre « Toundra arctique » est mis de côté, sans plateau.
