# Rapports du banc de simulation « Tenir à deux »

Ce dossier reçoit les rapports de `npm run gl:sim` : un sous-dossier `<AAAA-MM-JJ>-<scenario>/` par scénario, avec `summary.json` (agrégats par plateau et par variante, attendus, exécutions, contexte des échecs) et `index.html` (rapport autonome, CSS inline, graphiques SVG faits main, lisible hors ligne).

Tout ce qui s'y trouve est **ignoré par git** sauf ce fichier : les rapports se régénèrent (`tools/gl-sim/README.md` donne les commandes), et ils ne contiennent aucune donnée d'élève (pseudos `sim-<scenario>-<n>`, agrégats, identifiants techniques).
