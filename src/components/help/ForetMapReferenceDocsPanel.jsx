import { useCallback, useEffect, useState } from 'react';
import { IconWarning } from '../../shared/icons.jsx';

import { api } from '../../services/api';
import { MarkdownContent } from '../MarkdownContent.jsx';

/**
 * Consultation de la documentation de référence fonctionnelle ForetMap
 * (`docs/reference/foretmap/*.md`), en **lecture seule**.
 *
 * Pendant du panneau GL « Contenus → Doc de référence », sans son étage
 * d'édition : côté ForetMap les fichiers versionnés dans Git font foi, et
 * amender un document reste un acte de développement. L'intérêt ici est de
 * rendre cette documentation — non technique, destinée aux professeurs et
 * administrateurs — accessible sans passer par le dépôt.
 */
export function ForetMapReferenceDocsPanel() {
  const [docs, setDocs] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState(null);
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api('/api/admin/reference-docs')
      .then((data) => {
        if (cancelled) return;
        setDocs(Array.isArray(data?.docs) ? data.docs : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Documentation indisponible');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openDoc = useCallback(async (slug) => {
    setLoading(true);
    setError('');
    try {
      const data = await api(`/api/admin/reference-docs/${encodeURIComponent(slug)}`);
      setDoc(data?.doc || null);
      setSelectedSlug(slug);
    } catch (err) {
      setError(err.message || 'Document introuvable');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <section className="fm-reference-docs" data-testid="foretmap-reference-docs">
      <p className="section-sub">
        Documentation fonctionnelle non technique, à jour du dépôt. Elle décrit ce que fait
        l’application, en français simple. Lecture seule : pour la faire évoluer, passez par une
        demande de développement.
      </p>
      {error ? (
        <div className="auth-error">
          <IconWarning size={14} /> {error}
        </div>
      ) : null}

      {selectedSlug && doc ? (
        <div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSelectedSlug(null);
              setDoc(null);
            }}
          >
            ← Retour au sommaire
          </button>
          <h3 style={{ marginTop: 12 }}>{doc.title}</h3>
          <MarkdownContent>{doc.bodyMarkdown}</MarkdownContent>
        </div>
      ) : (
        <div className="fm-reference-docs__list">
          {docs.length === 0 && !error ? (
            <p className="section-sub">Aucun document de référence n’est déployé.</p>
          ) : null}
          {docs.map((entry) => (
            <button
              key={entry.slug}
              type="button"
              className="fm-reference-docs__item"
              onClick={() => openDoc(entry.slug)}
              disabled={loading}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 12,
                marginBottom: 8,
                minHeight: 44,
                cursor: 'pointer',
              }}
            >
              <strong>{entry.title}</strong>
              {entry.summary ? (
                <p className="section-sub" style={{ margin: '4px 0 0' }}>
                  {entry.summary}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
