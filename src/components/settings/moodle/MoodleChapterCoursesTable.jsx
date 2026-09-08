import { useEffect, useState } from 'react';
import { chapterCoursesToRows, rowsToChapterCourses } from '../../../utils/moodleAdminReport.js';

/**
 * Table chapitre G&L → cours Moodle. Les **noms** des cours viennent de `GET /courses`
 * (`core_course_get_courses_by_field`) : un identifiant seul ne dit rien à un administrateur.
 */
export function MoodleChapterCoursesTable({ value, courses, chapters, onSave, saving, disabled }) {
  const [rows, setRows] = useState(() => chapterCoursesToRows(value));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setRows(chapterCoursesToRows(value));
  }, [value, dirty]);

  const infoByChapter = new Map((courses || []).map((r) => [Number(r.chapterId), r]));
  const chapterList =
    chapters && chapters.length
      ? chapters
      : (courses || []).map((r) => ({ id: r.chapterId, title: r.chapterTitle }));
  const usedChapters = new Set(rows.map((r) => r.chapterId));
  const freeChapters = chapterList.filter((c) => !usedChapters.has(Number(c.id)));

  const update = (index, patch) => {
    setDirty(true);
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };
  const remove = (index) => {
    setDirty(true);
    setRows((prev) => prev.filter((_, i) => i !== index));
  };
  const add = () => {
    if (!freeChapters.length) return;
    setDirty(true);
    setRows((prev) => [...prev, { chapterId: Number(freeChapters[0].id), courseId: '' }]);
  };
  const save = async () => {
    await onSave(rowsToChapterCourses(rows));
    setDirty(false);
  };

  return (
    <div data-testid="moodle-chapter-courses">
      <p className="section-sub" style={{ marginTop: 0 }}>
        Sert aux miroirs d’équipes (groupes de cours) et à l’entrée depuis le cours. Un cours ne
        correspond qu’à un seul chapitre.
      </p>
      <div className="moodle-table-wrap">
        <table className="moodle-table">
          <thead>
            <tr>
              <th scope="col">Chapitre</th>
              <th scope="col">Identifiant du cours</th>
              <th scope="col">Nom du cours (Moodle)</th>
              <th scope="col"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: 'var(--ink-soft)' }}>
                  Aucune correspondance réglée.
                </td>
              </tr>
            )}
            {rows.map((row, index) => {
              const info = infoByChapter.get(Number(row.chapterId));
              const sameCourse = info && Number(info.courseId) === Number(row.courseId);
              return (
                <tr key={`${row.chapterId}-${index}`}>
                  <td>
                    <select
                      aria-label={`Chapitre de la ligne ${index + 1}`}
                      value={row.chapterId}
                      onChange={(e) => update(index, { chapterId: Number(e.target.value) })}
                    >
                      {chapterList.map((c) => (
                        <option
                          key={c.id}
                          value={c.id}
                          disabled={
                            usedChapters.has(Number(c.id)) && Number(c.id) !== Number(row.chapterId)
                          }
                        >
                          {c.title || `Chapitre ${c.id}`}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      aria-label={`Cours de la ligne ${index + 1}`}
                      value={row.courseId}
                      onChange={(e) => update(index, { courseId: e.target.value })}
                      style={{ width: 110 }}
                    />
                  </td>
                  <td>
                    {sameCourse ? (
                      info.courseFound ? (
                        `${info.courseName} [${info.courseShortname}]`
                      ) : (
                        <span className="auth-error">Cours introuvable</span>
                      )
                    ) : (
                      <span style={{ color: 'var(--ink-soft)' }}>enregistrer pour voir le nom</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => remove(index)}
                      aria-label={`Retirer la ligne ${index + 1}`}
                    >
                      Retirer
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="moodle-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={add}
          disabled={disabled || !freeChapters.length}
        >
          Ajouter un chapitre
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={disabled || !dirty || saving}
          onClick={save}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer la table'}
        </button>
      </div>
    </div>
  );
}
