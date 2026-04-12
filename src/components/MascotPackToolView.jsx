import React, { useCallback, useState } from 'react';
import { parsePackJson, stringifyPack } from '../utils/mascotPackEditorModel.js';
import MascotPackWysiwygEditor from './MascotPackWysiwygEditor.jsx';

const DEFAULT_PACK_JSON = `{
  "mascotPackVersion": 1,
  "id": "exemple-pack",
  "label": "Exemple pack (documentation)",
  "renderer": "sprite_cut",
  "framesBase": "/assets/mascots/exemple-pack/frames/",
  "frameWidth": 64,
  "frameHeight": 64,
  "pixelated": true,
  "displayScale": 1,
  "fallbackSilhouette": "gnome",
  "stateFrames": {
    "idle": { "files": ["idle-0.png", "idle-1.png"], "fps": 4, "frameDwellMs": [200, 350] },
    "walking": { "files": ["walk-0.png", "walk-1.png", "walk-2.png"], "fps": 10 }
  }
}`;

/**
 * Composer / valider un mascot pack v1 (`sprite_cut`) : éditeur visuel + onglet JSON.
 * @param {{
 *   embedded?: boolean,
 *   hideIntegrationSection?: boolean,
 * }} [props]
 */
export default function MascotPackToolView({
  embedded = false,
  hideIntegrationSection = false,
} = {}) {
  const [editorTab, setEditorTab] = useState('visual');
  const [pack, setPack] = useState(() => {
    const p = parsePackJson(DEFAULT_PACK_JSON);
    return p.ok ? p.pack : {};
  });
  const [jsonDraft, setJsonDraft] = useState(DEFAULT_PACK_JSON);
  const [jsonError, setJsonError] = useState('');

  const applyJson = useCallback(() => {
    const parsed = parsePackJson(jsonDraft);
    if (!parsed.ok) {
      setJsonError(parsed.error || 'JSON invalide');
      return;
    }
    setJsonError('');
    setPack(parsed.pack);
    setEditorTab('visual');
  }, [jsonDraft]);

  const resetExample = useCallback(() => {
    const p = parsePackJson(DEFAULT_PACK_JSON);
    if (p.ok) setPack(p.pack);
    setJsonError('');
    setEditorTab('visual');
  }, []);

  const pad = embedded ? 8 : 20;
  const maxW = embedded ? '100%' : 960;

  return (
    <div style={{
      padding: pad,
      maxWidth: maxW,
      margin: embedded ? 0 : '0 auto',
      fontFamily: 'var(--font-sans-with-emoji, DM Sans, system-ui)',
      color: '#1a4731',
    }}
    >
      {embedded ? (
        <h2 style={{ fontSize: '1.15rem', marginTop: 0 }}>Mascotte pack v1 (`sprite_cut`)</h2>
      ) : (
        <h1 style={{ fontSize: '1.35rem' }}>Mascotte pack v1 (`sprite_cut`)</h1>
      )}
      <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>
        Éditeur visuel (WYSIWYG) ou JSON pour export. Référence : <code>docs/MASCOT_PACK.md</code>
        {embedded && !hideIntegrationSection ? ' — page autonome : /mascot-pack-tool.html' : null}
      </p>

      <div className="visit-mascot-pack-manager__tabs" role="tablist" style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button
          type="button"
          role="tab"
          aria-selected={editorTab === 'visual'}
          className={`btn btn-sm ${editorTab === 'visual' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setEditorTab('visual'); setJsonError(''); }}
        >
          Éditeur visuel
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={editorTab === 'json'}
          className={`btn btn-sm ${editorTab === 'json' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setEditorTab('json'); setJsonDraft(stringifyPack(pack, 2)); setJsonError(''); }}
        >
          JSON / export
        </button>
      </div>

      {editorTab === 'visual' ? (
        <MascotPackWysiwygEditor
          pack={pack}
          onPackChange={setPack}
          packUuid={null}
          relaxAssetPrefix
        />
      ) : (
        <div className="mascot-pack-json-tab">
          <textarea
            value={jsonDraft}
            onChange={(ev) => { setJsonDraft(ev.target.value); setJsonError(''); }}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: 220,
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid rgba(26,71,49,0.25)',
              padding: 10,
              boxSizing: 'border-box',
            }}
          />
          {jsonError ? (
            <p className="text-danger" role="alert" style={{ fontSize: '0.82rem' }}>{jsonError}</p>
          ) : null}
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={applyJson}>
              Appliquer le JSON
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard.writeText(jsonDraft)}>
              Copier JSON
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const blob = new Blob([jsonDraft], { type: 'application/json;charset=utf-8' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'mascot-pack.json';
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >
              Télécharger JSON
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetExample}>
              Réinitialiser l’exemple
            </button>
          </div>
        </div>
      )}

      {!hideIntegrationSection ? (
        <section style={{ marginTop: 28, fontSize: '0.88rem', opacity: 0.9 }}>
          <h2 style={{ fontSize: '1.05rem' }}>Intégration</h2>
          <ol style={{ paddingLeft: 18, lineHeight: 1.5 }}>
            <li>Déposer les PNG sous <code>public/assets/mascots/&lt;id&gt;/frames/</code> ou publier un pack avec images via l’API (voir <code>docs/MASCOT_PACK.md</code>).</li>
            <li><code>npm run mascot:pack:validate -- votre-pack.json</code></li>
            <li>Packs publiés sur le serveur : visibles dans le sélecteur mascotte (onglet Visite) sans modifier <code>visitMascotCatalog.js</code>.</li>
            <li><code>npm run build</code> si prod sert <code>dist/</code>.</li>
          </ol>
        </section>
      ) : null}
    </div>
  );
}
