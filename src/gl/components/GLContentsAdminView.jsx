import React, { useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLContentPage } from './GLContentPage.jsx';

export function GLContentsAdminView({ auth }) {
  const [items, setItems] = useState([]);
  const [activeSlug, setActiveSlug] = useState('world');
  const [error, setError] = useState('');

  async function load() {
    try {
      const rows = await apiGL('/api/gl/admin/content');
      const list = Array.isArray(rows) ? rows : [];
      setItems(list);
      if (!list.some((item) => item.slug === activeSlug)) {
        setActiveSlug(list[0]?.slug || 'world');
      }
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement des contenus impossible');
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="gl-panel">
      <h2>Contenus editoriaux</h2>
      {error ? <p className="gl-error">{error}</p> : null}
      <div className="gl-content-admin-list">
        {items.map((item) => (
          <button
            key={item.slug}
            type="button"
            className={item.slug === activeSlug ? 'is-active' : ''}
            onClick={() => setActiveSlug(item.slug)}
          >
            {item.title || item.slug}
          </button>
        ))}
      </div>
      {activeSlug ? (
        <GLContentPage
          slug={activeSlug}
          fallbackTitle={items.find((item) => item.slug === activeSlug)?.title || activeSlug}
          auth={auth}
          onSaved={load}
        />
      ) : null}
    </section>
  );
}
