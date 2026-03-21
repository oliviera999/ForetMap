import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, AccountDeletedError } from './services/api';
import { useForetmapRealtime } from './hooks/useForetmapRealtime';
import { RT_PROF_TOOLTIPS } from './constants/realtime';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  Toast,
  MapView,
  TasksView,
  PlantManager,
  PlantViewer,
  ObservationNotebook,
  StudentStats,
  TeacherStats,
  AuditLog,
  AboutView,
} from './components/foretmap-views';
import { AuthScreen, PinModal } from './components/auth-views';

// ── APP ───────────────────────────────────────────────────────────────────────
function App() {
  const [student,    setStudent]    = useState(null);
  const [isTeacher,  setIsTeacher]  = useState(() => !!localStorage.getItem('foretmap_teacher_token'));
  const [showPin,    setShowPin]    = useState(false);
  const [showStats,  setShowStats]  = useState(false);
  const [tab,        setTab]        = useState('map');
  const [zones,      setZones]      = useState([]);
  const [tasks,      setTasks]      = useState([]);
  const [plants,     setPlants]     = useState([]);
  const [markers,    setMarkers]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [toast,      setToast]      = useState(null);
  const [appVersion, setAppVersion] = useState(null);
  const [refreshMs,  setRefreshMs]  = useState(30000);
  const [serverDown, setServerDown] = useState(false);
  const failCountRef = useRef(0);

  useEffect(() => {
    api('/api/version').then(d => setAppVersion(d.version)).catch(err => {
      console.error('[ForetMap] version app', err);
    });
  }, []);

  // Called from anywhere when a 401-deleted is detected
  const forceLogout = useCallback(() => {
    localStorage.removeItem('foretmap_student');
    localStorage.removeItem('foretmap_teacher_token');
    setStudent(null);
    setIsTeacher(false);
    setToast('Votre compte a été supprimé par le professeur.');
  }, []);

  // Restore session — validates against server on load
  useEffect(() => {
    const saved = localStorage.getItem('foretmap_student');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        setStudent(s); // show app immediately with cached data
        api('/api/students/register', 'POST', { studentId: s.id })
          .then(fresh => setStudent(fresh))
          .catch(err => {
            if (err instanceof AccountDeletedError || err.deleted) forceLogout();
            else console.error('[ForetMap] validation session élève', err);
          });
      } catch (e) { console.error('[ForetMap] lecture session locale', e); }
    }
  }, []);

  useEffect(() => {
    const onExpired = () => { setIsTeacher(false); setToast('Session professeur expirée.'); };
    window.addEventListener('foretmap_teacher_expired', onExpired);
    return () => window.removeEventListener('foretmap_teacher_expired', onExpired);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [z, t, p, m] = await Promise.all([
        api('/api/zones'), api('/api/tasks'), api('/api/plants'), api('/api/map/markers')
      ]);
      setZones(z); setTasks(t); setPlants(p); setMarkers(m);
      failCountRef.current = 0;
      setRefreshMs(30000);
      setServerDown(false);
    } catch(e) {
      if (e instanceof AccountDeletedError) forceLogout();
      else {
        console.error(e);
        const isServerSide = e.status == null || e.status >= 500;
        if (isServerSide) {
          failCountRef.current += 1;
          if (failCountRef.current >= 3) {
            setServerDown(true);
            setRefreshMs(120000);
          }
        }
      }
    }
    setLoading(false);
  }, [forceLogout]);

  const rtStatus = useForetmapRealtime({
    student,
    fetchAll,
    forceLogout,
    setTasks,
    setZones,
    setPlants,
    setMarkers,
  });

  useEffect(() => { fetchAll(); }, []);

  // Auto-refresh (30 s ; 2 min après 3 échecs serveur consécutifs)
  useEffect(() => {
    const id = setInterval(fetchAll, refreshMs);
    return () => clearInterval(id);
  }, [fetchAll, refreshMs]);

  const updateZone = async (id, data) => {
    await api(`/api/zones/${id}`, 'PUT', data);
    await fetchAll();
  };

  if (!student) return <AuthScreen onLogin={s => setStudent(s)} appVersion={appVersion}/>;
  if (loading) return (
    <div className="loader">
      <div className="loader-leaf">🌿</div>
      <p>Chargement de la forêt...</p>
    </div>
  );

  return (
    <div id="app">
      {serverDown && (
        <div className="fade-in" role="alert" style={{
          margin:'8px 12px 0', padding:'10px 14px', borderRadius:12,
          background:'#fef3c7', border:'1px solid #f59e0b', color:'#78350f', fontSize:'.9rem'
        }}>
          <strong>Serveur indisponible.</strong> Nouvel essai automatique toutes les 2 minutes.
          <button type="button" className="btn btn-sm" style={{marginLeft:10, verticalAlign:'middle'}}
            onClick={() => { failCountRef.current = 0; setRefreshMs(30000); setServerDown(false); fetchAll(); }}>
            Réessayer maintenant
          </button>
        </div>
      )}
      {toast && <Toast msg={toast} onDone={() => setToast(null)}/>}
      {showPin && <PinModal
        onSuccess={() => { setIsTeacher(true); setShowPin(false); setToast('Mode professeur activé 🔓'); }}
        onClose={() => setShowPin(false)}
      />}
      {showStats && !isTeacher && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowStats(false)}>
          <div className="log-modal fade-in" style={{maxHeight:'88vh'}}>
            <button className="modal-close" onClick={() => setShowStats(false)}>✕</button>
            <StudentStats student={student}/>
          </div>
        </div>
      )}

      <header>
        <div className="logo">
          <span>🌿</span> ForêtMap
        </div>
        <div className="header-right">
          {isTeacher && rtStatus !== 'off' && (
            <span
              className="realtime-prof-wrap"
              title={RT_PROF_TOOLTIPS[rtStatus] || ''}
              aria-label={RT_PROF_TOOLTIPS[rtStatus] || 'État du temps réel'}
              role="status"
            >
              <span className={`realtime-dot realtime-dot--${rtStatus}`} aria-hidden />
            </span>
          )}
          <button
            className="user-badge"
            onClick={() => !isTeacher && setShowStats(true)}
            style={{
              border:'none', cursor: isTeacher ? 'default' : 'pointer',
              background:'rgba(255,255,255,.15)', borderRadius:8,
              padding:'4px 10px', fontSize:'.8rem', color:'white',
              maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              display:'flex', alignItems:'center', gap:5,
            }}
            title={isTeacher ? '' : 'Voir mes statistiques'}
          >
            {!isTeacher && <span style={{fontSize:'.7rem', opacity:.7}}>📊</span>}
            {student.first_name} {student.last_name}
          </button>
          <button className={`lock-btn ${isTeacher ? 'active' : ''}`} onClick={() => {
            if (isTeacher) { setIsTeacher(false); localStorage.removeItem('foretmap_teacher_token'); setToast('Mode élève'); }
            else setShowPin(true);
          }}>
            {isTeacher ? <>🔓 <span className="lock-label">Prof</span></> : '🔒'}
          </button>
          <button className="lock-btn" title="Déconnexion" onClick={() => {
            localStorage.removeItem('foretmap_student');
            localStorage.removeItem('foretmap_teacher_token');
            setStudent(null); setIsTeacher(false);
          }}>↩️</button>
        </div>
      </header>

      {isTeacher ? (
        <div className="main teacher-main">
          <div className="top-tabs">
            <button className={`top-tab ${tab === 'map' ? 'active' : ''}`} onClick={() => setTab('map')}>🗺️ Carte & Zones</button>
            <button className={`top-tab ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
              ✅ Tâches {tasks.filter(t => t.status === 'done').length > 0 && `(${tasks.filter(t => t.status === 'done').length} à valider)`}
            </button>
            <button className={`top-tab ${tab === 'plants' ? 'active' : ''}`} onClick={() => setTab('plants')}>🌱 Plantes</button>
            <button className={`top-tab ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>📊 Stats</button>
            <button className={`top-tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}>📜 Audit</button>
            <button className={`top-tab ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>ℹ️ À propos</button>
          </div>
          {tab === 'map'    && <MapView zones={zones} markers={markers} plants={plants} isTeacher onZoneUpdate={updateZone} onRefresh={fetchAll}/>}
          {tab === 'tasks'  && <TasksView  tasks={tasks} zones={zones} isTeacher student={student} onRefresh={fetchAll} onForceLogout={forceLogout}/>}
          {tab === 'plants' && <PlantManager plants={plants} onRefresh={fetchAll}/>}
          {tab === 'stats'  && <TeacherStats/>}
          {tab === 'audit'  && <AuditLog/>}
          {tab === 'about'  && <AboutView appVersion={appVersion}/>}
        </div>
      ) : (
        <>
          <div className="main">
            {tab === 'map'    && <MapView zones={zones} markers={markers} plants={plants} isTeacher={false} onZoneUpdate={updateZone} onRefresh={fetchAll}/>}
            {tab === 'tasks'  && <TasksView tasks={tasks} zones={zones} isTeacher={false} student={student} onRefresh={fetchAll} onForceLogout={forceLogout}/>}
            {tab === 'plants' && <PlantViewer plants={plants} zones={zones}/>}
            {tab === 'notebook' && <ObservationNotebook student={student} zones={zones}/>}
            {tab === 'about' && <AboutView appVersion={appVersion}/>}
          </div>
          <nav className="bottom-nav">
            <button className={`nav-btn ${tab === 'map' ? 'active' : ''}`} onClick={() => setTab('map')}>
              <span className="nav-icon">🗺️</span> Carte
            </button>
            <button className={`nav-btn ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
              <span className="nav-icon">✅</span>
              Tâches {tasks.filter(t => t.assignments?.some(a => a.student_first_name === student.first_name && a.student_last_name === student.last_name) && (t.status === 'available' || t.status === 'in_progress')).length > 0
                && `(${tasks.filter(t => t.assignments?.some(a => a.student_first_name === student.first_name && a.student_last_name === student.last_name) && (t.status === 'available' || t.status === 'in_progress')).length})`}
            </button>
            <button className={`nav-btn ${tab === 'plants' ? 'active' : ''}`} onClick={() => setTab('plants')}>
              <span className="nav-icon">🌱</span> Plantes
            </button>
            <button className={`nav-btn ${tab === 'notebook' ? 'active' : ''}`} onClick={() => setTab('notebook')}>
              <span className="nav-icon">📓</span> Carnet
            </button>
            <button className={`nav-btn ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>
              <span className="nav-icon">ℹ️</span> À propos
            </button>
          </nav>
        </>
      )}
      <footer className="app-footer">Version {appVersion != null ? appVersion : '…'}</footer>
    </div>
  );
}


export { App };
