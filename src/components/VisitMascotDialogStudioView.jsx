import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, AccountDeletedError } from '../services/api';
import VisitMascotDialogEditor from './VisitMascotDialogEditor.jsx';
import { getVisitMascotCatalog } from '../utils/visitMascotCatalog.js';
import {
  parseCatalogDialogOverridesJson,
  parseDialogProfileJson,
  stringifyCatalogDialogOverrides,
  stringifyDialogProfile,
} from '../utils/visitMascotDialogEvents.js';

const GLOBAL_SCOPE = '__global__';

/**
 * @param {{ onForceLogout?: () => void, catalogModelOptions?: Array<{ id: string, label: string }> }} props
 */
export default function VisitMascotDialogStudioView({
  onForceLogout,
  catalogModelOptions = null,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [globalDefaults, setGlobalDefaults] = useState({});
  const [catalogOverrides, setCatalogOverrides] = useState({});
  const [selectedScope, setSelectedScope] = useState(GLOBAL_SCOPE);

  const catalogOptions = useMemo(() => {
    if (Array.isArray(catalogModelOptions) && catalogModelOptions.length > 0) {
      return catalogModelOptions
        .map((m) => ({
          id: String(m?.id || '').trim(),
          label: String(m?.label || m?.id || '').trim(),
        }))
        .filter((m) => m.id);
    }
    return getVisitMascotCatalog()
      .map((m) => ({
        id: String(m?.id || '').trim(),
        label: String(m?.label || m?.id || '').trim(),
      }))
      .filter((m) => m.id);
  }, [catalogModelOptions]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api('/api/settings/admin');
      const rows = Array.isArray(res?.settings) ? res.settings : [];
      const byKey = Object.fromEntries(rows.map((r) => [String(r.key || ''), r.value]));
      const defaultsParsed = parseDialogProfileJson(
        byKey['content.visit.mascot_dialog.defaults'] ?? '{}',
      );
      const catalogParsed = parseCatalogDialogOverridesJson(
        byKey['content.visit.mascot_dialog.catalog_overrides'] ?? '{}',
      );
      setGlobalDefaults(defaultsParsed.ok ? defaultsParsed.profile : {});
      setCatalogOverrides(catalogParsed.ok ? catalogParsed.overrides : {});
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setError(e.message || 'Chargement des dialogues impossible');
    } finally {
      setLoading(false);
    }
  }, [onForceLogout]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const editingProfile = useMemo(() => {
    if (selectedScope === GLOBAL_SCOPE) return globalDefaults;
    return catalogOverrides[selectedScope] || {};
  }, [catalogOverrides, globalDefaults, selectedScope]);

  const onProfileChange = useCallback(
    (nextProfile) => {
      if (selectedScope === GLOBAL_SCOPE) {
        setGlobalDefaults(nextProfile);
        return;
      }
      setCatalogOverrides((prev) => {
        const out = { ...prev };
        const cleanedKeys = Object.keys(nextProfile || {});
        if (cleanedKeys.length === 0) {
          delete out[selectedScope];
        } else {
          out[selectedScope] = nextProfile;
        }
        return out;
      });
    },
    [selectedScope],
  );

  const onSave = useCallback(async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api('/api/settings/admin/content.visit.mascot_dialog.defaults', 'PUT', {
        value: stringifyDialogProfile(globalDefaults),
      });
      await api('/api/settings/admin/content.visit.mascot_dialog.catalog_overrides', 'PUT', {
        value: stringifyCatalogDialogOverrides(catalogOverrides),
      });
      setMessage('Dialogues enregistrés.');
      await loadSettings();
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setError(e.message || 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  }, [catalogOverrides, globalDefaults, loadSettings, onForceLogout]);

  const inheritedContext = useMemo(() => {
    if (selectedScope === GLOBAL_SCOPE) return null;
    return {
      mascotId: selectedScope,
      globalDefaults,
      catalogOverrides: {},
    };
  }, [globalDefaults, selectedScope]);

  return (
    <div className="visit-mascot-dialog-studio">
      <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>Bulles de dialogue</h2>
      <p className="section-sub" style={{ fontSize: '0.82rem' }}>
        Définissez les messages affichés selon la situation sur la carte visite. Les défauts globaux
        s’appliquent à toutes les mascottes ; vous pouvez surcharger par mascotte catalogue. Les
        packs publiés peuvent encore surcharger via l’onglet « Bulles de dialogue » du pack.
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <label style={{ fontSize: '0.85rem' }}>
          Périmètre{' '}
          <select
            className="form-select"
            value={selectedScope}
            onChange={(ev) => setSelectedScope(ev.target.value)}
          >
            <option value={GLOBAL_SCOPE}>Défauts globaux (toutes mascottes)</option>
            {catalogOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={saving || loading}
          onClick={() => void onSave()}
        >
          Enregistrer sur le serveur
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={loading}
          onClick={() => void loadSettings()}
        >
          Actualiser
        </button>
      </div>
      {loading ? <p className="section-sub">Chargement…</p> : null}
      {error ? (
        <p className="text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="section-sub" role="status">
          {message}
        </p>
      ) : null}
      {!loading ? (
        <VisitMascotDialogEditor
          profile={editingProfile}
          onProfileChange={onProfileChange}
          inheritedContext={inheritedContext}
          allowInheritToggle={selectedScope !== GLOBAL_SCOPE}
        />
      ) : null}
    </div>
  );
}
