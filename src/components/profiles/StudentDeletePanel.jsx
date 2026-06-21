import React from 'react';

/**
 * Panneau « Suppression de {studentPlural} » (administration des profils).
 * Extrait de profiles-views.jsx (O6) — présentationnel pur : tout l’état et les
 * handlers sont fournis par ProfilesAdminView via les props. Comportement inchangé.
 * Le rendu reste conditionné à `canReadAllStats` côté parent.
 */
function StudentDeletePanel({
  roleTerms,
  canDeleteUi,
  canDuplicateStudents,
  searchStudent,
  filteredStudents,
  setSearchStudent,
  setConfirmStudent,
  duplicateStudent,
}) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 12,
        marginTop: 12,
        opacity: canDeleteUi ? 1 : 0.65,
      }}
    >
      <h3 style={{ marginTop: 0 }}>Suppression de {roleTerms.studentPlural}</h3>
      <div className="field" style={{ marginBottom: 10 }}>
        <input
          value={searchStudent}
          onChange={(e) => setSearchStudent(e.target.value)}
          placeholder={`🔍 Rechercher un(e) ${roleTerms.studentSingular}...`}
          style={{ background: 'white' }}
        />
      </div>
      <div style={{ maxHeight: 280, overflow: 'auto' }}>
        {filteredStudents.length === 0 ? (
          <p style={{ margin: 0, color: '#6b7280' }}>
            {searchStudent
              ? `Aucun(e) ${roleTerms.studentSingular} trouvé(e).`
              : `Aucun(e) ${roleTerms.studentSingular} disponible.`}
          </p>
        ) : (
          filteredStudents.map((s) => (
            <div className="profiles-admin-delete-row" key={s.id}>
              <div>
                <strong>
                  {s.first_name} {s.last_name}
                </strong>
                <div style={{ fontSize: '.78rem', color: '#6b7280' }}>
                  {s.stats?.done || 0} validée(s) · {s.stats?.pending || 0} en cours
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={!canDuplicateStudents}
                  onClick={() => duplicateStudent(s)}
                  title={
                    canDuplicateStudents
                      ? 'Dupliquer ce compte n3beur'
                      : 'Permission users.create + élévation requises'
                  }
                >
                  📄 Dupliquer
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={!canDeleteUi}
                  onClick={() => setConfirmStudent(s)}
                >
                  🗑️ Supprimer
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export { StudentDeletePanel };
