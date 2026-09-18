# Import de comptes (CSV / XLSX)

Guide technique de l'import en lot des comptes ForetMap —
`GET /api/students/import/template` et `POST /api/students/import`
(permission `students.import`). Pour la vue non technique côté profs/admins, voir
`docs/reference/foretmap/comptes-roles-et-groupes.md`.

## Fichiers modèles

Téléchargeables depuis l'application (Profils & utilisateurs → Imports & exports) et
versionnés dans le dépôt :

- [docs/templates/users-import-template.csv](templates/users-import-template.csv) —
  modèle complet : **toutes les situations gérées**, une explication par ligne dans la
  colonne Description ;
- [docs/templates/users-import-template-minimal.csv](templates/users-import-template-minimal.csv) —
  les seules colonnes indispensables ;
- [docs/templates/users-import-template-vierge.csv](templates/users-import-template-vierge.csv) —
  en-têtes seuls, prêt à remplir.

Ces trois fichiers sont **générés** depuis `lib/studentRouteHelpers.js`, la même source
que le modèle téléchargé depuis l'application :

```bash
npm run templates:users         # régénère docs/templates/users-import-template*.csv
npm run templates:users:check   # vérifie la synchronisation (joué par npm test)
```

## Colonnes

| Colonne du modèle                              | Obligatoire                    | En-têtes également acceptés                                            |
| ---------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `Rôle`                                         | non (défaut : palier d'entrée) | `Profil`, `role_slug`, `Statut`, `Type`, `Type de compte`, `user_type` |
| `Prénom`                                       | **oui**                        | `first_name`, `firstname`, `first`                                     |
| `Nom`                                          | **oui**                        | `Nom de famille`, `last_name`, `lastname`, `surname`                   |
| `Mot de passe`                                 | à la création                  | `mdp`, `password`, `pass`, `Mot de passe provisoire`                   |
| `Affiliation (n3\|foret\|both\|id_carte)`      | non (défaut `both`)            | `Espace`, `Mon espace`, `Zone`, `Carte`                                |
| `Groupes (noms/slugs \| chemin Parent>Enfant)` | non                            | `Groupe`, `Groups`, `Classe`, `Classes`, `Division`                    |
| `Pseudo (optionnel)`                           | non                            | `Pseudonyme`, `Login`, `Identifiant de connexion`                      |
| `Email (optionnel)`                            | non                            | `E-mail`, `Courriel`, `Adresse e-mail`, `Mail`                         |
| `Description (optionnel)`                      | non                            | `Commentaire`, `Note`                                                  |

La comparaison des en-têtes ignore la casse, les accents et la ponctuation
(`normalizeImportHeader`). Quand un fichier porte à la fois un en-tête explicite et un
en-tête de repli (`Rôle` **et** `Type`, `Groupes` **et** `Classe`), **l'explicite gagne**,
quel que soit l'ordre des colonnes.

## Colonne Rôle : valeurs acceptées

La cellule est canonisée avant comparaison — casse, accents, emoji, espaces et tirets
sont neutralisés : `Élève avancé`, `ELEVE-AVANCE` et `eleve_avance` désignent le même
profil.

| Profil            | Type de compte | Écritures acceptées (extrait)                                                     |
| ----------------- | -------------- | --------------------------------------------------------------------------------- |
| `visiteur`        | `student`      | Visiteur, visitor, guest, invité, observateur, non promu                          |
| `personnel`       | `student`      | Personnel, staff, agent, AED, vie scolaire                                        |
| `eleve_novice`    | `student`      | n3beur novice, élève, élève novice, novice, débutant, student, palier 1           |
| `eleve_avance`    | `student`      | n3beur avancé, élève avancé, avancé, intermédiaire, palier 2                      |
| `eleve_chevronne` | `student`      | n3beur chevronné, élève chevronné, chevronné, expert, palier 3                    |
| `prof_classe`     | `teacher`      | Prof de classe, professeur de classe, tuteur, prof principal, référent de classe  |
| `prof`            | `teacher`      | n3boss, prof, professeur, enseignant, teacher, responsable pédagogique, animateur |
| `admin`           | `teacher`      | Admin, administrateur, administratrice, administrator, super admin                |

> **`prof` s'affiche « n3boss ».** C'est le même profil : `prof` est son identifiant
> technique, « n3boss » son nom affiché. Un compte importé en « prof » apparaît donc en
> « n3boss » dans l'application — ce n'est pas une dérive du mapping. Pour un tuteur de
> classe, choisir `prof_classe` / « Prof de classe », qui est un profil distinct et plus
> restreint.

Deux compléments :

- **Profils renommés** : le nom affiché réellement stocké en base (`roles.display_name`,
  modifiable dans « Profils & utilisateurs ») est accepté en plus de cette liste. Un
  profil renommé « Jardinier confirmé » s'écrit tel quel dans le fichier.
- **Cellule vide** : la ligne retombe sur `eleve_novice`, et le rapport d'import le
  signale (`infos[]`, code `role_defaulted`) avec les numéros de ligne concernés.

Les profils **G&L** (`gl_mj`, `gl_player`…) ne sont pas importables par ce fichier ;
l'erreur de ligne le dit explicitement au lieu d'un « rôle invalide » générique.

## Garde-fous

- Seul un administrateur peut importer ou modifier un compte `admin` ; seuls n3boss et
  administrateur peuvent importer un compte enseignant (`prof`, `prof_classe`).
- Le dernier administrateur ne peut pas être rétrogradé par un import.
- Compte déjà présent (même type + prénom + nom) : **mis à jour** par défaut
  (`students.import.existing_strategy` = `update` | `skip`). Cellule vide = valeur
  actuelle conservée (mot de passe compris).
- Même personne sur plusieurs lignes : fusionnée (groupes cumulés, dernière ligne
  renseignée pour le reste), signalée dans `infos[]`.
- Les adresses e-mail du fichier ne sont **pas** filtrées par les domaines autorisés
  pour Google OAuth ou Moodle.
