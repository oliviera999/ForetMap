import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useLatestRequest } from '../../shared/hooks/useLatestRequest.js';
import { KEY_META } from '../../constants/settingsAdminMeta.js';

/** Libellés des sources d'une valeur (lot E du connecteur Claude). */
const SOURCE_LABELS = Object.freeze({
  env: 'serveur',
  base: 'réglage',
  défaut: 'défaut',
});

const PROFILE_LABELS = Object.freeze({
  admin: 'Administrateur',
  prof: 'n3boss',
  prof_classe: 'Prof de classe',
});

function SettingControl({ row, disabled, onSave }) {
  const label = KEY_META[row.key]?.label || row.key;
  const optionLabels = KEY_META[row.key]?.optionLabels || {};
  const id = `mcp-setting-${row.key.replace(/\W/g, '-')}`;
  if (row.type === 'boolean') {
    return (
      <label htmlFor={id} className="mcp-setting-toggle" style={{ minHeight: 44 }}>
        <input
          id={id}
          type="checkbox"
          checked={!!row.value}
          disabled={disabled}
          onChange={(e) => onSave(row.key, e.target.checked)}
        />{' '}
        {label}
      </label>
    );
  }
  if (row.type === 'enum') {
    return (
      <label htmlFor={id} style={{ display: 'block' }}>
        <span>{label}</span>
        <select
          id={id}
          value={String(row.value)}
          disabled={disabled}
          onChange={(e) => onSave(row.key, e.target.value)}
          style={{ minHeight: 44, display: 'block' }}
        >
          {(row.values || []).map((v) => (
            <option key={v} value={v}>
              {optionLabels[v] || v}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label htmlFor={id} style={{ display: 'block' }}>
      <span>{label}</span>
      <input
        id={id}
        type={row.type === 'number' ? 'number' : 'text'}
        defaultValue={row.value ?? ''}
        min={row.min ?? undefined}
        max={row.max ?? undefined}
        disabled={disabled}
        onBlur={(e) => {
          const raw = e.target.value;
          const next = row.type === 'number' ? Number(raw) : raw;
          if (String(next) !== String(row.value ?? '')) onSave(row.key, next);
        }}
        style={{ minHeight: 44, display: 'block' }}
      />
    </label>
  );
}

/**
 * Section « Connecteur Claude » des réglages : chaque clé `mcp.*` avec sa valeur effective et sa
 * source (serveur / réglage / défaut), grisée quand une variable d'environnement la verrouille ;
 * encart d'état (outils exposés par profil, bypass RGPD, dernière activité) ; bouton
 * « Couper l'écriture ».
 */
export function McpConnectorPanel({
  canWrite = false,
  saveSetting,
  savingKey = '',
  confirm = null,
  onMessage = null,
  onError = null,
}) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const latest = useLatestRequest();

  const load = useCallback(async () => {
    const isCurrent = latest();
    setLoading(true);
    try {
      const data = await api('/api/settings/admin/mcp/status');
      if (isCurrent()) setStatus(data);
    } catch (err) {
      if (isCurrent()) onError?.(err?.message || 'État du connecteur illisible.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [latest, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (key, value) => {
    await saveSetting?.(key, value, 'Réglage du connecteur enregistré');
    await load();
  };

  const cutWrites = async () => {
    const ok = confirm
      ? await confirm({
          message:
            'Couper l’écriture du connecteur ? Claude ne pourra plus rien modifier sur le site : pont API coupé, SQL d’écriture coupé, écritures de contenu en plan à valider.',
          confirmLabel: 'Couper l’écriture',
          danger: true,
        })
      : true;
    if (!ok) return;
    try {
      const out = await api('/api/settings/admin/mcp/write-off', 'POST', {});
      const lockedNote = out?.locked?.length
        ? ` (fixé par le serveur, inchangé : ${out.locked.map((l) => l.key).join(', ')})`
        : '';
      onMessage?.(`Écriture du connecteur coupée${lockedNote}.`);
      await load();
    } catch (err) {
      onError?.(err?.message || 'Coupure impossible.');
    }
  };

  if (!status) {
    return <p>{loading ? 'Chargement…' : 'État du connecteur indisponible.'}</p>;
  }

  return (
    <div className="mcp-connector-panel">
      {!status.enabled ? (
        <p role="status">
          Le connecteur est éteint sur ce serveur (variable MCP_ENABLED). Les réglages ci-dessous
          s’appliqueront dès qu’il sera allumé.
        </p>
      ) : null}

      <section aria-label="État du connecteur" className="mcp-connector-status">
        <p>
          Données nominatives des élèves :{' '}
          <strong>{status.privacy_bypass?.active ? 'accessibles' : 'masquées'}</strong>
          {status.privacy_bypass?.active && status.privacy_bypass?.ack_missing_reason
            ? ' (accusé de lecture du registre non renseigné)'
            : ''}
        </p>
        <ul>
          {(status.profiles || []).map((p) => (
            <li key={p.profile}>
              {PROFILE_LABELS[p.profile] || p.profile} :{' '}
              {p.connector
                ? `${p.count} outil(s)${p.scopes.includes('foretmap.write') ? ', écriture possible' : ', lecture seule'}`
                : 'connecteur non autorisé'}
            </li>
          ))}
        </ul>
        {canWrite ? (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={cutWrites}
            style={{ minHeight: 44 }}
          >
            Couper l’écriture
          </button>
        ) : null}
      </section>

      <section aria-label="Réglages du connecteur" className="mcp-connector-settings">
        {status.settings.map((row) => (
          <div key={row.key} className="mcp-setting-row" data-testid={`mcp-row-${row.key}`}>
            <SettingControl
              row={row}
              disabled={!canWrite || row.locked || savingKey === row.key}
              onSave={save}
            />
            <small>
              Source : {SOURCE_LABELS[row.source] || row.source}
              {row.locked ? ` — fixé par le serveur (${row.env})` : ''}
            </small>
          </div>
        ))}
      </section>

      <section aria-label="Dernière activité du connecteur">
        <h4>Dernière activité</h4>
        {status.activity?.length ? (
          <table>
            <thead>
              <tr>
                <th>Heure</th>
                <th>Compte</th>
                <th>Outil</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {status.activity.map((a) => (
                <tr key={a.id}>
                  <td>{a.at ? new Date(a.at).toLocaleString('fr-FR') : ''}</td>
                  <td>{a.actor || '—'}</td>
                  <td>{a.tool || '—'}</td>
                  <td>{a.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Aucune action récente par Claude.</p>
        )}
      </section>
    </div>
  );
}
