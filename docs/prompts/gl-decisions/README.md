# Chantier G&L « décisions » : le kit

Tout ce dont les sessions Claude Code du chantier ont besoin, versé dans le dépôt le 24/11/2026 depuis le projet Claude
« Gnomes et Licornes ». Le chantier applique les décisions d'Oliv du 19 au 24 novembre 2026 sur le jeu « Tenir à
deux » : 24 lots, trois vagues, une branche d'intégration (`claude/gl-decisions-integration`).

Ce kit **remplace** le prompt orchestrateur du 23-24/11 et ses quatre addenda (gardés mot pour mot dans
`sources/ancien/`, pour trace : ils ne font plus foi).

| Fichier | Pour qui | Ce que c'est |
| --- | --- | --- |
| `ORCHESTRATION.md` | la session orchestratrice | rôle, plan, lancement des lots, fusions, vagues, reprises, rapport final |
| `REGLES_COMMUNES.md` | chaque session de lot | ce qui fait foi, garde-fous, isolation locale, banc, fin de session |
| `lots/<lot>.md` | la session de ce lot | fiche autonome : décisions, fichiers, étapes, migration, vérifications |
| `plan.json` | scripts et orchestratrice | lots, couloirs, vagues, attentes, étiquettes de migration |
| `DECISIONS.md` | tous, pour lever un doute | registre des décisions d'Oliv, avec leur provenance |
| `EQUIVALENCE.md` | qui relit un ancien texte | anciens lots, étapes et migrations vers les nouveaux |
| `OLIV.md` | Oliv | ce qu'il fait avant, entre les vagues, après |
| `ETAT.modele.md` | l'orchestratrice | modèle de `ETAT.md`, sa mémoire, écrit sur la branche d'intégration |
| `rapports/<lot>.md` | écrit par chaque lot | état, commits, banc, textes à relire |
| `instantanes/` | les lots à migration | état de la prod relevé le 24/11, en lecture seule |
| `sources/` | les lots qui les citent | textes et données versés **mot pour mot** (exclus de Prettier) |
| `verifs/` | relecture | sorties des contrôles du kit |
| `.claude/agents/gl-decisions-lot.md` (racine du dépôt) | l'orchestratrice | le sous-agent d'un lot : sa propre copie du dépôt, Opus, effort élevé |

Règles de fusion du chantier (Oliv, 24/11) : aucune attente de CI ; seul le banc local (`tools/gl-sim/`) décide ;
intégration par vagues. S'y ajoute un choix de Claude, gardé faute d'avis contraire : pas de fusion sur `main` le
jeudi de 8 h à 15 h, heure de Casablanca (séances des 6e).

Ce dossier peut être supprimé une fois la vague 3 sur `main` et le rapport final rendu.
