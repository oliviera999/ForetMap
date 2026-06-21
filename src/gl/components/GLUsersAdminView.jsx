import React, { useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLClassesPanel } from './admin/GLClassesPanel.jsx';
import { GLPlayersPanel } from './admin/GLPlayersPanel.jsx';
import { GLPlayersImportPanel } from './admin/GLPlayersImportPanel.jsx';
import { GLPlayersExportPanel } from './admin/GLPlayersExportPanel.jsx';
import { canGlStaffImpersonate } from '../utils/glStaffView.js';

export function GLUsersAdminView({
  auth = null,
  onImpersonationApplied = null,
  onClassesChange = null,
}) {
  const [classes, setClasses] = useState([]);
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState('');
  const [classFilter, setClassFilter] = useState('');

  async function reload(nextClassFilter = classFilter) {
    try {
      const playersUrl = nextClassFilter
        ? `/api/gl/admin/players?classId=${encodeURIComponent(nextClassFilter)}`
        : '/api/gl/admin/players';
      const [nextClasses, nextPlayers] = await Promise.all([
        apiGL('/api/gl/admin/classes'),
        apiGL(playersUrl),
      ]);
      setClasses(nextClasses || []);
      setPlayers(nextPlayers || []);
      setError('');
      // Synchronise la liste partagée (sélecteur de création de partie côté MJ).
      onClassesChange?.(nextClasses || []);
    } catch (err) {
      setError(err.message || 'Chargement impossible');
    }
  }

  useEffect(() => {
    reload(classFilter);
  }, [classFilter]);

  return (
    <section className="gl-panel gl-users-admin">
      <h2>Gestion utilisateurs</h2>
      {error ? <p className="gl-error">{error}</p> : null}

      <GLClassesPanel classes={classes} onReload={() => reload(classFilter)} />
      <GLPlayersPanel
        classes={classes}
        players={players}
        classFilter={classFilter}
        onClassFilterChange={setClassFilter}
        onReload={() => reload(classFilter)}
        canImpersonate={canGlStaffImpersonate(auth)}
        onImpersonationApplied={onImpersonationApplied}
      />
      <GLPlayersImportPanel onReload={() => reload(classFilter)} />
      <GLPlayersExportPanel classFilter={classFilter} />
    </section>
  );
}
