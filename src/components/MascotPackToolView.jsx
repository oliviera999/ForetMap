import React, { useCallback, useMemo, useState } from 'react';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';
import { validateMascotPackV1, expandMascotPackToSpriteCut } from '../utils/mascotPack.js';
import VisitMapMascotSpriteCut from './VisitMapMascotSpriteCut.jsx';
import VisitMascotFallbackSvg from './VisitMascotFallbackSvg.jsx';

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

const STATE_OPTIONS = Object.values(VISIT_MASCOT_STATE).sort();

const SILHOUETTES = [
  'gnome', 'spore', 'vine', 'moss', 'seed', 'swarm', 'sprout', 'scrap',
  'olu', 'tanBird', 'backpackFox', 'backpackFox2',
];

/**
 * Outil dev : composer / valider un mascot pack v1 (hors navigation élève).
 * @param {{ embedded?: boolean }} [props] — `embedded` : affichage compact dans une modale (ex. onglet Visite).
 */
export default function MascotPackToolView({ embedded = false } = {}) {
  const [jsonText, setJsonText] = useState(DEFAULT_PACK_JSON);
  const [message, setMessage] = useState('');
  const [previewState, setPreviewState] = useState(VISIT_MASCOT_STATE.IDLE);
  const [validated, setValidated] = useState(null);

  const onValidate = useCallback(() => {
    let raw;
    try {
      raw = JSON.parse(jsonText);
    } catch (e) {
      setMessage(`JSON invalide : ${e.message}`);
      setValidated(null);
      return;
    }
    const result = validateMascotPackV1(raw, { relaxAssetPrefix: true });
    if (!result.ok) {
      setMessage(result.error.format ? result.error.format() : String(result.error));
      setValidated(null);
      return;
    }
    setValidated(result);
    setMessage(`Valide — id « ${result.pack.id} », ${Object.keys(result.pack.stateFrames).length} état(s).`);
  }, [jsonText]);

  const mascotConfig = useMemo(() => {
    if (!validated?.ok) return null;
    return {
      id: validated.pack.id,
      renderer: 'sprite_cut',
      fallbackSilhouette: validated.pack.fallbackSilhouette || 'gnome',
      spriteCut: validated.spriteCut,
    };
  }, [validated]);

  const onCopyJson = useCallback(() => {
    navigator.clipboard.writeText(jsonText).then(
      () => setMessage('JSON copié dans le presse-papiers.'),
      () => setMessage('Copie impossible (permissions navigateur).'),
    );
  }, [jsonText]);

  const onDownload = useCallback(() => {
    const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mascot-pack.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setMessage('Téléchargement lancé (mascot-pack.json).');
  }, [jsonText]);

  if (!import.meta.env.DEV) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui' }}>
        <h1>Outil mascot pack</h1>
        <p>Cette page n’est disponible qu’en build développement (`npm run dev`).</p>
      </div>
    );
  }

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
        <h1 style={{ fontSize: '1.35rem' }}>Outil dev — Mascotte pack v1 (`sprite_cut`)</h1>
      )}
      <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>
        Éditez le JSON, validez, prévisualisez avec les vrais chemins ou des URLs blob après chargement local.
        Référence : <code>docs/MASCOT_PACK.md</code>
        {embedded ? ' — page autonome : /mascot-pack-tool.html (Vite).' : null}
      </p>

      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
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

      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={onValidate}>Valider</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCopyJson}>Copier JSON</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDownload}>Télécharger JSON</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setJsonText(DEFAULT_PACK_JSON)}>Réinitialiser l’exemple</button>
      </div>

      {message ? (
        <pre style={{
          marginTop: 12,
          padding: 10,
          background: 'rgba(240,253,244,0.9)',
          borderRadius: 8,
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
        >
          {message}
        </pre>
      ) : null}

      {mascotConfig ? (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: '1.1rem' }}>Prévisualisation</h2>
          <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label>
              État :{' '}
              <select
                value={previewState}
                onChange={(e) => setPreviewState(e.target.value)}
                className="form-select"
                style={{ minWidth: 160 }}
              >
                {STATE_OPTIONS.filter((s) => mascotConfig.spriteCut.stateFrames[s]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <span style={{ fontSize: '0.85rem', opacity: 0.85 }}>
              Silhouette secours : {mascotConfig.fallbackSilhouette}
            </span>
          </div>
          <div
            className="visit-mascot-preview-body visit-mascot-preview-body--motion-idle"
            style={{
              width: 120,
              height: 130,
              border: '1px dashed rgba(26,71,49,0.35)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(248,250,245,0.95)',
            }}
          >
            <VisitMapMascotSpriteCut
              mascotId={mascotConfig.id}
              mascotState={previewState}
              mascotConfig={mascotConfig}
              fallback={(
                <VisitMascotFallbackSvg
                  silhouette={mascotConfig.fallbackSilhouette}
                  variant="forest"
                />
              )}
            />
          </div>
        </section>
      ) : null}

      <section style={{ marginTop: 28, fontSize: '0.88rem', opacity: 0.9 }}>
        <h2 style={{ fontSize: '1.05rem' }}>Intégration</h2>
        <ol style={{ paddingLeft: 18, lineHeight: 1.5 }}>
          <li>Déposer les PNG sous <code>public/assets/mascots/&lt;id&gt;/frames/</code>.</li>
          <li><code>npm run mascot:pack:validate -- votre-pack.json</code></li>
          <li>Ajouter l’entrée dans <code>visitMascotCatalog.js</code> (ou manifeste généré + import).</li>
          <li><code>npm run build</code> si prod sert <code>dist/</code>.</li>
        </ol>
      </section>
    </div>
  );
}
