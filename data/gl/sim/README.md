# Données du banc de simulation G&L

`contenu-prod-2026-11-07.json` — instantané du **contenu pédagogique** de la prod au 7 novembre 2026
(lecture seule via le connecteur MCP), sans aucune donnée de personne : chapitres des plateaux 1 à 4
(ids 3 à 6), leurs 169 cases et leurs effets, biomes et sorts v2 par chapitre, 6 catégories et
931 questions QCM, 205 feuillets, 276 espèces.

Deux artefacts du masquage du connecteur y sont corrigés : le mot « production » rétabli (il était
remplacé par `[secret .env masqué]`, y compris dans « reproduction »), et `passTurn` reconstruit
d'après le libellé de la case (« passe ton tour » → `true`).

Usage : chargé dans la base `foretmap_sim` par le banc de simulation (`npm run gl:sim:db`, voir
`docs/GL_SIMULATION.md`). Pour le refaire : `npm run gl:sim:snapshot -- --from-db <base>`.
