'use strict';

/**
 * `foretmap_students` — les élèves (n3beurs) de bout en bout (lot D2, personnes).
 *
 * Tout l'outil est **nominatif** : chaque action exige le bypass RGPD (réglage et permission
 * `mcp.privacy_bypass`) et chaque appel est journalisé par la fabrique.
 *
 * - Lectures : la liste et le profil passent par l'API (`GET /api/rbac/users…`), donc avec la
 *   visibilité de la personne connectée (périmètre de ses groupes hors vue globale).
 *   L'activité détaillée (quiz, lectures, observations, carnet compté, récompenses) et le
 *   repérage du décrochage sont du SQL en lecture seule (`lib/mcp/domains/students.js`),
 *   lancé **après** la route qui a vérifié le périmètre, et sous `stats.read.all` ou
 *   `stats.read.group` (les permissions de la page « Stats »).
 * - Écritures : toutes par le pont API (import, fiche, (dés)activation, fusion de comptes,
 *   lien de réinitialisation, double authentification, profil).
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, paged, seg } = require('./factory');
const { rowsToCsv } = require('./tasks');
const { studentActivity, studentTimeline, studentRiskSignals } = require('../../domains/students');

const TOOL = 'foretmap_students';
const STATS_PERMS = ['stats.read.all', 'stats.read.group'];

const studentId = z.string().min(1).max(64).describe('Identifiant (users.id) de l’élève');

/** Profil + groupes par la route (vérifie aussi que l'élève est dans le périmètre). */
function fetchProfile(ctx, id) {
  return api(ctx, 'GET', `/api/rbac/users/student/${seg(id)}`, undefined, { tool: TOOL });
}

/** Élèves visibles par la personne connectée (route de l'onglet Comptes). */
async function visibleStudents(ctx) {
  const rows = await api(ctx, 'GET', '/api/rbac/users', undefined, { tool: TOOL });
  return (Array.isArray(rows) ? rows : []).filter((u) => u.user_type === 'student');
}

function compactStudent(u) {
  return {
    id: u.id,
    display_name: u.display_name,
    first_name: u.first_name,
    last_name: u.last_name,
    pseudo: u.pseudo,
    email: u.email,
    is_active: u.is_active,
    role_slug: u.role_slug,
    groups: (u.groups || []).map((g) => ({ id: g.id, name: g.name })),
  };
}

function patchStudent(ctx, id, body) {
  return api(ctx, 'PATCH', `/api/rbac/users/student/${seg(id)}`, body, { tool: TOOL });
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'students',
  profile: 'essentiel',
  title: 'Élèves (fiches, suivi, décrochage, comptes)',
  intro:
    'Élèves (n3beurs) : liste filtrée, fiche de suivi (groupes, profil, tâches par statut, réussite au quiz par catégorie et par notion, tutoriels lus, observations, nombre d’articles de carnet, récompenses, dernière activité), chronologie, repérage du décrochage, et gestion des comptes (import en masse, modification, désactivation, fusion, lien de réinitialisation du mot de passe, remise à zéro de la double authentification, profil). Périmètre : vos groupes, sauf vue globale.',
  actions: {
    list: {
      summary: 'liste des élèves visibles (filtres texte, groupe, actifs)',
      nominative: true,
      params: {
        q: z.string().max(120).describe('Texte cherché (nom, prénom, pseudo, e-mail)'),
        group_id: z.string().max(64).describe('Groupe'),
        active: z.boolean().describe('true = actifs, false = désactivés'),
        ...pageParams,
      },
      run: async (args, ctx) => {
        const needle = args.q ? String(args.q).toLowerCase() : null;
        const list = (await visibleStudents(ctx)).filter((u) => {
          if (args.active !== undefined && !!u.is_active !== args.active) return false;
          if (args.group_id && !(u.groups || []).some((g) => g.id === args.group_id)) {
            return false;
          }
          if (needle) {
            const hay = [u.display_name, u.first_name, u.last_name, u.pseudo, u.email]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            if (!hay.includes(needle)) return false;
          }
          return true;
        });
        const p = pageOf(args, ctx);
        return paged(list.slice(p.offset, p.offset + p.limit).map(compactStudent), p, {
          total: list.length,
        });
      },
    },
    get: {
      summary:
        'fiche de suivi : profil, groupes, tâches par statut, quiz par catégorie et notion, tutoriels lus, observations, carnet (nombre), récompenses, dernière activité',
      nominative: true,
      permission: STATS_PERMS,
      params: { student_id: req(studentId) },
      run: async (args, ctx) => {
        const profile = await fetchProfile(ctx, args.student_id);
        const activity = await studentActivity(args.student_id);
        return { profile, ...activity };
      },
    },
    timeline: {
      summary:
        'chronologie (tâches, quiz par jour, lectures, observations, carnet, récompenses, séances), la plus récente d’abord',
      nominative: true,
      permission: STATS_PERMS,
      params: {
        student_id: req(studentId),
        since: z.string().max(25).describe('Depuis (date ISO, ex. 2026-09-01)'),
        limit: z.number().int().min(1).max(1000).describe('Nombre maximal d’événements'),
      },
      run: async (args, ctx) => {
        await fetchProfile(ctx, args.student_id);
        const since = args.since ? new Date(args.since) : null;
        return studentTimeline(args.student_id, {
          limit: args.limit,
          since: since && !Number.isNaN(since.getTime()) ? since.toISOString() : undefined,
        });
      },
    },
    at_risk: {
      summary:
        'élèves à suivre : inactifs depuis N jours, tâches en retard, réussite au quiz sous un seuil',
      nominative: true,
      permission: STATS_PERMS,
      params: {
        group_id: z.string().max(64).describe('Restreindre à un groupe'),
        inactive_days: z.number().int().min(1).max(365).describe('Inactif depuis (défaut 14)'),
        quiz_threshold: z
          .number()
          .min(0)
          .max(100)
          .describe('Seuil de réussite au quiz en % (défaut 50)'),
        min_attempts: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .describe('Tentatives minimales pour juger le quiz (défaut 5)'),
        ...pageParams,
      },
      run: async (args, ctx) => {
        const days = args.inactive_days ?? 14;
        const threshold = args.quiz_threshold ?? 50;
        const minAttempts = args.min_attempts ?? 5;
        const students = (await visibleStudents(ctx)).filter(
          (u) =>
            u.is_active && (!args.group_id || (u.groups || []).some((g) => g.id === args.group_id)),
        );
        const signals = await studentRiskSignals(students.map((u) => u.id));
        const limitDate = new Date(Date.now() - days * 86400000).toISOString();
        const flagged = [];
        for (const u of students) {
          const s = signals.get(String(u.id)) || {};
          const reasons = [];
          if (!s.last_activity_at || s.last_activity_at < limitDate) reasons.push('inactif');
          if (s.overdue_tasks > 0) reasons.push('taches_en_retard');
          const rate = s.quiz_attempts
            ? Math.round((s.quiz_correct * 1000) / s.quiz_attempts) / 10
            : null;
          if (s.quiz_attempts >= minAttempts && rate < threshold) reasons.push('quiz_faible');
          if (!reasons.length) continue;
          flagged.push({
            ...compactStudent(u),
            reasons,
            last_activity_at: s.last_activity_at || null,
            overdue_tasks: s.overdue_tasks || 0,
            quiz_attempts: s.quiz_attempts || 0,
            quiz_success_rate_percent: rate,
          });
        }
        flagged.sort((a, b) => b.reasons.length - a.reasons.length);
        const p = pageOf(args, ctx);
        return paged(flagged.slice(p.offset, p.offset + p.limit), p, {
          total: flagged.length,
          examined: students.length,
          criteria: { inactive_days: days, quiz_threshold: threshold, min_attempts: minAttempts },
        });
      },
    },
    create_bulk: {
      summary:
        'créer ou mettre à jour en masse (mêmes colonnes et règles que l’import : role, first_name, last_name, password, groups, pseudo, email, description) ; dry_run pour simuler',
      write: true,
      nominative: true,
      params: {
        rows: req(z.array(z.record(z.string(), z.unknown())).min(1).max(1000)),
        dry_run: z.boolean().describe('Simulation sans écriture'),
        existing_strategy: z
          .enum(['update', 'fill', 'skip'])
          .describe('Comptes existants : mettre à jour, compléter ou ignorer'),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'POST',
          '/api/students/import',
          {
            fileDataBase64: Buffer.from(rowsToCsv(args.rows), 'utf8').toString('base64'),
            fileName: 'mcp-import.csv',
            dryRun: !!args.dry_run,
            ...(args.existing_strategy ? { existingStrategy: args.existing_strategy } : {}),
          },
          { tool: TOOL },
        ),
    },
    update: {
      summary: 'modifier la fiche (prénom, nom, pseudo, e-mail, description)',
      write: true,
      nominative: true,
      params: {
        student_id: req(studentId),
        first_name: z.string().min(1).max(120),
        last_name: z.string().min(1).max(120),
        pseudo: z.union([z.string().max(64), z.null()]),
        email: z.union([z.string().max(190), z.null()]),
        description: z.union([z.string().max(2000), z.null()]),
      },
      run: (args, ctx) => {
        const body = {};
        for (const k of ['first_name', 'last_name', 'pseudo', 'email', 'description']) {
          if (args[k] !== undefined) body[k] = args[k];
        }
        return patchStudent(ctx, args.student_id, body);
      },
    },
    deactivate: {
      summary: 'désactiver le compte (sessions coupées, données conservées)',
      write: true,
      nominative: true,
      params: { student_id: req(studentId) },
      run: (args, ctx) => patchStudent(ctx, args.student_id, { is_active: false }),
    },
    reactivate: {
      summary: 'réactiver le compte',
      write: true,
      nominative: true,
      params: { student_id: req(studentId) },
      run: (args, ctx) => patchStudent(ctx, args.student_id, { is_active: true }),
    },
    merge: {
      summary:
        'fusionner deux comptes (from → into) ; simulation par défaut, dry_run=false pour appliquer',
      write: true,
      nominative: true,
      params: {
        from_user_id: req(z.string().min(1).max(64).describe('Compte absorbé')),
        into_user_id: req(z.string().min(1).max(64).describe('Compte conservé')),
        dry_run: z.boolean().describe('Simulation (défaut true)'),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'POST',
          '/api/admin/integrations/moodle/merge',
          {
            fromUserId: args.from_user_id,
            intoUserId: args.into_user_id,
            dryRun: args.dry_run !== false,
          },
          { tool: TOOL },
        ),
    },
    reset_password_link: {
      summary:
        'lien de réinitialisation du mot de passe à transmettre à l’élève (durée limitée, champ reset_link)',
      write: true,
      nominative: true,
      params: { student_id: req(studentId) },
      run: (args, ctx) =>
        api(
          ctx,
          'POST',
          `/api/rbac/users/student/${seg(args.student_id)}/reset-password-link`,
          {},
          { tool: TOOL },
        ),
    },
    reset_totp: {
      summary: 'remettre à zéro la double authentification d’un compte',
      write: true,
      nominative: true,
      params: { student_id: req(studentId) },
      run: (args, ctx) =>
        api(ctx, 'POST', `/api/auth/totp/users/${seg(args.student_id)}/reset`, {}, { tool: TOOL }),
    },
    set_role: {
      summary: 'attribuer un profil (role_id numérique ; mêmes gardes de rang que l’interface)',
      write: true,
      nominative: true,
      params: {
        student_id: req(studentId),
        role_id: req(z.number().int().min(1).describe('Identifiant numérique du profil')),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'PUT',
          `/api/rbac/users/student/${seg(args.student_id)}/role`,
          { role_id: args.role_id },
          { tool: TOOL },
        ),
    },
  },
});

module.exports = { buildStudentsTool: () => tool };
