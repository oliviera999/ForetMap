'use strict';

/**
 * `foretmap_calendar` — calendrier scolaire (lot D4) : années, jours ouvrables, fermetures
 * (vacances, fériés, établissement fermé) et ouvertures exceptionnelles.
 *
 * Par l'API (`/api/school-calendar`) : lecture `GET /admin` (`admin.settings.read`) ou
 * `GET /` sur une période (`tasks.manage`) ; écritures `PUT /days`, `PUT /weekdays`,
 * `POST /years` (`admin.settings.write`), journalisées par la route. Le calendrier règle les
 * échéances et rappels des tâches (`lib/schoolCalendar.js`).
 */

const { z } = require('zod');
const { defineDomainTool, req, api, qs } = require('./factory');

const TOOL = 'foretmap_calendar';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date AAAA-MM-JJ')
  .describe('Jour (AAAA-MM-JJ)');

const tool = defineDomainTool({
  name: TOOL,
  domain: 'calendar',
  title: 'Calendrier scolaire',
  intro:
    'Calendrier scolaire de l’établissement : état du jour, années scolaires, jours ouvrables de la semaine, jours fermés (vacances, fériés, fermeture) et ouvertures exceptionnelles ; fermer, ouvrir ou remettre à la normale une période ; préparer une nouvelle année.',
  actions: {
    get: {
      summary:
        'vue d’édition (années, jours ouvrables, jours d’une année : year_id) ; avec from / to : jours de la période',
      params: {
        year_id: z.number().int().positive().describe('Année scolaire'),
        from: day,
        to: day,
      },
      run: (args, ctx) => {
        if (args.from || args.to) {
          return api(
            ctx,
            'GET',
            `/api/school-calendar${qs({ from: args.from, to: args.to })}`,
            undefined,
            { tool: TOOL },
          );
        }
        return api(
          ctx,
          'GET',
          `/api/school-calendar/admin${qs({ year_id: args.year_id })}`,
          undefined,
          {
            tool: TOOL,
          },
        );
      },
    },
    set_days: {
      summary:
        'période from → to : close (kind vacation / holiday / closed, label), open (ouverture exceptionnelle) ou reset (jours ouvrables)',
      write: true,
      params: {
        from: req(day),
        to: req(day),
        mode: req(z.enum(['close', 'open', 'reset']).describe('Action sur la période')),
        kind: z.enum(['vacation', 'holiday', 'closed']).describe('Type de fermeture (close)'),
        label: z.string().max(120).describe('Libellé (ex. Vacances de printemps)'),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'PUT',
          '/api/school-calendar/days',
          {
            from: args.from,
            to: args.to,
            action: args.mode,
            kind: args.kind,
            label: args.label,
          },
          { tool: TOOL },
        ),
    },
    set_weekdays: {
      summary: 'jours ouvrables de la semaine (0 = dimanche … 6 = samedi)',
      write: true,
      params: {
        open_weekdays: req(z.array(z.number().int().min(0).max(6)).max(7).describe('Jours')),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'PUT',
          '/api/school-calendar/weekdays',
          { open_weekdays: args.open_weekdays },
          { tool: TOOL },
        ),
    },
    prepare_year: {
      summary:
        'créer une année scolaire (libellé, début, fin), jours calés sur les jours ouvrables',
      write: true,
      params: {
        label: req(z.string().min(1).max(64).describe('Libellé (ex. 2027-2028)')),
        starts_on: req(day),
        ends_on: req(day),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'POST',
          '/api/school-calendar/years',
          { label: args.label, starts_on: args.starts_on, ends_on: args.ends_on },
          { tool: TOOL },
        ),
    },
  },
});

function buildCalendarTool() {
  return tool;
}

module.exports = { buildCalendarTool };
