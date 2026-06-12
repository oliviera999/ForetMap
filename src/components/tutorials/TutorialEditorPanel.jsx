import React from 'react';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import { tutorialZonePickLabel } from '../../utils/tutorialListHelpers.js';
import {
  toggleTutorialFormLocation,
  applyTutorialFormMapChange,
} from '../../utils/tutorialFormHelpers.js';

/**
 * Éditeur de tutoriel (création / modification) — extrait de `tutorials-views.jsx` (O6).
 *
 * Champs titre/résumé/type/ordre, filtre carte avec refiltrage des lieux cochés, sélection de
 * zones et repères, bascule actif, contenu HTML (saisie, chemin statique ou import de fichier)
 * ou URL selon le type. Composant contrôlé : l'état `form` reste dans TutorialsView ; la
 * sauvegarde API est déléguée à `onSave`, les toasts à `onToast(message, ms)`.
 */
export function TutorialEditorPanel({
  form,
  setForm,
  saving,
  maps = [],
  zones = [],
  markers = [],
  onSave,
  onCancel,
  onToast,
}) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggleZoneId = (zoneId) => {
    setForm((f) => toggleTutorialFormLocation(f, 'zone_ids', zoneId));
  };

  const toggleMarkerId = (markerId) => {
    setForm((f) => toggleTutorialFormLocation(f, 'marker_ids', markerId));
  };

  const onFileHtml = async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      setForm((f) => ({ ...f, html_content: text, type: 'html' }));
      onToast?.('Fichier HTML chargé ✓', 2000);
    } catch {
      onToast?.('Impossible de lire le fichier HTML', 2000);
    }
  };

  const selectableZones = zones.filter((z) => !z.special && (!form.map_id || z.map_id === form.map_id));
  const selectableMarkers = markers.filter((m) => !form.map_id || m.map_id === form.map_id);

  return (
    <div className="plant-edit-form fade-in tuto-editor">
      <h4>{form.id ? 'Modifier le tutoriel' : 'Nouveau tutoriel'}</h4>
      <div className="field"><label>Titre *</label><input value={form.title} onChange={set('title')} /></div>
      <div className="field"><label>Résumé</label><MarkdownTextarea rows={2} value={form.summary} onChange={set('summary')} /></div>
      <div className="row">
        <div className="field">
          <label>Type</label>
          <select value={form.type} onChange={set('type')}>
            <option value="html">HTML</option>
            <option value="link">Lien</option>
          </select>
        </div>
        <div className="field">
          <label>Ordre</label>
          <input type="number" min="0" value={form.sort_order} onChange={set('sort_order')} />
        </div>
      </div>
      <div className="field">
        <label>Carte (filtre zones / repères)</label>
        <select
          value={form.map_id || ''}
          onChange={(e) => {
            const next = e.target.value;
            setForm((f) => applyTutorialFormMapChange(f, next, zones, markers));
          }}>
          <option value="">Toutes les cartes</option>
          {maps.map((mp) => (
            <option key={mp.id} value={mp.id}>{mp.label}</option>
          ))}
        </select>
        <p style={{ fontSize: '.78rem', color: '#666', margin: '6px 0 0', lineHeight: 1.4 }}>
          Lieux choisis : pastille violette sur la carte et détail dans la fiche zone ou repère.
        </p>
      </div>
      <div className="field"><label>Zones et repères sur la carte (optionnel)</label>
        <div className="task-form-pick-list">
          {selectableZones.length === 0 && selectableMarkers.length === 0 ? (
            <p className="task-form-pick-empty">Aucune zone ni repère pour ce filtre.</p>
          ) : (
            <>
              {selectableZones.length > 0 && (
                <>
                  {selectableMarkers.length > 0 && (
                    <div className="task-form-pick-subheading" aria-hidden="true">Zones</div>
                  )}
                  {selectableZones.map((z) => (
                    <label key={z.id} className="task-form-pick-item">
                      <input
                        type="checkbox"
                        className="task-form-pick-checkbox"
                        checked={(form.zone_ids || []).map(String).includes(String(z.id))}
                        onChange={() => toggleZoneId(z.id)}
                      />
                      <span className="task-form-pick-text">{tutorialZonePickLabel(z)}</span>
                    </label>
                  ))}
                </>
              )}
              {selectableMarkers.length > 0 && (
                <>
                  {selectableZones.length > 0 && (
                    <div className="task-form-pick-subheading" aria-hidden="true">Repères</div>
                  )}
                  {selectableMarkers.map((m) => (
                    <label key={m.id} className="task-form-pick-item">
                      <input
                        type="checkbox"
                        className="task-form-pick-checkbox"
                        checked={(form.marker_ids || []).map(String).includes(String(m.id))}
                        onChange={() => toggleMarkerId(m.id)}
                      />
                      <span className="task-form-pick-text">{m.emoji} {m.label}</span>
                    </label>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
      {form.id && (
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={!!form.is_active}
              onChange={e => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Tutoriel actif
          </label>
        </div>
      )}
      {form.type === 'html' && (
        <>
          <div className="field">
            <label>Contenu HTML</label>
            <textarea rows={8} value={form.html_content} onChange={set('html_content')} placeholder="<h1>Mon tuto</h1>" />
          </div>
          <div className="field">
            <label>Ou fichier statique (chemin /tutos/...)</label>
            <input value={form.source_file_path} onChange={set('source_file_path')} placeholder="/tutos/fiche-exemple.html" />
          </div>
          <label className="btn btn-ghost btn-sm" style={{ width: 'fit-content', cursor: 'pointer' }}>
            Importer un fichier HTML
            <input type="file" accept=".html,text/html" style={{ display: 'none' }} onChange={onFileHtml} />
          </label>
        </>
      )}
      {form.type === 'link' && (
        <div className="field">
          <label>URL</label>
          <input value={form.source_url} onChange={set('source_url')} placeholder="https://..." />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={onSave}>
          {saving ? 'Sauvegarde...' : '💾 Enregistrer'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}
