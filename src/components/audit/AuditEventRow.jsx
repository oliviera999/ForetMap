import { useState } from 'react';
import {
  actorName,
  formatDateTime,
  formatTime,
  prettyPayload,
  summarizeUserAgent,
  truncate,
  userTypeLabel,
  viaLabel,
} from './auditFormat.js';

function Field({ label, children }) {
  if (children == null || children === '' || children === false) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/**
 * Une ligne du journal : résumé lisible (qui, quoi, sur quoi, quand) et, au clic, le détail
 * complet (identifiants, motif, canal, IP, navigateur, charge JSON).
 *
 * @param {{ event: object, roleTerms: object, extended?: boolean, showIp?: boolean,
 *   onSelectActor?: (actor: object) => void }} props
 */
export function AuditEventRow({
  event: e,
  roleTerms,
  extended = false,
  showIp = false,
  onSelectActor,
}) {
  const [open, setOpen] = useState(false);
  const actor = e.actor;
  const typeLabel = userTypeLabel(actor?.user_type || e.actor_user_type, roleTerms);
  const payloadTarget =
    e.payload && typeof e.payload === 'object' && e.payload.target_user_id
      ? String(e.payload.target_user_id)
      : '';
  const targetIsActor =
    actor &&
    e.target_id &&
    String(e.target_id) === String(actor.id) &&
    (!payloadTarget || payloadTarget === String(actor.id));
  const targetText = targetIsActor
    ? ''
    : e.target_label ||
      (e.target_id ? `${e.target_type || 'cible'} #${truncate(e.target_id, 10)}` : '');
  const detailText = e.details || e.reason_label || '';
  const browser = showIp ? summarizeUserAgent(e.user_agent) : '';
  const payloadText = prettyPayload(e.payload);

  return (
    <li
      className={`audit-event${e.failure ? ' is-failure' : ''}${e.major ? ' is-major' : ''}`}
      data-category={e.category}
    >
      <button
        type="button"
        className="audit-event-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`audit-event-dot audit-cat-${e.category || 'other'}`} aria-hidden="true" />
        <span className="audit-event-main">
          <span className="audit-event-title">
            {e.action_label || e.action}
            {e.failure ? <span className="audit-badge audit-badge--failure">Échec</span> : null}
            {e.via === 'mcp' ? <span className="audit-badge">Connecteur</span> : null}
            {e.on_behalf_of ? (
              <span className="audit-badge audit-badge--warn">En tant que</span>
            ) : null}
          </span>
          <span className="audit-event-line">
            <strong>{actorName(actor)}</strong>
            {typeLabel ? <span className="audit-event-type"> ({typeLabel})</span> : null}
            {targetText ? <span> → {truncate(targetText, 60)}</span> : null}
            {detailText ? (
              <span className="audit-event-detail"> · {truncate(detailText, 90)}</span>
            ) : null}
          </span>
          <span className="audit-event-meta">
            <time dateTime={String(e.occurred_at || '')}>{formatTime(e.occurred_at)}</time>
            {' · '}
            {e.category_label}
            {e.on_behalf_of ? ` · pour ${e.on_behalf_of.name || 'un autre compte'}` : ''}
            {showIp && e.ip_address ? ` · IP ${e.ip_address}` : ''}
            {browser ? ` · ${browser}` : ''}
            {extended ? <code className="audit-event-code"> {e.action}</code> : null}
          </span>
        </span>
        <span className="audit-event-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div className="audit-event-details">
          <dl>
            <Field label="Date">{formatDateTime(e.occurred_at)}</Field>
            <Field label="Action">
              {e.action_label} <code>{e.action}</code>
            </Field>
            <Field label="Catégorie">{e.category_label}</Field>
            <Field label="Résultat">
              {e.failure ? 'Échec' : 'Réussi'}
              {e.reason_label ? ` — ${e.reason_label}` : ''}
              {e.reason && e.reason_label !== e.reason ? <code> {e.reason}</code> : null}
            </Field>
            <Field label="Auteur">
              {actor ? (
                <>
                  {actorName(actor)}
                  {typeLabel ? ` (${typeLabel})` : ''}
                  {actor.pseudo && actor.pseudo !== actor.name ? ` · @${actor.pseudo}` : ''}
                  {actor.is_active === false ? ' · compte désactivé' : ''}
                  <code> {actor.id}</code>
                </>
              ) : (
                'Aucun compte identifié'
              )}
            </Field>
            <Field label="Pour le compte de">
              {e.on_behalf_of ? (
                <>
                  {e.on_behalf_of.name || 'Compte'}
                  {e.on_behalf_of.user_type
                    ? ` (${userTypeLabel(e.on_behalf_of.user_type, roleTerms)})`
                    : ''}
                  <code> {e.on_behalf_of.id}</code>
                </>
              ) : null}
            </Field>
            <Field label="Cible">
              {e.target_type || e.target_id ? (
                <>
                  {e.target_label || '—'}
                  {e.target_type ? ` · ${e.target_type}` : ''}
                  {e.target_id ? <code> {e.target_id}</code> : null}
                </>
              ) : null}
            </Field>
            <Field label="Détail">{e.details}</Field>
            <Field label="Canal">{viaLabel(e.via)}</Field>
            {showIp ? (
              <>
                <Field label="Adresse IP">{e.ip_address}</Field>
                <Field label="Navigateur">
                  {e.user_agent ? (
                    <>
                      {summarizeUserAgent(e.user_agent)}
                      <span className="audit-ua">{e.user_agent}</span>
                    </>
                  ) : null}
                </Field>
              </>
            ) : null}
            <Field label="N° d’événement">{e.id}</Field>
          </dl>
          {payloadText ? (
            <details className="audit-payload">
              <summary>Données techniques</summary>
              <pre>{payloadText}</pre>
            </details>
          ) : null}
          {actor && onSelectActor ? (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => onSelectActor(actor)}
            >
              Voir l’activité de {actorName(actor)}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
