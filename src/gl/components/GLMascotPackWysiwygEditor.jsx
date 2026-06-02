import React, { useEffect, useMemo, useState } from 'react';
import { GLButton } from './ui/GLButton.jsx';
import { validateGlMascotPackForUi } from '../../shared/mascot-pack/glPackValidationUi.js';
import { MascotPackValidationList } from '../../shared/mascot-pack/MascotPackValidationList.jsx';
import { MascotPackSpriteCutPreview } from '../../shared/mascot-pack/MascotPackSpriteCutPreview.jsx';
import { glMascotPackSpriteCutToVisitValidation } from '../../utils/glMascotPackToVisit.js';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';

const DEFAULT_PAYLOAD = {
  id: 'gl-pack',
  name: 'Nouveau pack GL',
  renderer: 'sprite_cut',
  assets: [],
  states: [{ key: 'idle', frames: [0] }],
};

export function GLMascotPackWysiwygEditor({ initialPack, onSave, onDelete }) {
  const [name, setName] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState('');
  const [validation, setValidation] = useState({ ok: false, issueLines: [] });
  const [visitPreview, setVisitPreview] = useState(null);

  useEffect(() => {
    const pack = initialPack || null;
    setName(pack?.name || '');
    setChapterId(pack?.chapter_id == null ? '' : String(pack.chapter_id));
    setJsonText(JSON.stringify(pack?.payload || DEFAULT_PAYLOAD, null, 2));
    setParseError('');
    setValidation({ ok: false, issueLines: [] });
    setVisitPreview(null);
  }, [initialPack]);

  const parsedPayload = useMemo(() => {
    try {
      return { ok: true, value: JSON.parse(jsonText) };
    } catch (err) {
      return { ok: false, error: err?.message || 'JSON invalide' };
    }
  }, [jsonText]);

  useEffect(() => {
    if (!parsedPayload.ok) {
      setParseError(parsedPayload.error);
      setValidation({ ok: false, issueLines: [] });
      setVisitPreview(null);
      return;
    }
    setParseError('');
    const ui = validateGlMascotPackForUi(parsedPayload.value);
    setValidation(ui);
    if (ui.ok && ui.pack?.renderer === 'sprite_cut') {
      const mapped = glMascotPackSpriteCutToVisitValidation(ui.pack, { relaxAssetPrefix: true });
      setVisitPreview(mapped.ok ? mapped : null);
    } else {
      setVisitPreview(null);
    }
  }, [parsedPayload]);

  function submit(event) {
    event.preventDefault();
    if (!parsedPayload.ok) {
      setParseError(parsedPayload.error);
      return;
    }
    if (!validation.ok) return;
    onSave?.({
      id: initialPack?.id || null,
      name: String(name || '').trim() || 'Pack GL',
      chapterId: chapterId ? Number(chapterId) : null,
      payload: parsedPayload.value,
    });
    setParseError('');
  }

  return (
    <form className="gl-form" onSubmit={submit}>
      <label>
        Nom du pack
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Chapter ID (optionnel)
        <input value={chapterId} onChange={(event) => setChapterId(event.target.value)} />
      </label>
      <label>
        JSON pack
        <textarea value={jsonText} onChange={(event) => setJsonText(event.target.value)} rows={14} />
      </label>
      {parseError ? <p className="gl-error">{parseError}</p> : null}
      <MascotPackValidationList
        issueLines={validation.issueLines}
        className="gl-error-block"
        title="Erreurs de validation du pack"
      />
      {visitPreview?.ok ? (
        <MascotPackSpriteCutPreview
          validated={visitPreview}
          title="Prévisualisation (sprite_cut → renderer visite)"
          stateOptions={Object.values(VISIT_MASCOT_STATE)}
          defaultState={VISIT_MASCOT_STATE.IDLE}
          previewClassName="gl-panel"
        />
      ) : null}
      <div className="gl-inline-actions">
        <GLButton type="submit" disabled={!validation.ok || !!parseError}>
          Enregistrer le pack
        </GLButton>
        {initialPack?.id ? (
          <GLButton type="button" variant="danger" onClick={() => onDelete?.(initialPack.id)}>
            Supprimer le pack
          </GLButton>
        ) : null}
      </div>
    </form>
  );
}
