import React, { useState } from 'react';
import { withAppBase } from '../../../services/api.js';
import { getGlToken } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';

export function GLPlayersExportPanel({ classFilter }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function exportCsv() {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const headers = new Headers();
      const token = getGlToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const search = new URLSearchParams();
      if (classFilter) search.set('classId', String(classFilter));
      const query = search.toString();
      const res = await fetch(
        withAppBase(`/api/gl/admin/players/export${query ? `?${query}` : ''}`),
        {
          method: 'GET',
          headers,
        },
      );
      if (!res.ok) throw new Error('Export impossible');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = classFilter
        ? `foretmap-gl-joueurs-classe-${classFilter}.csv`
        : 'foretmap-gl-joueurs.csv';
      link.click();
      URL.revokeObjectURL(url);
      setInfo('Export CSV généré.');
    } catch (err) {
      setError(err.message || 'Erreur export');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="gl-admin-section">
      <h3>Export joueurs</h3>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}
      <GLButton
        type="button"
        variant="secondary"
        onClick={exportCsv}
        disabled={loading}
        loading={loading}
      >
        Télécharger le CSV
      </GLButton>
    </section>
  );
}
