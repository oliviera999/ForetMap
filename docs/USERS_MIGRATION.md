# Migration utilisateurs + historique

Ce document décrit la matrice de validation opérationnelle pour la migration
progressive vers un modèle utilisateur unifié.

## Scénarios critiques à valider

| Domaine | Scénario | Résultat attendu |
|---|---|---|
| Auth élève | Login identifiant + mot de passe | JWT valide, session locale mise à jour |
| Auth prof | Login email + mot de passe | JWT valide, permissions prof présentes |
| OAuth | Connexion Google élève/prof | Redirection frontend avec payload exploitable |
| Élévation | `POST /api/auth/elevate` | Token élevé + trace `elevation_audit` + `security_events` |
| RBAC | Attribution profil utilisateur | Rôle principal mis à jour, action auditée |
| Tâches | Assign/unassign/done | `student_id` renseigné quand fourni, statuts cohérents |
| Stats | Lecture stats élève/prof | Données cohérentes via `student_id` ou fallback nom/prénom |
| Audit | Lecture `/api/audit` | Historique consultable sans rupture de format |
| Admin prod | Compte `oliviera9` | Rôle `admin` maintenu après migration |

## Contrôles SQL de non-régression

```sql
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM security_events;
SELECT COUNT(*) FROM task_assignments WHERE student_id IS NULL;
SELECT COUNT(*) FROM task_logs WHERE student_id IS NULL;
SELECT t.email, ur.role_id
FROM teachers t
LEFT JOIN user_roles ur ON ur.user_type='teacher' AND ur.user_id=t.id AND ur.is_primary=1
WHERE LOWER(SUBSTRING_INDEX(t.email,'@',1))='oliviera9';
```

## Critères de bascule

1. Les parcours élève/prof sont fonctionnels (auth, tâches, stats, audit).
2. Le backfill `users` ne remonte aucune erreur bloquante.
3. Le compte admin `oliviera9` est confirmé avec rôle `admin`.
4. Les tests backend critiques (auth/rbac/tasks/students) passent en environnement avec MySQL disponible.
