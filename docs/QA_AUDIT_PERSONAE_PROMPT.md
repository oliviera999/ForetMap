# Prompt QA E2E + Audit UX (adapte ForetMap)

Ce document fournit un prompt pret a l'emploi pour lancer un audit QA complet base sur des personae realistes, puis l'industrialiser en routine de qualite.

## 1) Prompt pret a copier-coller

```md
## Contexte
Tu es un expert QA, tests E2E et audit UX sur le projet ForetMap.
Tu dois simuler des personae realistes, parcourir les flux critiques eleve/prof, detecter les frictions, bugs et regressions d'accessibilite, puis produire un rapport actionnable.

## Application a tester
- URL / point d'entree:
  - Local dev UI: http://localhost:5173 (proxy API vers 3000)
  - Ou app servie par Express: http://localhost:3000
- Stack:
  - Frontend: React 19 + Vite (`src/`, build `dist/`)
  - Backend: Node.js + Express (`server.js`, `routes/`)
  - BDD: MySQL/MariaDB (`database.js`, `sql/schema_foretmap.sql`)
  - Tests UI: Playwright (`e2e/`)
- Contexte metier:
  - Foret comestible (Lycée Lyautey), parcours eleve et mode professeur (PIN/JWT)

## Parcours critiques ForetMap a couvrir
Tester chaque parcours avec CHAQUE persona:

1. Eleve - authentification et prise en main
   - inscription -> connexion -> arrivee dashboard/carte -> premiere action utile (ex: ouvrir taches ou visite)
2. Eleve - cycle taches
   - ouvrir liste taches -> filtrer/rechercher -> marquer un statut -> verifier feedback et persistance
3. Prof - elevation et pilotage
   - connexion -> activer mode prof (PIN) -> ouvrir vues de gestion -> creer/modifier une donnee (tache/plante/zone) -> verifier retour succes/erreur
4. Carte/visite mobile
   - ouvrir carte -> naviguer/zoomer -> ouvrir visite -> interagir avec un repere/element mascotte si visible
5. Robustesse formulaires
   - soumission vide/invalide -> message d'erreur -> correction -> soumission reussie

## Personae a simuler
### Persona 1 - Marie, 58 ans, peu a l'aise avec le numerique
- Android entree de gamme, connexion 4G limitee
- Lit tout, n'infere pas, clique seulement ce qui est explicite
- Abandonne si un message d'erreur est ambigu
- Focus test: labels, lisibilite, cibles tactiles (>=44px), messages d'erreur simples

### Persona 2 - Theo, 24 ans, dev front, impatient power user
- Clavier, raccourcis, console, edge cases
- Champs vides, emojis, payload HTML, double-clic spam sur submit
- Focus test: validation input, etats de chargement, idempotence, anti-double soumission, sanitization

### Persona 3 - Sandra, 41 ans, directrice marketing, mobile-first
- iPhone, sessions courtes, attentes de fluidite
- Focus test: parcours en <=3 taps pour actions cles, cohérence CTA, microcopies, performance percue

### Persona 4 - Karim, 35 ans, malvoyant, lecteur d'ecran
- Navigation clavier + VoiceOver/NVDA
- Depend de aria-labels, focus visible, headings ordonnes
- Focus test: WCAG 2.1 AA, navigation clavier complete, contraste, alternatives textuelles

## Methodologie obligatoire (chaque parcours x persona)
1. Parcours pas a pas
2. Frictions detectees (ralentit, confus, bloque)
3. Bugs fonctionnels (etat casse, incoherence, erreur)
4. Accessibilite (WCAG, clavier, contraste, labels)
5. UX (wording, hierarchie visuelle, feedback)
6. Score de completion (oui / oui avec friction / abandon)

## Regles de verification techniques (ForetMap)
- Ne jamais supposer: verifier dans le code ET via comportement observe.
- Inspecter au minimum:
  - frontend: `src/components/`, `src/App.jsx`, `src/index.css`
  - backend: `server.js`, `routes/`, `middleware/`, `lib/`
  - tests existants: `e2e/`, `tests/`
- Si un parcours depend de donnees:
  - preparer les preconditions (seed API/BDD, fixtures Playwright)
  - documenter les donnees creees puis nettoyees
- Tester explicitement:
  - etats vides
  - erreurs API (4xx/5xx)
  - timeout lent/reseau degrade
  - double soumission et clics repetes

## Livrable attendu (4 parties)
### Partie 1 - Matrice de resultats
Tableau parcours x persona:
- score de completion
- nb problemes par severite (bloquant / majeur / mineur)

### Partie 2 - Liste exhaustive des problemes
Pour chaque probleme:
- ID: BUG-xxx / UX-xxx / A11Y-xxx / PERF-xxx / WORD-xxx
- Severite: bloquant / majeur / mineur
- Categorie
- Persona(s) impactee(s)
- Parcours + etape precise
- Description factuelle
- Suggestion de correction
- Preuve technique: fichier(s) + reference(s) de code (chemin et ligne si applicable)

### Partie 3 - Top 10 corrections prioritaires
Classement par impact = severite x nombre de personae impactees x criticite parcours.
Pour chaque correction: effort estime (rapide / moyen / complexe).

### Partie 4 - Score global et verdict
- Score d'utilisabilite /100
- Points forts
- 3 chantiers structurels prioritaires

## Format de restitution
- Ecrire en francais
- Separer faits observes vs hypothese
- Ne pas masquer les incertitudes: marquer "a verifier" si non reproductible
- Donner une recommandation testable pour chaque probleme
```

## 2) Routine de qualite recommandee

Utiliser ce cycle sur chaque lot qui touche l'UX, les formulaires, l'auth ou les flux critiques:

1. **Avant merge**
   - `npm test`
   - `npm run build` (si frontend touche et server sert `dist/`)
   - `npm run test:e2e`
2. **Audit personae cible**
   - Executer le prompt ci-dessus sur les parcours modifies
   - Produire un rapport horodate (ex: `docs/reports/qa-ux-YYYY-MM-DD.md`)
3. **Gating simple**
   - Aucun bloquant ouvert sur parcours critique
   - Accessibilite: aucun blocage clavier et labels critiques presentes
   - Si ecart: ticket + plan de correction + owner
4. **Suivi continu**
   - Revue hebdo des problemes majeurs restants
   - Rejouer les memes parcours apres correctifs pour valider non-regression

## 2bis) Archivage standard

- Dossier cible: `docs/reports/`
- Template recommande: `docs/reports/qa-ux-template.md`
- Nommage:
  - `qa-ux-YYYY-MM-DD.md`
  - ou `qa-ux-YYYY-MM-DD-<lot>.md`

## 3) Checklist d'execution rapide

- Environnement local OK (`docs/LOCAL_DEV.md`)
- Donnees de test preparees
- Parcours eleve + prof testes
- Mobile + clavier testes
- Erreurs/timeouts/double submit testes
- Rapport final complete (matrice + top10 + verdict)

## 4) Personae GL (Gnomes & Licornes)

Utiliser cette checklist pour la recette ciblee de `gl.olution.info` apres un lot GL.

### Persona GL Joueur (6e)

- Connexion via identifiant + mot de passe (écran auth GL unique)
- Verification des onglets: Cartes, Biotope, Biocenose, Histoire, Monde, Sortileges, Regles
- Join team sur une partie (`/api/gl/games/:id/join-team`)
- Observation d'un mouvement d'equipe emis par le MJ (temps reel Socket.IO room `gl:game:{id}`)
- Verification de la lisibilite mobile (actions principales en <=3 taps)

### Persona GL MJ (admin)

- Connexion admin (Google) puis acces console MJ
- Creation d'une partie (classe + chapitre)
- Ajout de 2 equipes (gnome + licorne), assignation mascotte
- Emission d'un event `move` (API `/api/gl/games/:id/events`)
- Changement d'etat partie (start, pause, end)

### Persona GL Joueur novice (1ere connexion)

- Decouverte des onglets actifs (modules `modules.*` selon flags MJ)
- Onboarding aide contextuelle GL (`GLHelpPanel`) consulte au moins une fois
- Lecture d'un tutoriel GL (accuse de lecture `/api/gl/tutorials/:id/read`)
- Consultation de la carte du royaume si `kingdomMapEnabled`

### Persona GL Joueur confirme (rejoue)

- Verification que les notifications GL precedentes sont marquees lues
- Reactions sur un commentaire contextuel (chapitre / partie)
- Participation au forum GL (creation thread / reply)
- Lecture du journal de partie (timeline `/api/gl/journal/games/:id`)

### Persona GL Admin

- Reglages plateforme : activer/desactiver chaque module GL et observer la
  navigation joueur (impact direct sans redeploiement)
- Import joueurs CSV/XLSX (template `format=csv|xlsx`, dryRun puis apply)
- Reset mot de passe joueur (`/reset-password`) puis verification connexion
- Studio packs mascottes (`GLMascotPackManager`) : creation, edition, preview
- Diagnostics MCP : outils `gl_public_health` et `gl_diagnostics` repondent
  avec statuts coherents

### Matrice parcours x personae GL

| Parcours / Persona            | Joueur 6e | Joueur conf. | MJ      | Admin GL |
|-------------------------------|-----------|--------------|---------|----------|
| Connexion + tabs              | OK        | OK           | OK      | OK       |
| Forum GL                      | -         | OK           | OK      | OK       |
| Tutoriels GL                  | OK        | OK           | OK      | OK       |
| Commentaires contextuels GL   | OK        | OK           | OK      | OK       |
| Mascotte renderer/state       | -         | OK           | OK      | OK       |
| Studio packs mascotte         | -         | -            | OK      | OK       |
| Carte royaume                 | OK        | OK           | OK      | OK       |
| Journal de partie             | OK        | OK           | OK      | OK       |
| Notifications GL              | OK        | OK           | OK      | OK       |
| Reglages modules.*            | -         | -            | -       | OK       |
| Import joueurs                | -         | -            | -       | OK       |
| MCP diagnostics GL            | -         | -            | -       | OK       |

### Criteres d'acceptation GL

- Aucune confusion visuelle avec ForetMap (theme et onglets dedies GL)
- Aucune fuite cross-produit (token GL refuse sur endpoints ForetMap)
- Les events MJ sont visibles cote joueur sans rechargement
- Les ecrans editoriaux GL sont consultables sans erreur bloquante
- Les modules GL desactives (`modules.*=false`) masquent l'onglet
  correspondant immediatement apres rechargement

