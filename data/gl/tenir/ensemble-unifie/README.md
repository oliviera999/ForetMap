# `data/gl/tenir/ensemble-unifie/` — données d'attente de l'ensemble unifié (17 novembre 2026)

Dossier **d'attente** : ces fichiers ne sont lus par aucun chargeur. Le prompt
`docs/GL_ENSEMBLE_UNIFIE_PROMPT.md` dit dans quelle PR chacun est intégré aux catalogues de `data/gl/tenir/` ; la PR
qui consomme le dernier supprime ce dossier.

| Fichier | Contenu | PR |
| --- | --- | --- |
| `cases-souffle.json` | 13 cases Souffle réécrites, effet unique « un seul dé au tour suivant » | 1a |
| `zone-cz-p2-08.json` | zone activée (feuillet `ep-I-06`) et sa question de lecture | 1b |
| `zones-m22.json` | fiches et termes qui donnent la réponse de chaque question de zone ; 5 questions réécrites ; 1 fiche et 2 termes à créer, 2 termes à compléter | 1b |
| `questions-vives-lot2.json` | 40 questions vives `VQCM0041` à `VQCM0080` (plateaux 1 et 2) | 1a |
| `lettre-mentorat.json` | amorces de la Lettre, consigne du Mentorat, retours | 1b |
| `olu-premiere-fois.json` | 23 lignes « première fois » et 6 révisions de lignes existantes | 1a (révisions), 2 (lignes) |
| `trame-ranger.json` | défis « Le bon rôle » (8 jeux) et « Le bon pays » (4 jeux) | 2 |
| `trame-adaptations.json` | défi « Les fils de l'adaptation » (8 jeux) | 2 |
| `test-avant-apres-ch1.json`, `.xml` | test avant / après du chapitre 1, déjà créé sur olution : pour mémoire | — |

Contrôles faits avant livraison : crible des chaînes interdites (`src/shared/glGardeFousCore.js`), espèces vérifiées
contre `gl_species` (code, biome, nom), cartes des fils toutes reliées. Aucune donnée d'élève.
