import React, { useEffect, useState } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';
import { apiGL } from '../services/apiGL.js';

export function GLContentPage({ slug, fallbackTitle }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [content, setContent] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiGL(`/api/gl/content/${encodeURIComponent(slug)}`)
      .then((data) => {
        if (!cancelled) setContent(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Chargement impossible');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) return <div className="gl-panel">Chargement...</div>;
  if (error) return <div className="gl-panel gl-error">{error}</div>;
  const title = content?.title || fallbackTitle || slug;
  const html = DOMPurify.sanitize(marked.parse(content?.bodyMarkdown || ''));
  return (
    <article className="gl-panel gl-markdown">
      <h2>{title}</h2>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
